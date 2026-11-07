//! Transport-Level SSH Heartbeat Keepalive Monitor
//!
//! Emits `heartbeat-tick` every `interval` with measured round-trip latency,
//! and transitions to a transport-loss Error state after repeated failures.
//!
//! Root cause of the historical 45-second disconnect: the previous monitor
//! opened a fresh exec channel per ping (`channel_open_session` +
//! `exec(true, ":")`) while the session was configured with
//! `inactivity_timeout = connection_timeout_secs` (10s). russh garbage-collects
//! a session when nothing is *received* for `inactivity_timeout`, so the idle
//! session's loop task was reaped ~10s after the identity check. Every
//! subsequent ping then failed with `russh::Error::SendError` (Display:
//! "Channel send error") because the session loop had exited — three misses
//! later the app declared HEARTBEAT_TIMEOUT, exactly ~45s after
//! authentication, deterministically.
//!
//! This monitor now uses the protocol-appropriate, transport-level keepalive
//! exposed by the installed russh version:
//! - `russh::client::Config::keepalive_interval` / `keepalive_max` make the
//!   session loop itself emit `keepalive@openssh.com` global requests and exit
//!   with `Error::KeepaliveTimeout` after `keepalive_max` unanswered probes.
//! - `russh::client::Handle::send_ping()` performs the same global-request
//!   round-trip for latency measurement; its oneshot resolves on both
//!   REQUEST_SUCCESS and REQUEST_FAILURE, so `Ok(())` is valid evidence that
//!   the server responded. Liveness is additionally cross-checked with
//!   `Handle::is_closed()`, because `send_ping()` returns `Ok(())` even when
//!   the session loop exited between queueing the request and the reply.
//! Channel-level exec machinery is no longer involved: `SendError` on a probe
//! is treated as transport-level death, while inconclusive timeouts count as
//! misses toward `MAX_MISSES`.

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::models::{ConnectionStatus, HeartbeatTick, LogLevel};
use crate::ssh::SshManager;
use crate::AppState;

/// Per-probe round-trip budget before a ping is counted as inconclusive.
pub const PING_TIMEOUT_SECS: u64 = 5;
/// Consecutive inconclusive pings tolerated before a keepalive timeout.
pub const MAX_MISSES: u32 = 3;

pub struct HeartbeatController {
    cancel_token: CancellationToken,
}

impl HeartbeatController {
    pub fn new(cancel_token: CancellationToken) -> Self {
        Self { cancel_token }
    }

    pub fn stop(&self) {
        self.cancel_token.cancel();
    }
}

/// Outcome of a single keepalive probe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PingOutcome {
    /// The server answered the `keepalive@openssh.com` round-trip.
    Success { latency_ms: u32 },
    /// The session loop task has terminated (`russh::Error::SendError`) or
    /// exited between request and reply — a transport-level failure.
    SendFailed,
    /// No answer within the probe budget — inconclusive.
    TimedOut,
}

/// Verdict for a probe, given the observed session state and miss history.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeartbeatDecision {
    Healthy { latency_ms: u32 },
    Miss { consecutive_misses: u32 },
    Fatal { code: &'static str, reason: String },
}

/// Pure decision core, separated from I/O for targeted regression testing.
///
/// Rules:
/// - `SendFailed` is always fatal: it means the russh session-loop task is
///   gone (transport-level death), not merely a channel-level hiccup.
/// - Contradictory evidence (reply received but `is_closed()`) is fatal.
/// - `TimedOut` is inconclusive and accumulates misses; `max_misses`
///   consecutive timeouts declare a keepalive timeout.
pub fn evaluate_ping(
    outcome: &PingOutcome,
    session_closed: bool,
    misses_before: u32,
    max_misses: u32,
) -> HeartbeatDecision {
    match outcome {
        PingOutcome::Success { latency_ms } => {
            if session_closed {
                return HeartbeatDecision::Fatal {
                    code: "TRANSPORT_LOST",
                    reason: "Keepalive reply received but the SSH session loop has exited."
                        .to_string(),
                };
            }
            HeartbeatDecision::Healthy { latency_ms: *latency_ms }
        }
        PingOutcome::SendFailed => HeartbeatDecision::Fatal {
            code: "TRANSPORT_LOST",
            reason: "SSH transport session loop terminated (channel send error).".to_string(),
        },
        PingOutcome::TimedOut => {
            if session_closed {
                return HeartbeatDecision::Fatal {
                    code: "TRANSPORT_LOST",
                    reason: "Keepalive unanswered and the SSH session loop has exited."
                        .to_string(),
                };
            }
            let misses = misses_before + 1;
            if misses >= max_misses {
                HeartbeatDecision::Fatal {
                    code: "HEARTBEAT_TIMEOUT",
                    reason: format!(
                        "Connection lost: {} consecutive keepalive pings unanswered.",
                        max_misses
                    ),
                }
            } else {
                HeartbeatDecision::Miss { consecutive_misses: misses }
            }
        }
    }
}

