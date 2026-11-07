//! Live Runtime Validation (Gate E)
//!
//! Exercises the production SSH code path against the real remote host:
//!   1. russh connect using `build_russh_config` (the corrected configuration).
//!   2. Host-key verification against the user's known_hosts (production handler).
//!   3. Tier-2 keyring authentication (Windows Credential Manager) — Tier-3
//!      interactive prompts are NOT performed: without stored credentials the
//!      test reports NOT-VERIFIED instead of asking for a password.
//!   4. Remote identity verification (remote_check pipeline).
//!   5. 10-minute keepalive soak using the same `probe_transport` primitive the
//!      production heartbeat monitor uses, validating no false disconnections.
//!   6. Graceful manual disconnect.
//!
//! Ignored by default; run explicitly:
//!   cargo test --test live_validation -- --ignored --nocapture
//!
//! Requires the remote Mac to be online and reachable.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, Mutex};

use wds_connect_lib::models::AppConfig;
use wds_connect_lib::ssh::client::WdsSshClientHandler;
use wds_connect_lib::ssh::heartbeat::{evaluate_ping, PingOutcome, PING_TIMEOUT_SECS, MAX_MISSES};
use wds_connect_lib::ssh::known_hosts;
use wds_connect_lib::ssh::remote_check::execute_remote_identity_check;
use wds_connect_lib::ssh::{build_russh_config, HEARTBEAT_SOAK_SECS};

fn remote_reachable() -> bool {
    // Quick TCP reachability probe so an offline Mac yields NOT-VERIFIED fast.
    std::net::TcpStream::connect_timeout(
        &format!("{}:{}", AppConfig::default().remote_host, AppConfig::default().remote_port)
            .parse()
            .unwrap(),
        Duration::from_secs(3),
    )
    .is_ok()
}

