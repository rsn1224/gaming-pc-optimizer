use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub memory_mb: f64,
    pub cpu_percent: f32,
    pub exe_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KillResult {
    pub killed: Vec<String>,
    pub skipped: Vec<String>,
    pub freed_memory_mb: f64,
}

// 既存のgaming_optimizer.pyから移植した33種のブロートウェアリスト
pub(crate) const BLOATWARE_PROCESSES: &[&str] = &[
    "OneDrive.exe",
    "Cortana.exe",
    "SearchUI.exe",
    "SearchApp.exe",
    "YourPhone.exe",
    "PhoneExperienceHost.exe",
    "GameBarPresenceWriter.exe",
    "SkypeApp.exe",
    "SkypeBackgroundHost.exe",
    "Teams.exe",
    "Spotify.exe",
    "SpotifyWebHelper.exe",
    "iTunesHelper.exe",
    "AdobeUpdateService.exe",
    "AdobeARM.exe",
    "CCXProcess.exe",
    "jusched.exe",
    "Dropbox.exe",
    "GoogleDriveSync.exe",
    "iCloudServices.exe",
    "Discord.exe",
    "Slack.exe",
    "Telegram.exe",
    "WhatsApp.exe",
    "MicrosoftEdgeUpdate.exe",
    "GoogleUpdate.exe",
    "HPTouchpointAnalyticsService.exe",
    "ETDCtrl.exe",
    "SynTPEnhService.exe",
    "TabTip.exe",
    "CalculatorApp.exe",
    "People.exe",
    "HxTsr.exe",
];

#[tauri::command]
pub async fn get_running_processes() -> Result<Vec<ProcessInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new_all();
        sys.refresh_all();

        let bloatware_set: std::collections::HashSet<&str> =
            BLOATWARE_PROCESSES.iter().cloned().collect();

        sys.processes()
            .values()
            .filter(|p| {
                let name = p.name().to_string_lossy().to_string();
                bloatware_set.contains(name.as_str())
            })
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string_lossy().to_string(),
                memory_mb: p.memory() as f64 / 1024.0 / 1024.0,
                cpu_percent: p.cpu_usage(),
                exe_path: p
                    .exe()
                    .map(|e| e.to_string_lossy().to_string())
                    .unwrap_or_default(),
            })
            .collect::<Vec<_>>()
    })
    .await
    .map(Ok)
    .map_err(|e| e.to_string())?
}

/// Returns ALL running processes (not just bloatware), sorted by CPU usage descending.
/// Used by the ProcessAnalysis page to show Top-10 CPU / Top-10 Memory lists.
#[tauri::command]
pub async fn get_all_processes() -> Result<Vec<ProcessInfo>, String> {
    tokio::task::spawn_blocking(|| {
        use std::thread::sleep;
        use std::time::Duration;
        // Two-pass CPU measurement: refresh, wait briefly, refresh again for accurate cpu_usage
        let mut sys = System::new_all();
        sys.refresh_all();
        sleep(Duration::from_millis(200));
        sys.refresh_all();

        let mut procs: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string_lossy().to_string(),
                memory_mb: p.memory() as f64 / 1024.0 / 1024.0,
                cpu_percent: p.cpu_usage(),
                exe_path: p
                    .exe()
                    .map(|e| e.to_string_lossy().to_string())
                    .unwrap_or_default(),
            })
            .collect();

        // Sort by CPU descending
        procs.sort_by(|a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        procs
    })
    .await
    .map(Ok)
    .map_err(|e| e.to_string())?
}

/// Kill a single process by PID.
#[tauri::command]
pub async fn kill_process(pid: u32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        use sysinfo::Pid;
        let mut sys = System::new_all();
        sys.refresh_all();
        let pid = Pid::from_u32(pid);
        if let Some(process) = sys.process(pid) {
            if process.kill() {
                Ok(())
            } else {
                Err(format!("PID {} の停止に失敗しました", pid))
            }
        } else {
            Err(format!("PID {} が見つかりません", pid))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kill_bloatware(targets: Option<Vec<String>>) -> Result<KillResult, String> {
    tokio::task::spawn_blocking(move || {
        let mut sys = System::new_all();
        sys.refresh_all();

        let target_set: std::collections::HashSet<String> = match targets {
            Some(t) => t.into_iter().collect(),
            None => BLOATWARE_PROCESSES.iter().map(|s| s.to_string()).collect(),
        };

        let mut killed = Vec::new();
        let mut skipped = Vec::new();
        let mut freed_bytes: u64 = 0;

        for process in sys.processes().values() {
            let name = process.name().to_string_lossy().to_string();
            if target_set.contains(&name) {
                freed_bytes += process.memory();
                if process.kill() {
                    killed.push(name);
                } else {
                    skipped.push(name);
                }
            }
        }

        let result = KillResult {
            killed: killed.clone(),
            skipped: skipped.clone(),
            freed_memory_mb: freed_bytes as f64 / 1024.0 / 1024.0,
        };
        super::log_observation(
            "kill_bloatware",
            serde_json::json!({
                "killed": killed,
                "skipped": skipped,
                "freed_memory_mb": result.freed_memory_mb,
            }),
        );
        result
    })
    .await
    .map(Ok)
    .map_err(|e| e.to_string())?
}
