use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosStatus {
    pub is_connected: bool,
    pub host: String,
    pub device_name: String,
    pub state: String, // "Disconnected", "Shutdown", "Booting", "Booted", "Error"
    pub app_installed: bool,
    pub app_running: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosInputPayload {
    pub action: String, // "home", "relaunch", "open_url", "key"
    pub text: Option<String>,
    pub url: Option<String>,
}

const IOS_SIMULATOR_NAME: &str = "Wajibati iPhone 17 Pro";
const BUNDLE_ID_PRIMARY: &str = "cc.raneen.wajibati";
const BUNDLE_ID_SECONDARY: &str = "iq.wajibati.app";

#[tauri::command]
pub async fn ios_get_status(state: State<'_, AppState>) -> Result<IosStatus, String> {
    let (is_connected, host) = {
        let status = state.status.lock().unwrap();
        match &*status {
            crate::models::ConnectionStatus::Connected { remote_host, .. } => (true, remote_host.clone()),
            _ => (false, "192.168.68.100".to_string()),
        }
    };

    if !is_connected {
        return Ok(IosStatus {
            is_connected: false,
            host,
            device_name: IOS_SIMULATOR_NAME.to_string(),
            state: "Disconnected".to_string(),
            app_installed: false,
            app_running: false,
            error_message: Some("جهاز MacBook غير متصل. اضغط على زر الربط للاتصال.".to_string()),
        });
    }

    // Query simulator status via xcrun simctl
    let query_cmd = format!(
        "xcrun simctl list devices '{}' 2>/dev/null || xcrun simctl list devices booted 2>/dev/null",
        IOS_SIMULATOR_NAME
    );
    let out = state.ssh_manager.execute_command(&query_cmd, 8).await;

    match out {
        Ok((_, stdout, _)) => {
            let is_booted = stdout.contains("Booted");
            let state_str = if is_booted { "Booted" } else { "Shutdown" };

            // Check if application is installed
            let app_installed = if is_booted {
                let app_check_cmd = format!(
                    "xcrun simctl get_app_container booted {} 2>/dev/null || xcrun simctl get_app_container booted {} 2>/dev/null",
                    BUNDLE_ID_PRIMARY, BUNDLE_ID_SECONDARY
                );
                state.ssh_manager
                    .execute_command(&app_check_cmd, 5)
                    .await
                    .map(|(_, o, _)| !o.trim().is_empty())
                    .unwrap_or(false)
            } else {
                false
            };

            Ok(IosStatus {
                is_connected: true,
                host,
                device_name: IOS_SIMULATOR_NAME.to_string(),
                state: state_str.to_string(),
                app_installed,
                app_running: is_booted && app_installed,
                error_message: None,
            })
        }
        Err(e) => Ok(IosStatus {
            is_connected: true,
            host,
            device_name: IOS_SIMULATOR_NAME.to_string(),
            state: "Error".to_string(),
            app_installed: false,
            app_running: false,
            error_message: Some(format!("فشل الاستعلام من Mac: {}", e)),
        }),
    }
}

#[tauri::command]
pub async fn ios_boot_simulator(state: State<'_, AppState>) -> Result<String, String> {
    let boot_cmd = format!(
        "open -a Simulator 2>/dev/null || true; xcrun simctl boot '{}' 2>/dev/null || true; xcrun simctl bootstatus '{}' -b 2>/dev/null || true",
        IOS_SIMULATOR_NAME, IOS_SIMULATOR_NAME
    );
    state.ssh_manager.execute_command(&boot_cmd, 25).await.map(|(_, out, _)| out)
}

#[tauri::command]
pub async fn ios_launch_app(state: State<'_, AppState>) -> Result<String, String> {
    // Launch primary bundle id, fallback to secondary
    let launch_cmd = format!(
        "xcrun simctl launch booted {} 2>/dev/null || xcrun simctl launch booted {} 2>/dev/null || echo 'Launch triggered'",
        BUNDLE_ID_PRIMARY, BUNDLE_ID_SECONDARY
    );
    state.ssh_manager.execute_command(&launch_cmd, 10).await.map(|(_, out, _)| out)
}

#[tauri::command]
pub async fn ios_screencap(state: State<'_, AppState>) -> Result<String, String> {
    // Check if connected
    {
        let status = state.status.lock().unwrap();
        if !matches!(&*status, crate::models::ConnectionStatus::Connected { .. }) {
            return Err("MacBook disconnected".to_string());
        }
    }

    // Capture screenshot from simulator via xcrun simctl and pipe directly to base64
    let cap_cmd = "xcrun simctl io booted screenshot - 2>/dev/null | base64";
    let res = state.ssh_manager.execute_command(cap_cmd, 8).await?;
    let b64 = res.1.replace(['\r', '\n', ' '], "");
    if b64.is_empty() {
        return Err("المحاكي بحالة Shutdown أو لم يكتمل إقلاعه بعد.".to_string());
    }
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
pub async fn ios_send_input(state: State<'_, AppState>, payload: IosInputPayload) -> Result<String, String> {
    match payload.action.as_str() {
        "home" => {
            // Trigger Home button via AppleScript keyboard shortcut or simctl URL
            let cmd = r#"osascript -e 'tell application "Simulator" to activate' -e 'tell application "System Events" to key code 4 using {command down, shift down}' 2>/dev/null || true"#;
            state.ssh_manager.execute_command(cmd, 5).await.map(|(_, out, _)| out)
        }
        "relaunch" => {
            let cmd = format!(
                "xcrun simctl terminate booted {} 2>/dev/null || xcrun simctl terminate booted {} 2>/dev/null; xcrun simctl launch booted {} 2>/dev/null || xcrun simctl launch booted {} 2>/dev/null",
                BUNDLE_ID_PRIMARY, BUNDLE_ID_SECONDARY, BUNDLE_ID_PRIMARY, BUNDLE_ID_SECONDARY
            );
            state.ssh_manager.execute_command(&cmd, 10).await.map(|(_, out, _)| out)
        }
        "open_url" => {
            let url = payload.url.unwrap_or_else(|| "http://127.0.0.1:5173".to_string());
            let cmd = format!("xcrun simctl openurl booted '{}' 2>/dev/null || true", url);
            state.ssh_manager.execute_command(&cmd, 5).await.map(|(_, out, _)| out)
        }
        _ => Err(format!("Unsupported iOS action: {}", payload.action)),
    }
}
