use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone)]
pub struct ErrorEntry {
    pub id: String,
    pub timestamp: u64,
    pub command: String,
    pub error_message: String,
    pub context: String,
}

#[derive(Serialize, Deserialize)]
pub struct CrashReport {
    pub app_version: String,
    pub os_info: String,
    pub generated_at: String,
    pub errors: Vec<ErrorEntry>,
    pub system_info: String,
}

// In-memory buffer for the current session; persisted to disk immediately.
static ERROR_LOG: OnceLock<Mutex<Vec<ErrorEntry>>> = OnceLock::new();

fn error_log() -> &'static Mutex<Vec<ErrorEntry>> {
    ERROR_LOG.get_or_init(|| Mutex::new(load_log_from_disk()))
}

fn error_log_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("error_log.json")
}

fn load_log_from_disk() -> Vec<ErrorEntry> {
    let path = error_log_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_log(log: &[ErrorEntry]) {
    let path = error_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Ok(json) = serde_json::to_string_pretty(log) {
        std::fs::write(&path, json).ok();
    }
}

/// Called from other commands when an error should be recorded.
#[allow(dead_code)]
pub fn record_error(command: &str, message: &str, context: &str) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let entry = ErrorEntry {
        id: format!("{}-{}", timestamp, uuid::Uuid::new_v4()),
        timestamp,
        command: command.to_string(),
        error_message: message.to_string(),
        context: context.to_string(),
    };

    let mut log = error_log().lock().unwrap_or_else(|p| p.into_inner());
    log.insert(0, entry);
    if log.len() > 100 {
        log.truncate(100);
    }
    persist_log(&log);
}

#[tauri::command]
pub fn get_error_log() -> Vec<ErrorEntry> {
    error_log()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
}

#[tauri::command]
pub fn clear_error_log() -> Result<(), String> {
    let mut log = error_log().lock().unwrap_or_else(|p| p.into_inner());
    log.clear();
    persist_log(&[]);
    Ok(())
}

#[tauri::command]
pub fn export_crash_report() -> Result<String, String> {
    use sysinfo::System;

    let errors = error_log()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();

    let mut sys = System::new_all();
    sys.refresh_all();

    let os_info = format!(
        "{} / kernel: {}",
        std::env::consts::OS,
        System::kernel_version().unwrap_or_else(|| "unknown".to_string()),
    );

    let total_mem_mb = sys.total_memory() as f64 / 1024.0 / 1024.0;
    let used_mem_mb = sys.used_memory() as f64 / 1024.0 / 1024.0;
    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let system_info = format!(
        "CPU: {} | RAM: {:.0}/{:.0} MB | OS: {}",
        cpu_name,
        used_mem_mb,
        total_mem_mb,
        System::long_os_version().unwrap_or_else(|| "unknown".to_string()),
    );

    let generated_at = super::now_iso8601();

    let report = CrashReport {
        app_version: "1.0.0".to_string(),
        os_info,
        generated_at,
        errors,
        system_info,
    };

    serde_json::to_string_pretty(&report).map_err(|e| e.to_string())
}
