//! SSH Subsystem Coordinator and SshManager Lifecycle Engine

pub mod client;
pub mod known_hosts;
pub mod remote_check;
pub mod auth;
pub mod heartbeat;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::models::{AppConfig, ConnectionStatus, LogLevel};
use crate::AppState;
use auth::AuthRendezvous;
use client::{HandlerEvent, WdsSshClientHandler};

/// Stores pending host key challenge state awaiting UI response
pub struct PendingHostKeyChallenge {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint_sha256: String,
    pub wire_bytes: Vec<u8>,
    pub is_changed: bool,
    pub responder: oneshot::Sender<bool>,
}

/// Primary coordinator for all SSH connections, handles, and background tasks
pub struct SshManager {
    /// Active connected russh session handle
    session_handle: tokio::sync::Mutex<Option<Arc<tokio::sync::Mutex<russh::client::Handle<WdsSshClientHandler>>>>>,
    /// Cancellation token for active connection or authentication attempt
    connect_cancel_token: Mutex<Option<CancellationToken>>,
    /// Cancellation token for active keepalive heartbeat loop
    heartbeat_cancel_token: Mutex<Option<CancellationToken>>,
    /// Active host key confirmation rendezvous
    pending_host_key: Mutex<Option<PendingHostKeyChallenge>>,
    /// Multi-tier auth rendezvous
    pub auth_rendezvous: Arc<AuthRendezvous>,
    /// Monotonic connection-lifecycle epoch. Incremented on every user-intent
    /// lifecycle entry point (connect, disconnect, cancel_auth). Long-lived
    /// background tasks (heartbeat monitor, auto-reconnect driver) capture the
    /// epoch at spawn and must re-verify it before mutating shared state, so a
    /// stale task can never alter the state of a newer connection.
    epoch: AtomicU64,
    /// Set while a connection workflow is running; prevents duplicate
    /// concurrent connection attempts (TOCTOU on the status precheck).
    connect_in_progress: AtomicBool,
}

