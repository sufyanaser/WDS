//! Multi-Tiered SSH Authentication Pipeline
//! Tier 1: Ed25519 Private Key loading
//! Tier 2: OS Keyring (Windows Credential Manager / Apple Keychain)
//! Tier 3: In-App Password Modal Rendezvous with Zeroization and OS Keyring persistence

use std::sync::{Arc, Mutex};
use std::time::Duration;
use russh::keys::PrivateKeyWithHashAlg;
use tauri::Emitter;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;
use crate::models::{AppConfig, ConnectionStatus, LogLevel};
use crate::storage::keyring;
use crate::AppState;

/// Payload received from the frontend upon password submission
pub struct PasswordSubmission {
    pub password: Zeroizing<String>,
    pub remember: bool,
}

/// Thread-safe rendezvous channel connecting frontend IPC commands
/// (`submit_password`, `cancel_auth`) to the awaiting SSH connection task.
#[derive(Default)]
pub struct AuthRendezvous {
    sender: Mutex<Option<tokio::sync::oneshot::Sender<Option<PasswordSubmission>>>>,
}

impl AuthRendezvous {
    pub fn new() -> Self {
        Self {
            sender: Mutex::new(None),
        }
    }

    /// Registers a pending challenge sender
    pub fn register(&self, tx: tokio::sync::oneshot::Sender<Option<PasswordSubmission>>) {
        let mut lock = self.sender.lock().unwrap();
        *lock = Some(tx);
    }

    /// Submits a password to unblock the awaiting auth task
    pub fn submit(&self, password: String, remember: bool) -> bool {
        let mut lock = self.sender.lock().unwrap();
        if let Some(tx) = lock.take() {
            let sub = PasswordSubmission {
                password: Zeroizing::new(password),
                remember,
            };
            tx.send(Some(sub)).is_ok()
        } else {
            false
        }
    }

    /// Cancels the pending challenge
    pub fn cancel(&self) -> bool {
        let mut lock = self.sender.lock().unwrap();
        if let Some(tx) = lock.take() {
            tx.send(None).is_ok()
        } else {
            false
        }
    }
}