/// Spawns the background heartbeat keepalive monitor loop.
///
/// The monitor is bound to the lifecycle `epoch` of the connection that
/// started it; it never reports on a connection it does not own.
#[allow(clippy::too_many_arguments)]
pub fn start_heartbeat<H: russh::client::Handler + Send + Sync + 'static>(
    handle: Arc<tokio::sync::Mutex<russh::client::Handle<H>>>,
    cancel_token: CancellationToken,
    manager: Arc<SshManager>,
    app: tauri::AppHandle,
    epoch: u64,
    interval_secs: u64,
) -> HeartbeatController {
    let controller = HeartbeatController::new(cancel_token.clone());
    let interval = Duration::from_secs(interval_secs.max(1));

    tokio::spawn(async move {
        run_heartbeat_loop(handle, cancel_token, manager, app, epoch, interval).await;
    });

    controller
}

async fn run_heartbeat_loop<H: russh::client::Handler + Send + Sync + 'static>(
    handle: Arc<tokio::sync::Mutex<russh::client::Handle<H>>>,
    cancel_token: CancellationToken,
    manager: Arc<SshManager>,
    app: tauri::AppHandle,
    epoch: u64,
    interval: Duration,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    // Consume initial tick immediately so first ping happens after interval
    ticker.tick().await;

    let mut consecutive_misses: u32 = 0;

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                break;
            }
            _ = ticker.tick() => {
                let (outcome, session_closed) = probe_transport(&handle).await;

                match evaluate_ping(&outcome, session_closed, consecutive_misses, MAX_MISSES) {
                    HeartbeatDecision::Healthy { latency_ms } => {
                        consecutive_misses = 0;
                        report_healthy_tick(&app, latency_ms);
                    }
                    HeartbeatDecision::Miss { consecutive_misses } => {
                        let state = app.state::<AppState>();
                        let log = state.add_log(
                            LogLevel::Warn,
                            format!(
                                "Keepalive ping unanswered after {}s ({}/{} missed)",
                                PING_TIMEOUT_SECS, consecutive_misses, MAX_MISSES
                            ),
                        );
                        let _ = app.emit("log-entry", log);
                    }
                    HeartbeatDecision::Fatal { code, reason } => {
                        manager.declare_transport_loss(&app, epoch, code, reason);
                        break;
                    }
                }
            }
        }
    }
}

/// Performs one transport-level keepalive round-trip and returns the outcome
/// together with the observed session-closed state.
///
/// No exec channel is opened: `Handle::send_ping()` sends an SSH global
/// request (`keepalive@openssh.com`, want_reply) through the session loop.
async fn probe_transport<H: russh::client::Handler + Send + Sync + 'static>(
    handle: &Arc<tokio::sync::Mutex<russh::client::Handle<H>>>,
) -> (PingOutcome, bool) {
    let start = Instant::now();
    let session = handle.lock().await;

    // A closed session loop is transport-level death on its own.
    if session.is_closed() {
        return (PingOutcome::SendFailed, true);
    }

    let outcome = match tokio::time::timeout(
        Duration::from_secs(PING_TIMEOUT_SECS),
        session.send_ping(),
    )
    .await
    {
        // A reply is only valid evidence while the session loop is still
        // alive: send_ping() resolves its oneshot as Ok even when the loop
        // exited between queueing the request and the reply.
        Ok(Ok(())) => {
            if session.is_closed() {
                PingOutcome::SendFailed
            } else {
                PingOutcome::Success { latency_ms: start.elapsed().as_millis() as u32 }
            }
        }
        Ok(Err(russh::Error::SendError)) => PingOutcome::SendFailed,
        Ok(Err(_)) | Err(_) => PingOutcome::TimedOut,
    };

    let closed = session.is_closed();
    (outcome, closed)
}

