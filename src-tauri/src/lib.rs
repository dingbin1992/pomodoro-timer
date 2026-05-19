use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimerSettings {
    #[serde(default = "default_work_minutes")]
    pub work_minutes: u32,
    #[serde(default = "default_short_break_minutes")]
    pub short_break_minutes: u32,
    #[serde(default = "default_long_break_minutes")]
    pub long_break_minutes: u32,
}

fn default_work_minutes() -> u32 {
    60
}
fn default_short_break_minutes() -> u32 {
    10
}
fn default_long_break_minutes() -> u32 {
    120
}

impl Default for TimerSettings {
    fn default() -> Self {
        Self {
            work_minutes: 60,
            short_break_minutes: 10,
            long_break_minutes: 120,
        }
    }
}

fn get_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.join("settings.json"))
}

#[tauri::command]
fn get_settings(app_handle: tauri::AppHandle) -> TimerSettings {
    let path = match get_settings_path(&app_handle) {
        Ok(p) => p,
        Err(_) => return TimerSettings::default(),
    };
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    TimerSettings::default()
}

#[tauri::command]
fn save_settings(app_handle: tauri::AppHandle, settings: TimerSettings) -> Result<(), String> {
    let path = get_settings_path(&app_handle)?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn ping() -> String {
    "pong".into()
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    window.minimize().ok();
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    window.close().ok();
}

#[tauri::command]
fn send_notification(app_handle: tauri::AppHandle, title: String, body: String) {
    app_handle
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .ok();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            send_notification,
            minimize_window,
            close_window,
            ping
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