impl Default for SshManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            session_handle: tokio::sync::Mutex::new(None),
            connect_cancel_token: Mutex::new(None),
            heartbeat_cancel_token: Mutex::new(None),
            pending_host_key: Mutex::new(None),
            auth_rendezvous: Arc::new(AuthRendezvous::new()),
            epoch: AtomicU64::new(0),
            connect_in_progress: AtomicBool::new(false),
        }
    }

    /// Starts a new lifecycle epoch and returns its id.
    fn next_epoch(&self) -> u64 {
        self.epoch.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Current lifecycle epoch.
    fn current_epoch(&self) -> u64 {
        self.epoch.load(Ordering::SeqCst)
    }

    /// Transitions connection status synchronously in AppState and broadcasts IPC event
    pub fn set_status(&self, app: &tauri::AppHandle, new_status: ConnectionStatus) {
        let state = app.state::<AppState>();
        {
            let mut status = state.status.lock().unwrap();
            *status = new_status.clone();
        }
        let _ = app.emit("connection-status-changed", &new_status);
    }

    /// User-initiated Connect entry point.
    /// Bumps the lifecycle epoch (invalidating any stale heartbeat monitor or
    /// auto-reconnect driver from a previous lifecycle), tears down leftover
    /// cancellation tokens, then delegates to the internal workflow.
    pub async fn connect(self: &Arc<Self>, app: &tauri::AppHandle) -> Result<(), String> {
        let epoch = self.next_epoch();
        if let Some(token) = self.heartbeat_cancel_token.lock().unwrap().take() {
            token.cancel();
        }
        if let Some(token) = self.connect_cancel_token.lock().unwrap().take() {
            token.cancel();
        }
        self.connect_internal(app, epoch).await
    }

    /// Non-blocking Connect workflow.
    ///
    /// `epoch` is the lifecycle epoch captured by the caller: either a user
    /// click (`connect`) or a bounded automatic reconnection attempt. All
    /// background tasks spawned by this workflow own this epoch value and are
    /// required to re-verify it before mutating shared state.
    pub async fn connect_internal(
        self: &Arc<Self>,
        app: &tauri::AppHandle,
        epoch: u64,
    ) -> Result<(), String> {
        // Duplicate-connect guard: exactly one workflow may run at a time.
        // The guard flag is cleared on every exit path via ConnectGuard's Drop.
        if self
            .connect_in_progress
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("A connection attempt is already in progress".to_string());
        }
        let _connect_guard = ConnectGuard {
            flag: &self.connect_in_progress,
        };

        let state = app.state::<AppState>();
        let cfg = {
            let status = state.status.lock().unwrap();
            if *status != ConnectionStatus::Disconnected && !matches!(*status, ConnectionStatus::Error { .. }) {
                return Err("Cannot connect: session is not disconnected".to_string());
            }
            state.config.lock().unwrap().clone()
        };

        // 1. Set Connecting status
        let connecting_status = ConnectionStatus::Connecting {
            host: cfg.remote_host.clone(),
            port: cfg.remote_port,
        };
        self.set_status(app, connecting_status);

        let log = state.add_log(
            LogLevel::Info,
            format!("Initiating non-blocking SSH connection to {}@{}:{}...", cfg.remote_user, cfg.remote_host, cfg.remote_port),
        );
        let _ = app.emit("log-entry", log);

        // 2. Setup cancellation token
        let cancel_token = CancellationToken::new();
        {
            let mut guard = self.connect_cancel_token.lock().unwrap();
            *guard = Some(cancel_token.clone());
        }

        // 3. Setup event channel for Handler
        let (event_tx, mut event_rx) = mpsc::channel::<HandlerEvent>(16);

        // 4. Background task to monitor Handler events (host key prompts, banners)
        let app_clone = app.clone();
        let manager_clone = self.clone();

        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                let state_inner = app_clone.state::<AppState>();
                match event {
                    HandlerEvent::HostKeyChallenge {
                        host,
                        port,
                        key_type,
                        fingerprint_sha256,
                        fingerprint_md5: _,
                        wire_bytes,
                        is_changed,
                        responder,
                    } => {
                        let challenge = ConnectionStatus::HostKeyVerificationPending {
                            host: host.clone(),
                            port,
                            key_type: key_type.clone(),
                            fingerprint_sha256: fingerprint_sha256.clone(),
                            is_changed,
                        };

                        {
                            let mut status = state_inner.status.lock().unwrap();
                            *status = challenge.clone();
                        }
                        let _ = app_clone.emit("connection-status-changed", &challenge);

                        let entry = state_inner.add_log(
                            LogLevel::Warn,
                            format!("Host key verification required for {}:{} ({}, {})", host, port, key_type, fingerprint_sha256),
                        );
                        let _ = app_clone.emit("log-entry", entry);

                        // Store pending challenge in manager
                        {
                            let mut guard = manager_clone.pending_host_key.lock().unwrap();
                            *guard = Some(PendingHostKeyChallenge {
                                host,
                                port,
                                key_type,
                                fingerprint_sha256,
                                wire_bytes,
                                is_changed,
                                responder,
                            });
                        }
                    }
                    HandlerEvent::Banner(banner) => {
                        let entry = state_inner.add_log(
                            LogLevel::Ssh,
                            format!("SSH pre-auth banner: {}", banner.trim()),
                        );
                        let _ = app_clone.emit("log-entry", entry);
                    }
                }
            }
        });

        // 5. Connect to remote host with cancellation & timeout
        let russh_config = Arc::new(build_russh_config(&cfg));
        let handler = WdsSshClientHandler::new(cfg.remote_host.clone(), cfg.remote_port, event_tx);

        let timeout_duration = Duration::from_secs(cfg.connection_timeout_secs);
        let start_connect_time = Instant::now();

        let connect_future = russh::client::connect(
            russh_config,
            (cfg.remote_host.as_str(), cfg.remote_port),
            handler,
        );

        let connect_result = tokio::select! {
            _ = cancel_token.cancelled() => {
                self.set_status(app, ConnectionStatus::Disconnected);
                let log = state.add_log(LogLevel::Info, "SSH connection attempt aborted by user.");
                let _ = app.emit("log-entry", log);
                return Err("Connection cancelled by user".to_string());
            }
            res = tokio::time::timeout(timeout_duration, connect_future) => {
                match res {
                    Ok(Ok(handle)) => Ok(handle),
                    Ok(Err(e)) => Err(format!("SSH transport error: {e}")),
                    Err(_) => Err(format!("TCP connection timed out after {} seconds", cfg.connection_timeout_secs)),
                }
            }
        };

        let mut handle = match connect_result {
            Ok(h) => h,
            Err(err_msg) => {
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                let err_status = ConnectionStatus::Error {
                    code: "CONNECTION_FAILED".to_string(),
                    message: err_msg.clone(),
                    timestamp: now,
                };
                self.set_status(app, err_status);
                let log = state.add_log(LogLevel::Error, format!("Connection failed: {}", err_msg));
                let _ = app.emit("log-entry", log);
                return Err(err_msg);
            }
        };

        // 6. Authenticate pipeline (Tier 1 -> Tier 2 -> Tier 3)
        let auth_res = auth::authenticate_session(&mut handle, &cfg, &self.auth_rendezvous, app, &state, &cancel_token).await;
        if let Err(e) = auth_res {
            let _ = handle.disconnect(russh::Disconnect::ByApplication, "Auth failed", "en").await;
            if !matches!(e, auth::AuthPipelineError::Cancelled) {
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                let err_status = ConnectionStatus::Error {
                    code: "AUTHENTICATION_FAILED".to_string(),
                    message: e.to_string(),
                    timestamp: now,
                };
                self.set_status(app, err_status);
            } else {
                self.set_status(app, ConnectionStatus::Disconnected);
            }
            return Err(e.to_string());
        }

        // 7. Harmless remote identity check with cancellation protection
        let verifying_status = ConnectionStatus::VerifyingIdentity { command: cfg.identity_check_command.clone() };
        self.set_status(app, verifying_status);

        let check_future = remote_check::execute_remote_identity_check(&mut handle, &cfg.remote_user, cfg.connection_timeout_secs);

        let identity_res = tokio::select! {
            biased;
            _ = cancel_token.cancelled() => {
                let _ = handle.disconnect(russh::Disconnect::ByApplication, "Connection cancelled by user", "en").await;
                self.set_status(app, ConnectionStatus::Disconnected);
                let log = state.add_log(LogLevel::Info, "SSH connection attempt aborted by user during identity check.");
                let _ = app.emit("log-entry", log);
                return Err("Connection cancelled by user".to_string());
            }
            res = check_future => {
                if cancel_token.is_cancelled() {
                    let _ = handle.disconnect(russh::Disconnect::ByApplication, "Connection cancelled by user", "en").await;
                    self.set_status(app, ConnectionStatus::Disconnected);
                    let log = state.add_log(LogLevel::Info, "SSH connection attempt aborted by user.");
                    let _ = app.emit("log-entry", log);
                    return Err("Connection cancelled by user".to_string());
                }
                res
            }
        };

        let identity_info = match identity_res {
            Ok(info) => info,
            Err(e) => {
                let _ = handle.disconnect(russh::Disconnect::ByApplication, "Identity check failed", "en").await;
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                let err_status = ConnectionStatus::Error {
                    code: "IDENTITY_CHECK_FAILED".to_string(),
                    message: e.to_string(),
                    timestamp: now,
                };
                self.set_status(app, err_status);
                let log = state.add_log(LogLevel::Error, format!("Remote identity verification failed: {}", e));
                let _ = app.emit("log-entry", log);
                return Err(e.to_string());
            }
        };

        // 8. Mandatory Invariant: Transition to Connected ONLY after identity verification succeeds
        let initial_latency_ms = start_connect_time.elapsed().as_millis() as u32;
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let connected_status = ConnectionStatus::Connected {
            remote_host: cfg.remote_host.clone(),
            remote_user: cfg.remote_user.clone(),
            remote_identity: identity_info.display_summary(),
            connected_at: now,
            latency_ms: Some(initial_latency_ms),
        };
        self.set_status(app, connected_status);

        let log = state.add_log(
            LogLevel::Info,
            format!("Connected to {} ({})", cfg.remote_host, identity_info.display_summary()),
        );
        let _ = app.emit("log-entry", log);

        // Store active session handle in Arc<Mutex>. The lifecycle epoch is
        // re-verified while holding the publication lock: if a user-intent
        // disconnect/cancel raced this workflow, the freshly established
        // session is torn down here instead of leaking past a Disconnected
        // state.
        let shared_handle = Arc::new(tokio::sync::Mutex::new(handle));
        let published = {
            let mut session_guard = self.session_handle.lock().await;
            if self.current_epoch() != epoch {
                false
            } else {
                *session_guard = Some(shared_handle.clone());
                true
            }
        };

        if !published {
            let teardown = async {
                let session = shared_handle.lock().await;
                let _ = session
                    .disconnect(
                        russh::Disconnect::ByApplication,
                        "Superseded by a newer connection lifecycle",
                        "en",
                    )
                    .await;
            };
            let _ = tokio::time::timeout(Duration::from_millis(1500), teardown).await;
            self.set_status(app, ConnectionStatus::Disconnected);
            let log = state.add_log(
                LogLevel::Info,
                "Connection superseded by a newer lifecycle; session discarded.",
            );
            let _ = app.emit("log-entry", log);
            return Err("Connection superseded by a newer attempt".to_string());
        }

        // 9. Start background keepalive heartbeat loop
        let heartbeat_token = CancellationToken::new();
        {
            let mut hb_guard = self.heartbeat_cancel_token.lock().unwrap();
            *hb_guard = Some(heartbeat_token.clone());
        }
        heartbeat::start_heartbeat(
            shared_handle,
            heartbeat_token,
            self.clone(),
            app.clone(),
            epoch,
            cfg.heartbeat_interval_secs,
        );

        Ok(())
    }

    /// Clean Disconnect Teardown workflow
    pub async fn disconnect(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let state = app.state::<AppState>();

        // New lifecycle epoch: invalidates any stale heartbeat monitor or
        // auto-reconnect driver belonging to the session being torn down.
        let _ = self.next_epoch();

        // Transition to Disconnecting
        self.set_status(app, ConnectionStatus::Disconnecting);
        let log = state.add_log(LogLevel::Info, "Initiating graceful SSH session termination...");
        let _ = app.emit("log-entry", log);

        // Cancel connection attempt or heartbeat loop
        if let Some(token) = self.connect_cancel_token.lock().unwrap().take() {
            token.cancel();
        }
        if let Some(token) = self.heartbeat_cancel_token.lock().unwrap().take() {
            token.cancel();
        }

        // Abort pending challenge prompts
        if let Some(challenge) = self.pending_host_key.lock().unwrap().take() {
            let _ = challenge.responder.send(false);
        }
        self.auth_rendezvous.cancel();

        // Close russh session handle cleanly with timeout
        let handle_opt = {
            let mut session_guard = self.session_handle.lock().await;
            session_guard.take()
        };

        if let Some(shared_handle) = handle_opt {
            let disconnect_future = async {
                let handle = shared_handle.lock().await;
                let _ = handle.disconnect(
                    russh::Disconnect::ByApplication,
                    "User requested disconnect",
                    "en",
                ).await;
            };
            let _ = tokio::time::timeout(Duration::from_millis(1500), disconnect_future).await;
        }

        // Transition to Disconnected
        self.set_status(app, ConnectionStatus::Disconnected);
        let log = state.add_log(LogLevel::Info, "SSH session disconnected cleanly.");
        let _ = app.emit("log-entry", log);

        Ok(())
    }

    /// User confirmed or rejected host key
    pub async fn confirm_host_key(
        &self,
        approved: bool,
        remember: bool,
    ) -> Result<(), String> {
        let challenge = self.pending_host_key.lock().unwrap().take();
        if let Some(ch) = challenge {
            if approved && remember {
                if let Ok(path) = known_hosts::resolve_known_hosts_path() {
                    let _ = if ch.is_changed {
                        known_hosts::replace_known_host(&path, &ch.host, ch.port, &ch.key_type, &ch.wire_bytes)
                    } else {
                        known_hosts::append_to_known_hosts(&path, &ch.host, ch.port, &ch.key_type, &ch.wire_bytes)
                    };
                }
            }
            let _ = ch.responder.send(approved);
            Ok(())
        } else {
            Err("No host key verification pending".to_string())
        }
    }

    /// User submitted password in fallback modal
    pub async fn submit_password(
        &self,
        password: String,
        remember: bool,
    ) -> Result<(), String> {
        if self.auth_rendezvous.submit(password, remember) {
            Ok(())
        } else {
            Err("No active authentication challenge awaiting password".to_string())
        }
    }

    /// User cancelled authentication challenge
    pub async fn cancel_auth(&self, app: &tauri::AppHandle) -> Result<(), String> {
        // New lifecycle epoch: invalidates stale background tasks.
        let _ = self.next_epoch();
        self.auth_rendezvous.cancel();
        if let Some(token) = self.connect_cancel_token.lock().unwrap().take() {
            token.cancel();
        }
        self.set_status(app, ConnectionStatus::Disconnected);
        let state = app.state::<AppState>();
        let log = state.add_log(LogLevel::Info, "Authentication challenge cancelled by user.");
        let _ = app.emit("log-entry", log);
        Ok(())
    }

    /// Executes an arbitrary command on the connected remote machine over a clean SSH session channel
    pub async fn execute_command(&self, cmd: &str, timeout_secs: u64) -> Result<(i32, String, String), String> {
        let handle_arc = {
            let guard = self.session_handle.lock().await;
            guard.as_ref().cloned().ok_or_else(|| "SSH session is not currently connected".to_string())?
        };

        let handle = handle_arc.lock().await;
        let mut channel = handle
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open SSH channel: {}", e))?;

        channel
            .exec(true, cmd)
            .await
            .map_err(|e| format!("Failed to exec command '{}': {}", cmd, e))?;

        let mut stdout_bytes = Vec::new();
        let mut stderr_bytes = Vec::new();
        let mut exit_code: i32 = 0;

        let read_fut = async {
            while let Some(msg) = channel.wait().await {
                match msg {
                    russh::ChannelMsg::Data { ref data } => {
                        stdout_bytes.extend_from_slice(data);
                    }
                    russh::ChannelMsg::ExtendedData { ref data, ext: 1 } => {
                        stderr_bytes.extend_from_slice(data);
                    }
                    russh::ChannelMsg::ExitStatus { exit_status } => {
                        exit_code = exit_status as i32;
                    }
                    russh::ChannelMsg::Close => break,
                    _ => {}
                }
            }
        };

        tokio::time::timeout(Duration::from_secs(timeout_secs), read_fut)
            .await
            .map_err(|_| format!("Command timed out after {}s", timeout_secs))?;

        let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
        let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();
        Ok((exit_code, stdout, stderr))
    }

    /// Declares a genuine transport loss detected by the keepalive monitor.
    ///
    /// Guarded by the lifecycle epoch: a heartbeat task from a superseded
    /// connection must never mutate the state of a newer connection. When the
    /// loss is confirmed for the current lifecycle, transitions to Error and
    /// spawns the bounded automatic reconnection driver.
    pub fn declare_transport_loss(
        self: &Arc<Self>,
        app: &tauri::AppHandle,
        epoch: u64,
        code: &str,
        reason: String,
    ) {
        if self.current_epoch() != epoch {
            // Stale monitor from a superseded lifecycle: exit silently.
            return;
        }

        let state = app.state::<AppState>();
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let error_status = ConnectionStatus::Error {
            code: code.to_string(),
            message: reason.clone(),
            timestamp: now,
        };
        self.set_status(app, error_status);

        let log = state.add_log(LogLevel::Error, reason);
        let _ = app.emit("log-entry", log);

        // Bounded automatic reconnection for genuine transport loss only.
        tokio::spawn(bounded_auto_reconnect(self.clone(), app.clone(), epoch));
    }
}

