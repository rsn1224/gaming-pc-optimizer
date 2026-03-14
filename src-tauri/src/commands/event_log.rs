use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventEntry {
    pub id: String,
    pub timestamp: u64,
    /// "profile_applied" | "optimization_run" | "preset_applied" | "restore" | "error"
    pub event_type: String,
    pub title: String,
    pub detail: String,
    /// "success" | "info" | "warning" | "error"
    pub icon_kind: String,
}

fn event_log_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("event_log.json")
}

fn load_log_internal() -> Vec<EventEntry> {
    let path = event_log_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn add_event_internal(event_type: &str, title: &str, detail: &str, icon_kind: &str) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let path = event_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let mut log = load_log_internal();
    // newest first
    log.insert(
        0,
        EventEntry {
            id: format!("{}-{}", timestamp, log.len()),
            timestamp,
            event_type: event_type.to_string(),
            title: title.to_string(),
            detail: detail.to_string(),
            icon_kind: icon_kind.to_string(),
        },
    );
    if log.len() > 200 {
        log.truncate(200);
    }
    if let Ok(json) = serde_json::to_string_pretty(&log) {
        std::fs::write(&path, json).ok();
    }
}

#[tauri::command]
pub fn get_event_log() -> Vec<EventEntry> {
    load_log_internal()
}

#[tauri::command]
pub fn clear_event_log() -> Result<(), String> {
    let path = event_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, "[]").map_err(|e| e.to_string())
}
