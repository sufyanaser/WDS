use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const APK_PATH: &str = r"G:\PROJECTS\WAJIBATI-consolidation-beta-1-unified\android\app\build\outputs\apk\debug\app-debug.apk";
const SCRCPY_PATH: &str = r"G:\PROJECTS\2-WDS\platform-tools\scrcpy.exe";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AndroidStatus {
    pub is_running: bool,
    pub device_id: String,
    pub app_installed: bool,
    pub app_running: bool,
    pub screen_width: u32,
    pub screen_height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AndroidInputPayload {
    pub action: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub x2: Option<i32>,
    pub y2: Option<i32>,
    pub duration_ms: Option<u32>,
    pub text: Option<String>,
    pub keycode: Option<i32>,
}

#[tauri::command]
pub async fn android_get_status() -> Result<AndroidStatus, String> {
    tokio::task::spawn_blocking(|| {
        let mut cmd = Command::new("adb");
        cmd.args(["devices"]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = cmd.output().map_err(|e| format!("Failed to run adb: {}", e))?;
        let text = String::from_utf8_lossy(&output.stdout);

        let mut device_id = String::new();
        for line in text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == "device" {
                device_id = parts[0].to_string();
                break;
            }
        }

        if device_id.is_empty() {
            return Ok(AndroidStatus {
                is_running: false,
                device_id: String::new(),
                app_installed: false,
                app_running: false,
                screen_width: 1080,
                screen_height: 2400,
            });
        }

        // Check if app is installed
        let mut pm_cmd = Command::new("adb");
        pm_cmd.args(["-s", &device_id, "shell", "pm", "path", "iq.wajibati.app"]);
        pm_cmd.creation_flags(CREATE_NO_WINDOW);
        let pm_out = pm_cmd.output().map(|o| String::from_utf8_lossy(&o.stdout).contains("package:"));
        let app_installed = pm_out.unwrap_or(false);

        // Check if app is running
        let mut focus_cmd = Command::new("adb");
        focus_cmd.args(["-s", &device_id, "shell", "dumpsys", "window"]);
        focus_cmd.creation_flags(CREATE_NO_WINDOW);
        let app_running = match focus_cmd.output() {
            Ok(o) => String::from_utf8_lossy(&o.stdout).contains("iq.wajibati.app"),
            Err(_) => false,
        };

        // Get screen size
        let mut size_cmd = Command::new("adb");
        size_cmd.args(["-s", &device_id, "shell", "wm", "size"]);
        size_cmd.creation_flags(CREATE_NO_WINDOW);
        let (mut screen_width, mut screen_height) = (1080, 2400);
        if let Ok(o) = size_cmd.output() {
            let out_str = String::from_utf8_lossy(&o.stdout);
            if let Some(idx) = out_str.find("Physical size: ") {
                let rest = &out_str[idx + 15..];
                if let Some(x_idx) = rest.find('x') {
                    if let Ok(w) = rest[..x_idx].trim().parse::<u32>() {
                        screen_width = w;
                    }
                    if let Ok(h) = rest[x_idx + 1..].split_whitespace().next().unwrap_or("").parse::<u32>() {
                        screen_height = h;
                    }
                }
            }
        }

        Ok(AndroidStatus {
            is_running: true,
            device_id,
            app_installed,
            app_running,
            screen_width,
            screen_height,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn android_launch_emulator() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let emulator_path = r"C:\Users\sufya\AppData\Local\Android\Sdk\emulator\emulator.exe";
        let mut cmd = Command::new(emulator_path);
        cmd.args(["-avd", "Medium_Phone_API_37.0", "-netdelay", "none", "-netspeed", "full"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn().map_err(|e| format!("Failed to spawn emulator: {}", e))?;
        Ok("Android Emulator starting in background".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn android_install_and_launch() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        // Install APK
        let mut inst = Command::new("adb");
        inst.args(["install", "-r", APK_PATH]);
        inst.creation_flags(CREATE_NO_WINDOW);
        let inst_out = inst.output().map_err(|e| format!("Install failed: {}", e))?;
        let inst_text = String::from_utf8_lossy(&inst_out.stdout);

        // Start MainActivity
        let mut launch = Command::new("adb");
        launch.args(["shell", "am", "start", "-n", "iq.wajibati.app/.MainActivity"]);
        launch.creation_flags(CREATE_NO_WINDOW);
        let launch_out = launch.output().map_err(|e| format!("Launch failed: {}", e))?;
        let launch_text = String::from_utf8_lossy(&launch_out.stdout);

        Ok(format!("Installed: {}\nLaunched: {}", inst_text.trim(), launch_text.trim()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn android_screencap() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let mut cmd = Command::new("adb");
        cmd.args(["exec-out", "screencap", "-p"]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = cmd.output().map_err(|e| format!("Screencap failed: {}", e))?;
        if output.stdout.is_empty() {
            return Err("Empty screencap payload".to_string());
        }

        let encoded = BASE64.encode(&output.stdout);
        Ok(format!("data:image/png;base64,{}", encoded))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn android_send_input(payload: AndroidInputPayload) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("adb");
        cmd.creation_flags(CREATE_NO_WINDOW);

        match payload.action.as_str() {
            "tap" => {
                let x = payload.x.unwrap_or(500);
                let y = payload.y.unwrap_or(1000);
                cmd.args(["shell", "input", "tap", &x.to_string(), &y.to_string()]);
            }
            "swipe" => {
                let x1 = payload.x.unwrap_or(500);
                let y1 = payload.y.unwrap_or(1200);
                let x2 = payload.x2.unwrap_or(500);
                let y2 = payload.y2.unwrap_or(600);
                let dur = payload.duration_ms.unwrap_or(300);
                cmd.args([
                    "shell",
                    "input",
                    "swipe",
                    &x1.to_string(),
                    &y1.to_string(),
                    &x2.to_string(),
                    &y2.to_string(),
                    &dur.to_string(),
                ]);
            }
            "text" => {
                let text = payload.text.unwrap_or_default();
                // Replace spaces with %s for adb input text
                let escaped = text.replace(' ', "%s");
                cmd.args(["shell", "input", "text", &escaped]);
            }
            "back" => {
                cmd.args(["shell", "input", "keyevent", "4"]);
            }
            "home" => {
                cmd.args(["shell", "input", "keyevent", "3"]);
            }
            "key" => {
                let code = payload.keycode.unwrap_or(66);
                cmd.args(["shell", "input", "keyevent", &code.to_string()]);
            }
            "relaunch" => {
                cmd.args([
                    "shell",
                    "am",
                    "force-stop",
                    "iq.wajibati.app",
                ]);
                let _ = cmd.output();
                let mut start_cmd = Command::new("adb");
                start_cmd.creation_flags(CREATE_NO_WINDOW);
                start_cmd.args(["shell", "am", "start", "-n", "iq.wajibati.app/.MainActivity"]);
                let out = start_cmd.output().map_err(|e| e.to_string())?;
                return Ok(String::from_utf8_lossy(&out.stdout).to_string());
            }
            _ => return Err(format!("Unsupported action: {}", payload.action)),
        }

        let out = cmd.output().map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn android_launch_scrcpy() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let mut cmd = Command::new(SCRCPY_PATH);
        cmd.args(["--window-title", "WDS Native Android - Wajibati", "--always-on-top"]);
        cmd.spawn().map_err(|e| format!("Failed to spawn scrcpy: {}", e))?;
        Ok("Scrcpy native mirror launched".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
