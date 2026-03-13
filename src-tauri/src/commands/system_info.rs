use serde::{Deserialize, Serialize};
use std::process::Command;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub driver_version: String,
    pub vram_total_mb: f64,
    pub vram_used_mb: f64,
}

#[tauri::command]
pub fn get_gpu_info() -> Vec<GpuInfo> {
    // PowerShell で Win32_VideoController を照会 (nvml-wrapper 不要)
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-WmiObject Win32_VideoController | \
             Select-Object Name,DriverVersion,AdapterRAM | \
             ConvertTo-Json -Compress",
        ])
        .output();

    let Ok(o) = out else { return vec![] };
    let raw = String::from_utf8_lossy(&o.stdout);
    let raw = raw.trim();
    if raw.is_empty() { return vec![]; }

    // 単一オブジェクトの場合は配列に正規化
    let json_str = if raw.starts_with('[') {
        raw.to_string()
    } else {
        format!("[{}]", raw)
    };

    let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&json_str) else {
        return vec![];
    };

    arr.iter()
        .filter_map(|v| {
            let name = v["Name"].as_str().unwrap_or("").to_string();
            // Microsoft 基本/Remote Desktop 仮想アダプターを除外
            if name.to_lowercase().contains("microsoft") || name.to_lowercase().contains("remote") {
                return None;
            }
            let driver = v["DriverVersion"].as_str().unwrap_or("").to_string();
            // AdapterRAM は u64 または null
            let vram_bytes = v["AdapterRAM"].as_u64().unwrap_or(0);
            Some(GpuInfo {
                name,
                driver_version: driver,
                vram_total_mb: vram_bytes as f64 / 1024.0 / 1024.0,
                vram_used_mb: 0.0, // WMI では使用量は取得不可
            })
        })
        .collect()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub cpu_usage: f32,
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub memory_total_mb: f64,
    pub memory_used_mb: f64,
    pub memory_percent: f32,
    pub os_name: String,
    pub os_version: String,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

    // CPU使用率を正確に取得するため少し待つ
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage = sys
        .cpus()
        .iter()
        .map(|cpu| cpu.cpu_usage())
        .sum::<f32>()
        / sys.cpus().len() as f32;

    let cpu_name = sys
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let memory_total_mb = sys.total_memory() as f64 / 1024.0 / 1024.0;
    let memory_used_mb = sys.used_memory() as f64 / 1024.0 / 1024.0;
    let memory_percent = if sys.total_memory() > 0 {
        (sys.used_memory() as f32 / sys.total_memory() as f32) * 100.0
    } else {
        0.0
    };

    Ok(SystemInfo {
        cpu_usage,
        cpu_name,
        cpu_cores: sys.cpus().len(),
        memory_total_mb,
        memory_used_mb,
        memory_percent,
        os_name: System::name().unwrap_or_else(|| "Windows".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
    })
}