/// Responds true to first-time host-key challenges only; rejects changed keys.
async fn auto_resolve_host_challenges(mut rx: mpsc::Receiver<wds_connect_lib::ssh::client::HandlerEvent>) {
    use wds_connect_lib::ssh::client::HandlerEvent;
    while let Some(event) = rx.recv().await {
        match event {
            HandlerEvent::Banner(_) => {}
            HandlerEvent::HostKeyChallenge { is_changed, responder, .. } => {
                // Security posture: never silently accept a CHANGED host key.
                let _ = responder.send(!is_changed);
            }
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_soak_10_minute_keepalive_stability() {
    let cfg = AppConfig::default();

    if !remote_reachable() {
        eprintln!("NOT VERIFIED: remote {}:{} unreachable (Mac offline?)", cfg.remote_host, cfg.remote_port);
        return;
    }

    // Tier-2 credential availability from Windows Credential Manager only.
    let password = match wds_connect_lib::storage::keyring::get_saved_password(
        &cfg.remote_user,
        &cfg.remote_host,
        cfg.remote_port,
    ) {
        Ok(Some(p)) => p,
        _ => {
            eprintln!("NOT VERIFIED: no stored credentials in Windows Credential Manager for {}@{}; refusing interactive password prompt.", cfg.remote_user, cfg.remote_host);
            return;
        }
    };

    // 1. Connect with the production configuration.
    let rcfg = Arc::new(build_russh_config(&cfg));
    assert!(
        rcfg.inactivity_timeout.is_none() && rcfg.keepalive_interval.is_some(),
        "production config must not reap idle sessions and must enable transport keepalive"
    );

    let (event_tx, event_rx) = mpsc::channel(16);
    tokio::spawn(auto_resolve_host_challenges(event_rx));

    let handler = WdsSshClientHandler::new(cfg.remote_host.clone(), cfg.remote_port, event_tx);
    let mut handle = tokio::time::timeout(
        Duration::from_secs(cfg.connection_timeout_secs),
        russh::client::connect(rcfg, (cfg.remote_host.as_str(), cfg.remote_port), handler),
    )
    .await
    .expect("connect timed out")
    .expect("connect failed");

    // 2. Authenticate (keyring Tier-2 only; never loop password prompts).
    let auth = tokio::time::timeout(
        Duration::from_secs(30),
        handle.authenticate_password(&cfg.remote_user, password.as_str()),
    )
    .await
    .expect("auth timed out")
    .expect("auth transport error");
    assert!(auth.success(), "keyring password authentication rejected — NOT VERIFIED (auth)");
    eprintln!("PASS: authentication (keyring) succeeded");

    // 3. Remote identity verification.
    let identity = tokio::time::timeout(
        Duration::from_secs(cfg.connection_timeout_secs),
        execute_remote_identity_check(&mut handle, &cfg.remote_user, cfg.connection_timeout_secs),
    )
    .await
    .expect("identity check timed out")
    .expect("identity check failed");
    eprintln!("PASS: remote identity verified: {}", identity.display_summary());
    assert!(identity.display_summary().contains("Darwin"));

    // 4. 10-minute keepalive soak with the production probe + decision core.
    let shared = Arc::new(Mutex::new(handle));
    let soak = Duration::from_secs(HEARTBEAT_SOAK_SECS);
    let started = Instant::now();
    let mut ticks: u64 = 0;
    let mut misses: u32 = 0;

    eprintln!("Soak started: holding session for {}s with {}s keepalive interval...", HEARTBEAT_SOAK_SECS, cfg.heartbeat_interval_secs);
    while started.elapsed() < soak {
        tokio::time::sleep(Duration::from_secs(cfg.heartbeat_interval_secs)).await;

        // Same sequence the production monitor performs per tick.
        let (outcome, closed) = {
            let start = Instant::now();
            let session = shared.lock().await;
            if session.is_closed() {
                (PingOutcome::SendFailed, true)
            } else {
                match tokio::time::timeout(Duration::from_secs(PING_TIMEOUT_SECS), session.send_ping()).await {
                    Ok(Ok(())) => {
                        if session.is_closed() {
                            (PingOutcome::SendFailed, true)
                        } else {
                            (PingOutcome::Success { latency_ms: start.elapsed().as_millis() as u32 }, false)
                        }
                    }
                    Ok(Err(russh::Error::SendError)) => (PingOutcome::SendFailed, true),
                    _ => (PingOutcome::TimedOut, session.is_closed()),
                }
            }
        };

        match evaluate_ping(&outcome, closed, misses, MAX_MISSES) {
            wds_connect_lib::ssh::heartbeat::HeartbeatDecision::Healthy { latency_ms } => {
                if misses > 0 {
                    eprintln!("  recovered after {} miss(es)", misses);
                }
                misses = 0;
                ticks += 1;
                eprintln!("  tick #{:>3}  latency {} ms  (elapsed {}s)", ticks, latency_ms, started.elapsed().as_secs());
            }
            wds_connect_lib::ssh::heartbeat::HeartbeatDecision::Miss { consecutive_misses } => {
                misses = consecutive_misses;
                eprintln!("  MISS {}/{} (inconclusive)", consecutive_misses, MAX_MISSES);
            }
            wds_connect_lib::ssh::heartbeat::HeartbeatDecision::Fatal { code, reason } => {
                let _ = known_hosts::resolve_known_hosts_path(); // keep module linked
                panic!("FALSE DISCONNECTION ({}): {} after {:.0}s — transport keepalive failed on a live session", code, reason, started.elapsed().as_secs());
            }
        }
    }

    // 5. Manual graceful disconnect.
    {
        let session = shared.lock().await;
        let _ = tokio::time::timeout(
            Duration::from_millis(1500),
            session.disconnect(russh::Disconnect::ByApplication, "Live validation complete", "en"),
        )
        .await;
    }
    eprintln!("PASS: session remained healthy for {}s across {} successful keepalive ticks; graceful disconnect completed.", HEARTBEAT_SOAK_SECS, ticks);
}

/// Verifies the live disconnect -> reconnect cycle: a second full connection
/// (keyring auth + identity verification) succeeds after a clean disconnect.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_reconnect_after_clean_disconnect() {
    let cfg = AppConfig::default();

    if !remote_reachable() {
        eprintln!("NOT VERIFIED: remote unreachable");
        return;
    }
    let password = match wds_connect_lib::storage::keyring::get_saved_password(
        &cfg.remote_user,
        &cfg.remote_host,
        cfg.remote_port,
    ) {
        Ok(Some(p)) => p,
        _ => {
            eprintln!("NOT VERIFIED: no stored credentials; refusing interactive prompt.");
            return;
        }
    };

    let connect_once = || async {
        let (event_tx, event_rx) = mpsc::channel(16);
        tokio::spawn(auto_resolve_host_challenges(event_rx));
        let handler = WdsSshClientHandler::new(cfg.remote_host.clone(), cfg.remote_port, event_tx);
        let mut h = tokio::time::timeout(
            Duration::from_secs(cfg.connection_timeout_secs),
            russh::client::connect(Arc::new(build_russh_config(&cfg)), (cfg.remote_host.as_str(), cfg.remote_port), handler),
        )
        .await
        .expect("connect timed out")
        .expect("connect failed");
        let auth = tokio::time::timeout(
            Duration::from_secs(30),
            h.authenticate_password(&cfg.remote_user, password.as_str()),
        )
        .await
        .expect("auth timed out")
        .expect("auth transport error");
        assert!(auth.success(), "keyring auth rejected");
        let identity = tokio::time::timeout(
            Duration::from_secs(cfg.connection_timeout_secs),
            execute_remote_identity_check(&mut h, &cfg.remote_user, cfg.connection_timeout_secs),
        )
        .await
        .expect("identity check timed out")
        .expect("identity check failed");
        (h, identity)
    };

    // Session 1: connect, verify, disconnect.
    let (mut h1, id1) = connect_once().await;
    eprintln!("PASS: first connection verified: {}", id1.display_summary());
    let _ = tokio::time::timeout(
        Duration::from_millis(1500),
        h1.disconnect(russh::Disconnect::ByApplication, "Reconnect test: clean disconnect", "en"),
    )
    .await;
    drop(h1);
    tokio::time::sleep(Duration::from_secs(2)).await;

    // Session 2: fresh connection after clean disconnect (reconnection).
    let (mut h2, id2) = connect_once().await;
    eprintln!("PASS: reconnection after clean disconnect verified: {}", id2.display_summary());
    assert_eq!(id1.display_summary(), id2.display_summary(), "remote identity must be stable across reconnections");
    let _ = tokio::time::timeout(
        Duration::from_millis(1500),
        h2.disconnect(russh::Disconnect::ByApplication, "Reconnect test complete", "en"),
    )
    .await;
    eprintln!("PASS: disconnect and reconnection cycle complete.");
}