/// RAII guard clearing `connect_in_progress` on every exit path of the
/// connection workflow (early returns, errors, cancellation).
struct ConnectGuard<'a> {
    flag: &'a AtomicBool,
}

impl Drop for ConnectGuard<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

/// Bounded automatic reconnection attempts before standing down.
const AUTO_RECONNECT_MAX_ATTEMPTS: u32 = 3;

/// Live-validation soak duration (Gate E): a connection must remain healthy
/// for at least this long before the session can be called stable.
pub const HEARTBEAT_SOAK_SECS: u64 = 600;

/// Bounded automatic reconnection driver.
///
/// Invoked only after a confirmed transport loss (heartbeat keepalive timeout
/// or session-loop termination). Performs at most `AUTO_RECONNECT_MAX_ATTEMPTS`
/// attempts with exponential backoff (5s, 10s, 20s), and aborts immediately if
/// the user performed any lifecycle action (connect / disconnect / cancel) in
/// the meantime — detected via the lifecycle epoch. Never loops indefinitely
/// and never bypasses the authentication pipeline's own attempt limits.
async fn bounded_auto_reconnect(manager: Arc<SshManager>, app: tauri::AppHandle, epoch: u64) {
    for attempt in 1..=AUTO_RECONNECT_MAX_ATTEMPTS {
        // Abortable backoff (5s, 10s, 20s): re-check the epoch every second so
        // user actions interrupt the wait promptly.
        let backoff_secs = 5u64 * (1u64 << (attempt - 1));
        for _ in 0..backoff_secs {
            if manager.current_epoch() != epoch {
                return;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        if manager.current_epoch() != epoch {
            return;
        }

        // Only attempt reconnection while the lifecycle still sits in the
        // transport-loss Error state (a manual disconnect sets Disconnected).
        {
            let state = app.state::<AppState>();
            let status = state.status.lock().unwrap();
            if !matches!(*status, ConnectionStatus::Error { .. }) {
                return;
            }
        }

        {
            let state = app.state::<AppState>();
            let log = state.add_log(
                LogLevel::Info,
                format!(
                    "Automatic reconnection attempt {}/{}...",
                    attempt, AUTO_RECONNECT_MAX_ATTEMPTS
                ),
            );
            let _ = app.emit("log-entry", log);
        }

        let res = manager.connect_internal(&app, epoch).await;
        if res.is_ok() {
            return;
        }

        // If the epoch advanced during the attempt, the user acted; stand down.
        if manager.current_epoch() != epoch {
            return;
        }
    }

    let state = app.state::<AppState>();
    let log = state.add_log(
        LogLevel::Error,
        format!(
            "Automatic reconnection abandoned after {} failed attempts.",
            AUTO_RECONNECT_MAX_ATTEMPTS
        ),
    );
    let _ = app.emit("log-entry", log);
}

/// Builds the russh client configuration for a connection.
///
/// Root-cause note (45-second disconnect): `inactivity_timeout` must NEVER be
/// armed with `connection_timeout_secs`. russh garbage-collects a session when
/// nothing is *received* for that duration, so a 10s value reaped healthy idle
/// sessions ~10s after the identity check; every subsequent keepalive ping
/// then failed with `russh::Error::SendError` ("Channel send error") because
/// the session-loop task had exited. Idle-session survival relies instead on
/// russh's transport-level keepalive (`keepalive@openssh.com` global requests)
/// with `keepalive_max` bounding unanswered probes before the transport is
/// declared dead with `Error::KeepaliveTimeout`.
pub fn build_russh_config(cfg: &AppConfig) -> russh::client::Config {
    russh::client::Config {
        // Do not garbage-collect idle sessions: dead-peer detection is owned
        // by the transport keepalive below.
        inactivity_timeout: None,
        // Transport-level keepalive aligned with the application heartbeat
        // interval. Clamped to >= 1s to avoid a zero-duration hot loop.
        keepalive_interval: Some(Duration::from_secs(cfg.heartbeat_interval_secs.max(1))),
        keepalive_max: heartbeat::MAX_MISSES as usize,
        ..Default::default()
    }
}
