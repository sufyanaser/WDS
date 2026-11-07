use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub mod models;
pub mod ssh;
pub mod storage;
pub mod logging;
pub mod simulator;
use models::{AppConfig, ConnectionStatus, LocalSystemInfo, LogLevel, SanitizedLogEntry};

// ---------------------------------------------------------------------------
// AppState & Rolling Diagnostic Buffer
// ---------------------------------------------------------------------------

pub struct AppState {
    pub status: Mutex<ConnectionStatus>,
    pub config: Mutex<AppConfig>,
    pub logs: Mutex<Vec<SanitizedLogEntry>>,
    pub ssh_manager: std::sync::Arc<crate::ssh::SshManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let initial_log = SanitizedLogEntry {
            id: "init-0".to_string(),
            timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
            level: LogLevel::Info,
            message: "WDS Connect desktop foundation initialized (Gate 3 Native SSH active)".to_string(),
        };

        Self {
            status: Mutex::new(ConnectionStatus::Disconnected),
            config: Mutex::new(AppConfig::default()),
            logs: Mutex::new(vec![initial_log]),
            ssh_manager: std::sync::Arc::new(crate::ssh::SshManager::new()),
        }
    }

    pub fn add_log(&self, level: LogLevel, message: impl Into<String>) -> SanitizedLogEntry {
        let raw_msg = message.into();
        let sanitized_msg = crate::logging::sanitizer::sanitize_log(&raw_msg);

        let entry = SanitizedLogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
            level,
            message: sanitized_msg,
        };

        let mut logs = self.logs.lock().unwrap();
        if logs.len() >= 500 {
            logs.remove(0); // Maintain rolling 500-item maximum buffer
        }
        logs.push(entry.clone());
        entry
    }
}

// ---------------------------------------------------------------------------
// Tauri IPC Commands
// ---------------------------------------------------------------------------

/// Returns local workstation information dynamically for the LocalDeviceCard
#[tauri::command]
async fn get_system_info() -> Result<LocalSystemInfo, String> {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "SUFYAN".to_string());

    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "sufya".to_string());

    let os_name = "Windows 11".to_string();
    let local_ip = Some("192.168.68.104".to_string());

    Ok(LocalSystemInfo {
        hostname,
        username,
        os_name,
        local_ip,
    })
}

/// Retrieves stored connection configuration
#[tauri::command]
async fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    let cfg = state.config.lock().map_err(|e| e.to_string())?.clone();
    Ok(cfg)
}

/// Saves updated connection configuration
#[tauri::command]
async fn save_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    {
        let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
        *cfg = config.clone();
    }
    let log = state.add_log(
        LogLevel::Info,
        format!("Configuration updated for {}@{}:{}", config.remote_user, config.remote_host, config.remote_port),
    );
    let _ = app.emit("log-entry", log);
    Ok(())
}

/// Retrieves rolling sanitized diagnostics log buffer
#[tauri::command]
async fn get_diagnostics(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SanitizedLogEntry>, String> {
    let logs = state.logs.lock().map_err(|e| e.to_string())?.clone();
    Ok(logs)
}

/// Initiates connection lifecycle via SshManager coordinator
#[tauri::command]
async fn connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let ssh_mgr = state.ssh_manager.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        let _ = ssh_mgr.connect(&app_clone).await;
    });
    Ok(())
}

/// Gracefully disconnects the current session via SshManager teardown
#[tauri::command]
async fn disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.ssh_manager.disconnect(&app).await
}

/// Handles user response to host key verification challenge
#[tauri::command]
async fn confirm_host_key(
    state: tauri::State<'_, AppState>,
    approved: bool,
    remember: bool,
) -> Result<(), String> {
    state.ssh_manager.confirm_host_key(approved, remember).await
}

/// Handles user submission of fallback password
#[tauri::command]
async fn submit_password(
    state: tauri::State<'_, AppState>,
    password: String,
    remember: bool,
) -> Result<(), String> {
    state.ssh_manager.submit_password(password, remember).await
}