/// Authentication Method Successfully Employed
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthMethodUsed {
    PublicKey,
    KeyringPassword,
    InteractivePassword,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthPipelineError {
    #[error("Authentication challenge cancelled by user")]
    Cancelled,
    #[error("Authentication challenge timed out")]
    Timeout,
    #[error("Maximum password attempts (3) exceeded")]
    MaxAttemptsExceeded,
    #[error("SSH transport error during auth: {0}")]
    Transport(String),
}

/// Executes the 3-tiered authentication sequence
pub async fn authenticate_session<H: russh::client::Handler + Send + Sync + 'static>(
    session: &mut russh::client::Handle<H>,
    config: &AppConfig,
    rendezvous: &AuthRendezvous,
    app: &tauri::AppHandle,
    state: &AppState,
    cancel_token: &CancellationToken,
) -> Result<AuthMethodUsed, AuthPipelineError> {
    // -----------------------------------------------------------------------
    // TIER 1: Ed25519 Public Key Authentication
    // -----------------------------------------------------------------------
    let key_path = std::path::Path::new(&config.private_key_path);
    if key_path.exists() {
        {
            let mut status = state.status.lock().unwrap();
            *status = ConnectionStatus::Authenticating {
                method: "publickey".to_string(),
            };
        }
        let _ = app.emit(
            "connection-status-changed",
            &ConnectionStatus::Authenticating {
                method: "publickey".to_string(),
            },
        );

        let log = state.add_log(
            LogLevel::Info,
            format!("Attempting Ed25519 public key auth with user '{}'...", config.remote_user),
        );
        let _ = app.emit("log-entry", log);

        // Attempt to parse key without passphrase (if encrypted, gracefully fall through)
        match russh::keys::load_secret_key(key_path, None) {
            Ok(key_pair) => {
                let pkey = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
                let auth_fut = session.authenticate_publickey(&config.remote_user, pkey);

                let auth_res = tokio::select! {
                    _ = cancel_token.cancelled() => {
                        return Err(AuthPipelineError::Cancelled);
                    }
                    res = auth_fut => res,
                };

                match auth_res {
                    Ok(res) if res.success() => {
                        let log = state.add_log(LogLevel::Info, "Public key authentication succeeded.");
                        let _ = app.emit("log-entry", log);
                        return Ok(AuthMethodUsed::PublicKey);
                    }
                    Ok(_) => {
                        let log = state.add_log(
                            LogLevel::Warn,
                            "Public key rejected by remote server (permission denied); proceeding to secondary auth.",
                        );
                        let _ = app.emit("log-entry", log);
                    }
                    Err(e) => {
                        let log = state.add_log(
                            LogLevel::Warn,
                            format!("Public key auth transport error: {}; proceeding to secondary auth.", e),
                        );
                        let _ = app.emit("log-entry", log);
                    }
                }
            }
            Err(err) => {
                let log = state.add_log(
                    LogLevel::Info,
                    format!("Private key requires passphrase or could not be loaded directly ({}). Proceeding to secondary auth.", err),
                );
                let _ = app.emit("log-entry", log);
            }
        }
    } else {
        let log = state.add_log(
            LogLevel::Info,
            format!("No private key found at '{}'; proceeding to secondary auth.", config.private_key_path),
        );
        let _ = app.emit("log-entry", log);
    }

    // -----------------------------------------------------------------------
    // TIER 2: OS Keyring Stored Credential Fallback
    // -----------------------------------------------------------------------
    if let Ok(Some(saved_pw)) = keyring::get_saved_password(&config.remote_user, &config.remote_host, config.remote_port) {
        {
            let mut status = state.status.lock().unwrap();
            *status = ConnectionStatus::Authenticating {
                method: "password (keyring)".to_string(),
            };
        }
        let _ = app.emit(
            "connection-status-changed",
            &ConnectionStatus::Authenticating {
                method: "password (keyring)".to_string(),
            },
        );

        let log = state.add_log(
            LogLevel::Info,
            "Found stored credentials in OS Keyring. Attempting password authentication...",
        );
        let _ = app.emit("log-entry", log);

        let pw_fut = session.authenticate_password(&config.remote_user, saved_pw.as_str());
        let pw_res = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(AuthPipelineError::Cancelled);
            }
            res = pw_fut => res,
        };

        match pw_res {
            Ok(res) if res.success() => {
                let log = state.add_log(LogLevel::Info, "Authentication succeeded using saved OS Keyring credentials.");
                let _ = app.emit("log-entry", log);
                return Ok(AuthMethodUsed::KeyringPassword);
            }
            _ => {
                let log = state.add_log(
                    LogLevel::Warn,
                    "Saved OS Keyring credentials rejected by remote server. Purging stale entry...",
                );
                let _ = app.emit("log-entry", log);
                let _ = keyring::delete_saved_password(&config.remote_user, &config.remote_host, config.remote_port);
            }
        }
    }

    // -----------------------------------------------------------------------
    // TIER 3: Interactive In-App Password Dialog Fallback
    // -----------------------------------------------------------------------
    let mut attempt = 1;
    const MAX_ATTEMPTS: u32 = 3;

    while attempt <= MAX_ATTEMPTS {
        let challenge_status = ConnectionStatus::AuthChallengePending {
            user: config.remote_user.clone(),
            host: config.remote_host.clone(),
            reason: if attempt == 1 {
                Some("Public key denied or passphrase required. Password fallback requested.".to_string())
            } else {
                Some(format!("Invalid password (attempt {}/{}). Please try again.", attempt, MAX_ATTEMPTS))
            },
        };

        {
            let mut status = state.status.lock().unwrap();
            *status = challenge_status.clone();
        }
        let _ = app.emit("connection-status-changed", &challenge_status);

        let log = state.add_log(
            LogLevel::Warn,
            format!("Awaiting password submission from user (attempt {}/{})...", attempt, MAX_ATTEMPTS),
        );
        let _ = app.emit("log-entry", log);

        let (tx, rx) = tokio::sync::oneshot::channel::<Option<PasswordSubmission>>();
        rendezvous.register(tx);

        let submission_res = tokio::select! {
            _ = cancel_token.cancelled() => {
                rendezvous.cancel();
                return Err(AuthPipelineError::Cancelled);
            }
            res = tokio::time::timeout(Duration::from_secs(120), rx) => {
                match res {
                    Ok(Ok(Some(sub))) => Ok(sub),
                    Ok(Ok(None)) => Err(AuthPipelineError::Cancelled),
                    Ok(Err(_)) | Err(_) => Err(AuthPipelineError::Timeout),
                }
            }
        };

        let submission = match submission_res {
            Ok(s) => s,
            Err(e) => {
                let log = state.add_log(LogLevel::Info, format!("Authentication ended: {}", e));
                let _ = app.emit("log-entry", log);
                return Err(e);
            }
        };

        {
            let mut status = state.status.lock().unwrap();
            *status = ConnectionStatus::Authenticating {
                method: "password".to_string(),
            };
        }
        let _ = app.emit(
            "connection-status-changed",
            &ConnectionStatus::Authenticating {
                method: "password".to_string(),
            },
        );

        let auth_fut = session.authenticate_password(&config.remote_user, submission.password.as_str());
        let auth_res = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(AuthPipelineError::Cancelled);
            }
            res = auth_fut => res,
        };

        match auth_res {
            Ok(res) if res.success() => {
                let log = state.add_log(LogLevel::Info, "Interactive password authentication succeeded.");
                let _ = app.emit("log-entry", log);

                if submission.remember {
                    let log = state.add_log(
                        LogLevel::Info,
                        format!("Saving credentials to OS Keyring under '{}@{}'...", config.remote_user, config.remote_host),
                    );
                    let _ = app.emit("log-entry", log);
                    let _ = keyring::save_password(
                        &config.remote_user,
                        &config.remote_host,
                        config.remote_port,
                        submission.password.as_str(),
                    );
                }

                // Password memory zeroization occurs automatically when `submission` drops
                return Ok(AuthMethodUsed::InteractivePassword);
            }
            _ => {
                let log = state.add_log(
                    LogLevel::Error,
                    format!("Password rejected by remote server (attempt {}/{}).", attempt, MAX_ATTEMPTS),
                );
                let _ = app.emit("log-entry", log);
                attempt += 1;
            }
        }
    }

    Err(AuthPipelineError::MaxAttemptsExceeded)
}
