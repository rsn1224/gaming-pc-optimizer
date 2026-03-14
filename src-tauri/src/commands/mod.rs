pub mod ai;
pub mod app_settings;
pub mod audit_log;
pub mod backup;
pub mod bandwidth;
pub mod benchmark;
pub mod clipboard_opt;
pub mod cpu_affinity;
pub mod crash_report;
pub mod disk_health;
pub mod event_log;
pub mod fps;
pub mod game_integrity;
pub mod game_log;
pub mod hardware;
pub mod hardware_suggestions;
pub mod hotkeys;
pub mod icons;
pub mod memory_cleaner;
pub mod metrics;
pub mod network;
pub mod optimizer;
pub mod optimizer_graph;
pub mod osd;
pub mod policy;
pub mod power;
pub mod presets;
pub mod process;
pub mod profile_share;
pub mod profiles;
pub mod registry_opt;
pub mod report;
pub mod rollback;
pub mod runner;
pub mod safety_kernel;
pub mod scheduler;
pub mod self_improve;
pub mod startup;
pub mod steam;
pub mod telemetry;
pub mod storage;
pub mod system_info;
pub mod uninstaller;
pub mod update_check;
pub mod updates;
pub mod watcher;
pub mod windows_settings;

// ── Observation logging ───────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Observation {
    pub timestamp: String,
    pub event: String,
    pub details: serde_json::Value,
}

fn obs_log_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("observations.jsonl")
}

pub(crate) fn now_iso8601() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let days = (secs / 86400) as u32;
    let (year, month, day) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

fn days_to_ymd(mut days: u32) -> (u32, u32, u32) {
    let mut year = 1970u32;
    loop {
        let leap =
            (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400);
    let days_in_month: [u32; 12] = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1u32;
    for &dim in &days_in_month {
        if days < dim {
            break;
        }
        days -= dim;
        month += 1;
    }
    (year, month, days + 1)
}

pub fn log_observation(event: &str, details: serde_json::Value) {
    let obs = Observation {
        timestamp: now_iso8601(),
        event: event.to_string(),
        details,
    };
    let path = obs_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Ok(line) = serde_json::to_string(&obs) {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            writeln!(file, "{}", line).ok();
        }
    }
}
