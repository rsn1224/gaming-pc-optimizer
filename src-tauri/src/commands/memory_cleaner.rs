use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;
use sysinfo::{ProcessesToUpdate, System};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Deserialize, Clone)]
pub struct MemoryCleanResult {
    pub freed_mb: f64,
    pub before_used_mb: f64,
    pub after_used_mb: f64,
    pub before_percent: f32,
    pub after_percent: f32,
    pub method: String,
}

/// Get current memory usage and top consumers
#[tauri::command]
pub fn get_memory_info() -> Result<serde_json::Value, String> {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let total_mb = sys.total_memory() as f64 / 1024.0 / 1024.0;
    let used_mb = sys.used_memory() as f64 / 1024.0 / 1024.0;
    let percent = if total_mb > 0.0 {
        (used_mb / total_mb * 100.0) as f32
    } else {
        0.0
    };

    // Collect and sort processes by memory, take top 5
    let mut procs: Vec<(String, f64)> = sys
        .processes()
        .values()
        .map(|p| {
            let name = p.name().to_string_lossy().to_string();
            let mem_mb = p.memory() as f64 / 1024.0 / 1024.0;
            (name, mem_mb)
        })
        .collect();
    procs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    procs.dedup_by(|a, b| {
        if a.0 == b.0 {
            b.1 += a.1;
            true
        } else {
            false
        }
    });
    procs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let top_consumers: Vec<serde_json::Value> = procs
        .into_iter()
        .take(5)
        .map(|(name, memory_mb)| {
            serde_json::json!({
                "name": name,
                "memory_mb": (memory_mb * 10.0).round() / 10.0
            })
        })
        .collect();

    Ok(serde_json::json!({
        "used_mb": (used_mb * 10.0).round() / 10.0,
        "total_mb": (total_mb * 10.0).round() / 10.0,
        "percent": percent,
        "top_consumers": top_consumers
    }))
}

/// Clean memory using Windows EmptyWorkingSet API and GC
#[tauri::command]
pub async fn clean_memory() -> Result<MemoryCleanResult, String> {
    // 1. Record memory before
    let (before_used_mb, before_percent) = {
        let mut sys = System::new_all();
        sys.refresh_memory();
        let total = sys.total_memory() as f64 / 1024.0 / 1024.0;
        let used = sys.used_memory() as f64 / 1024.0 / 1024.0;
        let pct = if total > 0.0 {
            (used / total * 100.0) as f32
        } else {
            0.0
        };
        (used, pct)
    };

    // 2. Run EmptyWorkingSet via PowerShell (CREATE_NO_WINDOW)
    let ews_script = r#"Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Mem{[DllImport("psapi.dll")]public static extern bool EmptyWorkingSet(IntPtr p);}'; Get-Process | ForEach-Object { try { [Mem]::EmptyWorkingSet($_.Handle) } catch {} }"#;
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ews_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    // 3. Also trigger .NET GC
    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[System.GC]::Collect()",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    // 4. Wait 1 second
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    // 5. Record memory after
    let (after_used_mb, after_percent) = {
        let mut sys = System::new_all();
        sys.refresh_memory();
        let total = sys.total_memory() as f64 / 1024.0 / 1024.0;
        let used = sys.used_memory() as f64 / 1024.0 / 1024.0;
        let pct = if total > 0.0 {
            (used / total * 100.0) as f32
        } else {
            0.0
        };
        (used, pct)
    };

    let freed_mb = (before_used_mb - after_used_mb).max(0.0);

    Ok(MemoryCleanResult {
        freed_mb: (freed_mb * 10.0).round() / 10.0,
        before_used_mb: (before_used_mb * 10.0).round() / 10.0,
        after_used_mb: (after_used_mb * 10.0).round() / 10.0,
        before_percent,
        after_percent,
        method: "EmptyWorkingSet + GC".to_string(),
    })
}