fn report_healthy_tick(app: &tauri::AppHandle, latency_ms: u32) {
    let state = app.state::<AppState>();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let tick = HeartbeatTick { latency_ms, timestamp: now };
    let _ = app.emit("heartbeat-tick", &tick);

    // Update current latency in AppState
    if let Ok(mut status) = state.status.lock() {
        if let ConnectionStatus::Connected { latency_ms: ref mut lat, .. } = *status {
            *lat = Some(latency_ms);
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------
    // Regression tests for the confirmed 45-second disconnect mechanism
    // ------------------------------------------------------------------

    #[test]
    fn test_send_error_is_fatal_transport_loss() {
        // The historical failure: every ping returned "Channel send error"
        // (russh::Error::SendError) because the session loop had been reaped.
        // This must be an immediate transport-level verdict, not a
        // channel-level miss that waits for 3 strikes.
        let decision = evaluate_ping(&PingOutcome::SendFailed, false, 0, MAX_MISSES);
        assert_eq!(
            decision,
            HeartbeatDecision::Fatal {
                code: "TRANSPORT_LOST",
                reason: "SSH transport session loop terminated (channel send error).".to_string(),
            }
        );
    }

    #[test]
    fn test_send_error_fatal_even_with_miss_history() {
        let decision = evaluate_ping(&PingOutcome::SendFailed, false, 2, MAX_MISSES);
        assert!(matches!(decision, HeartbeatDecision::Fatal { code: "TRANSPORT_LOST", .. }));
    }

    #[test]
    fn test_success_with_closed_session_is_fatal_contradiction() {
        // russh's send_ping() returns Ok even when the reply oneshot was
        // dropped by an exited session loop; contradictory evidence must not
        // be reported as healthy.
        let decision = evaluate_ping(
            &PingOutcome::Success { latency_ms: 3 },
            true,
            0,
            MAX_MISSES,
        );
        assert!(matches!(decision, HeartbeatDecision::Fatal { code: "TRANSPORT_LOST", .. }));
    }

    #[test]
    fn test_success_with_open_session_is_healthy() {
        let decision = evaluate_ping(
            &PingOutcome::Success { latency_ms: 42 },
            false,
            2,
            MAX_MISSES,
        );
        assert_eq!(decision, HeartbeatDecision::Healthy { latency_ms: 42 });
    }

    #[test]
    fn test_timeout_accumulates_misses_then_fatal() {
        let d1 = evaluate_ping(&PingOutcome::TimedOut, false, 0, MAX_MISSES);
        assert_eq!(d1, HeartbeatDecision::Miss { consecutive_misses: 1 });

        let d2 = evaluate_ping(&PingOutcome::TimedOut, false, 1, MAX_MISSES);
        assert_eq!(d2, HeartbeatDecision::Miss { consecutive_misses: 2 });

        let d3 = evaluate_ping(&PingOutcome::TimedOut, false, 2, MAX_MISSES);
        assert!(matches!(d3, HeartbeatDecision::Fatal { code: "HEARTBEAT_TIMEOUT", .. }));
    }

    #[test]
    fn test_timeout_with_closed_session_is_fatal_immediately() {
        let decision = evaluate_ping(&PingOutcome::TimedOut, true, 0, MAX_MISSES);
        assert!(matches!(decision, HeartbeatDecision::Fatal { code: "TRANSPORT_LOST", .. }));
    }

    #[test]
    fn test_healthy_ping_resets_miss_history() {
        let after_misses = 2;
        let decision = evaluate_ping(
            &PingOutcome::Success { latency_ms: 7 },
            false,
            after_misses,
            MAX_MISSES,
        );
        assert_eq!(decision, HeartbeatDecision::Healthy { latency_ms: 7 });
        // A subsequent single timeout must count from 0 again, not 3.
        let next = evaluate_ping(&PingOutcome::TimedOut, false, 0, MAX_MISSES);
        assert_eq!(next, HeartbeatDecision::Miss { consecutive_misses: 1 });
    }

    // ------------------------------------------------------------------
    // Regression test for the russh client configuration (root cause)
    // ------------------------------------------------------------------

    #[test]
    fn test_russh_config_does_not_reap_idle_sessions() {
        // ROOT CAUSE REGRESSION: inactivity_timeout must not be armed with the
        // TCP connect timeout; transport keepalive must be enabled instead.
        let cfg = crate::models::AppConfig::default();
        let rcfg = super::super::build_russh_config(&cfg);

        assert!(
            rcfg.inactivity_timeout.is_none(),
            "inactivity_timeout must stay disabled: arming it with connection_timeout_secs ({}s) reaped healthy idle sessions and caused the 45-second disconnect loop",
            cfg.connection_timeout_secs
        );
        assert_eq!(
            rcfg.keepalive_interval,
            Some(Duration::from_secs(cfg.heartbeat_interval_secs)),
            "transport-level keepalive must be enabled and aligned with the heartbeat interval"
        );
        assert_eq!(
            rcfg.keepalive_max, MAX_MISSES as usize,
            "keepalive_max must match the heartbeat monitor's miss threshold"
        );
    }
}