/// Aborts authentication challenge and resets state
#[tauri::command]
async fn cancel_auth(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.ssh_manager.cancel_auth(&app).await
}

/// Purges stored credentials from OS Credential Manager
#[tauri::command]
async fn clear_credentials(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let cfg = state.config.lock().map_err(|e| e.to_string())?.clone();
    crate::storage::keyring::delete_saved_password(&cfg.remote_user, &cfg.remote_host, cfg.remote_port)
        .map_err(|e| format!("Failed to clear credentials: {}", e))?;

    let log = state.add_log(
        LogLevel::Info,
        format!("Stored credentials for {}@{} cleared from Windows Credential Manager.", cfg.remote_user, cfg.remote_host),
    );
    let _ = app.emit("log-entry", log);
    Ok(())
}

// ---------------------------------------------------------------------------
// Loopback Multi-Origin Proxy for Session Isolation
// ---------------------------------------------------------------------------

async fn start_loopback_proxy(listen_port: u16, target_port: u16) {
    if let Ok(listener) = tokio::net::TcpListener::bind(("127.0.0.1", listen_port)).await {
        while let Ok((mut inbound, _)) = listener.accept().await {
            tokio::spawn(async move {
                if let Ok(mut outbound) = tokio::net::TcpStream::connect(("127.0.0.1", target_port)).await {
                    let _ = tokio::io::copy_bidirectional(&mut inbound, &mut outbound).await;
                }
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri Application Runner
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            tauri::async_runtime::spawn(async {
                start_loopback_proxy(5174, 5173).await;
            });
            tauri::async_runtime::spawn(async {
                start_loopback_proxy(5175, 5173).await;
            });
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AppState>();
                let ssh_manager = state.ssh_manager.clone();
                let _ = ssh_manager.connect(&handle).await;
            });
            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_config,
            save_config,
            get_diagnostics,
            connect,
            disconnect,
            confirm_host_key,
            submit_password,
            cancel_auth,
            clear_credentials,
            simulator::android::android_get_status,
            simulator::android::android_launch_emulator,
            simulator::android::android_install_and_launch,
            simulator::android::android_screencap,
            simulator::android::android_send_input,
            simulator::android::android_launch_scrcpy,
            simulator::ios::ios_get_status,
            simulator::ios::ios_boot_simulator,
            simulator::ios::ios_launch_app,
            simulator::ios::ios_screencap,
            simulator::ios::ios_send_input
        ])
        .run(tauri::generate_context!())
        .expect("error while running WDS Connect desktop application");
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_initialization() {
        let state = AppState::new();
        assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::Disconnected);
        assert_eq!(state.logs.lock().unwrap().len(), 1);
        assert_eq!(state.config.lock().unwrap().remote_host, "192.168.68.100");
    }

    #[test]
    fn test_rolling_log_buffer_limit() {
        let state = AppState::new();
        for i in 0..600 {
            state.add_log(LogLevel::Debug, format!("Log event {}", i));
        }
        let logs = state.logs.lock().unwrap();
        assert_eq!(logs.len(), 500);
        assert!(logs.last().unwrap().message.contains("Log event 599"));
    }

    #[test]
    fn test_connection_status_serde_tagging() {
        let status = ConnectionStatus::Connecting {
            host: "192.168.68.103".to_string(),
            port: 22,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"status\":\"Connecting\""));
        assert!(json.contains("\"details\":{\"host\":\"192.168.68.103\",\"port\":22}"));

        let deserialized: ConnectionStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(status, deserialized);
    }

    #[test]
    fn test_status_methods() {
        let connected = ConnectionStatus::Connected {
            remote_host: "192.168.68.103".to_string(),
            remote_user: "ali".to_string(),
            remote_identity: "macOS 15.3 (Darwin 24.3.0 arm64)".to_string(),
            connected_at: 1000,
            latency_ms: Some(2),
        };
        assert!(connected.is_connected());
        assert_eq!(connected.status_name(), "Connected");

        let disconnected = ConnectionStatus::Disconnected;
        assert!(!disconnected.is_connected());
        assert_eq!(disconnected.status_name(), "Disconnected");
    }
}
