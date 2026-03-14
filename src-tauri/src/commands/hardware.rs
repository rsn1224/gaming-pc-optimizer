use serde::{Deserialize, Serialize};
use std::process::Command;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GpuStatus {
    pub name: String,
    pub vram_total_mb: u64,
    pub vram_used_mb: u64,
    pub temperature_c: u32,
    pub power_draw_w: f32,
    pub power_limit_w: f32,
    pub power_limit_default_w: f32,
    pub fan_speed_percent: u32,
    pub utilization_percent: u32,
    pub driver_version: String,
}

// ── Internal helper (callable from ai.rs) ─────────────────────────────────────

pub(crate) fn fetch_gpu_status_sync() -> Result<Vec<GpuStatus>, String> {
    let query = "name,memory.total,memory.used,temperature.gpu,power.draw,power.limit,power.default_limit,fan.speed,utilization.gpu,driver_version";

    let output = Command::new("nvidia-smi")
        .args(["--query-gpu", query, "--format", "csv,noheader,nounits"])
        .output()
        .map_err(|_| "NVIDIA GPUが見つかりません（nvidia-smiが利用できません）".to_string())?;

    if !output.status.success() {
        return Err("nvidia-smiの実行に失敗しました。NVIDIA GPUが必要です。".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut gpus = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() < 10 {
            continue;
        }

        // Skip "N/A" for fan speed (some GPUs report N/A)
        let fan = if parts[7].eq_ignore_ascii_case("n/a") {
            0
        } else {
            parts[7].parse().unwrap_or(0)
        };

        gpus.push(GpuStatus {
            name: parts[0].to_string(),
            vram_total_mb: parts[1].parse().unwrap_or(0),
            vram_used_mb: parts[2].parse().unwrap_or(0),
            temperature_c: parts[3].parse().unwrap_or(0),
            power_draw_w: parts[4].parse().unwrap_or(0.0),
            power_limit_w: parts[5].parse().unwrap_or(0.0),
            power_limit_default_w: parts[6].parse().unwrap_or(0.0),
            fan_speed_percent: fan,
            utilization_percent: parts[8].parse().unwrap_or(0),
            driver_version: parts[9].to_string(),
        });
    }

    if gpus.is_empty() {
        return Err("GPU情報を取得できませんでした".to_string());
    }

    Ok(gpus)
}

// ── Motherboard info ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MotherboardInfo {
    pub manufacturer: String,
    pub product: String,
    pub serial_number: String,
    pub version: String,
}

#[tauri::command]
pub async fn get_motherboard_info() -> Result<MotherboardInfo, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
$b = Get-WmiObject Win32_BaseBoard
Write-Output ($b.Manufacturer + '|' + $b.Product + '|' + $b.SerialNumber + '|' + $b.Version)
"#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .map_err(|e| format!("PowerShell実行エラー: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = stdout.splitn(4, '|').collect();

        Ok(MotherboardInfo {
            manufacturer: parts.first().unwrap_or(&"").trim().to_string(),
            product: parts.get(1).unwrap_or(&"").trim().to_string(),
            serial_number: parts.get(2).unwrap_or(&"").trim().to_string(),
            version: parts.get(3).unwrap_or(&"").trim().to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── CPU detailed info ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CpuDetailedInfo {
    pub name: String,
    pub manufacturer: String,
    pub socket: String,
    pub max_clock_mhz: u32,
    pub cores: u32,
    pub logical_processors: u32,
    pub l2_cache_kb: u32,
    pub l3_cache_kb: u32,
    pub architecture: String,
}

#[tauri::command]
pub async fn get_cpu_detailed_info() -> Result<CpuDetailedInfo, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
$c = Get-WmiObject Win32_Processor | Select-Object -First 1
$arch = switch ($c.Architecture) {
    0 { 'x86' } 1 { 'MIPS' } 2 { 'Alpha' } 3 { 'PowerPC' }
    5 { 'ARM' } 6 { 'ia64' } 9 { 'x64' } default { 'Unknown' }
}
Write-Output ($c.Name + '|' + $c.Manufacturer + '|' + $c.SocketDesignation + '|' +
    $c.MaxClockSpeed + '|' + $c.NumberOfCores + '|' + $c.NumberOfLogicalProcessors + '|' +
    $c.L2CacheSize + '|' + $c.L3CacheSize + '|' + $arch)
"#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .map_err(|e| format!("PowerShell実行エラー: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = stdout.splitn(9, '|').collect();

        Ok(CpuDetailedInfo {
            name: parts.first().unwrap_or(&"").trim().to_string(),
            manufacturer: parts.get(1).unwrap_or(&"").trim().to_string(),
            socket: parts.get(2).unwrap_or(&"").trim().to_string(),
            max_clock_mhz: parts.get(3).unwrap_or(&"0").trim().parse().unwrap_or(0),
            cores: parts.get(4).unwrap_or(&"0").trim().parse().unwrap_or(0),
            logical_processors: parts.get(5).unwrap_or(&"0").trim().parse().unwrap_or(0),
            l2_cache_kb: parts.get(6).unwrap_or(&"0").trim().parse().unwrap_or(0),
            l3_cache_kb: parts.get(7).unwrap_or(&"0").trim().parse().unwrap_or(0),
            architecture: parts.get(8).unwrap_or(&"").trim().to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_gpu_status() -> Result<Vec<GpuStatus>, String> {
    tokio::task::spawn_blocking(fetch_gpu_status_sync)
        .await
        .map_err(|e| e.to_string())?
}

// ── Temperature snapshot ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct TempSnapshot {
    pub timestamp: u64,
    pub gpu_temp_c: f32,
    pub cpu_temp_c: f32,
}

#[tauri::command]
pub async fn get_temperature_snapshot() -> Result<TempSnapshot, String> {
    tokio::task::spawn_blocking(|| {
        use std::time::{SystemTime, UNIX_EPOCH};

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // GPU temperature via nvidia-smi
        let gpu_temp_c = fetch_gpu_status_sync()
            .ok()
            .and_then(|gpus| gpus.into_iter().next())
            .map(|g| g.temperature_c as f32)
            .unwrap_or(0.0);

        // CPU temperature via WMI MSAcpi_ThermalZoneTemperature (in tenths of Kelvin)
        let cpu_temp_c = {
            let output = Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    r#"try { $t = (Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace "root/wmi" -ErrorAction Stop | Select-Object -First 1); Write-Output ([math]::Round(($t.CurrentTemperature / 10.0) - 273.15, 1)) } catch { Write-Output '0' }"#,
                ])
                .output()
                .ok()
                .and_then(|o| {
                    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    s.parse::<f32>().ok()
                })
                .unwrap_or(0.0);
            // Sanity-check: valid CPU temp is between 0 and 120°C
            if output > 0.0 && output < 120.0 { output } else { 0.0 }
        };

        Ok(TempSnapshot {
            timestamp,
            gpu_temp_c,
            cpu_temp_c,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── GPU power limit info ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct GpuPowerLimit {
    pub current_w: u32,
    pub default_w: u32,
    pub min_w: u32,
    pub max_w: u32,
}

#[tauri::command]
pub fn get_gpu_power_info() -> Result<GpuPowerLimit, String> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=power.limit,power.default_limit,power.min_limit,power.max_limit",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .map_err(|_| "NVIDIA GPUが見つかりません".to_string())?;

    if !output.status.success() {
        return Err("nvidia-smiの実行に失敗しました。NVIDIA GPUが必要です。".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let line = stdout.lines().next().unwrap_or("").trim().to_string();
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();

    if parts.len() < 4 {
        return Err("GPU電力情報を解析できませんでした".to_string());
    }

    let parse_w = |s: &str| -> u32 {
        s.trim()
            .parse::<f32>()
            .map(|v| v.round() as u32)
            .unwrap_or(0)
    };

    Ok(GpuPowerLimit {
        current_w: parse_w(parts[0]),
        default_w: parse_w(parts[1]),
        min_w: parse_w(parts[2]),
        max_w: parse_w(parts[3]),
    })
}

#[tauri::command]
pub async fn reset_gpu_power_limit() -> Result<(), String> {
    let info = tokio::task::spawn_blocking(get_gpu_power_info)
        .await
        .map_err(|e| e.to_string())??;

    let default_w = info.default_w;
    tokio::task::spawn_blocking(move || {
        let output = Command::new("nvidia-smi")
            .args(["--power-limit", &default_w.to_string()])
            .output()
            .map_err(|e| format!("nvidia-smiの実行に失敗しました: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!(
                "デフォルト電力制限の設定に失敗しました（管理者権限が必要な場合があります）: {}",
                stderr
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_gpu_fan_speed(percent: Option<u32>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        match percent {
            None => {
                // Auto mode: enable persistence + auto boost
                let r1 = Command::new("nvidia-smi")
                    .args(["-pm", "1"])
                    .output()
                    .map_err(|e| format!("nvidia-smiの実行に失敗しました: {}", e))?;
                if !r1.status.success() {
                    let stderr = String::from_utf8_lossy(&r1.stderr).to_string();
                    return Err(format!("NVIDIA GPUが見つかりません: {}", stderr));
                }
                Command::new("nvidia-smi")
                    .args(["--auto-boost-default=0"])
                    .output()
                    .map_err(|e| format!("nvidia-smiの実行に失敗しました: {}", e))?;
                Ok(())
            }
            Some(n) => {
                let output = Command::new("nvidia-smi")
                    .args(["-fan", &n.to_string()])
                    .output()
                    .map_err(|e| format!("nvidia-smiの実行に失敗しました: {}", e))?;

                if output.status.success() {
                    Ok(())
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    Err(format!(
                        "ファン速度の設定に失敗しました（管理者権限が必要な場合があります）: {}",
                        stderr
                    ))
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Set GPU power limit in watts for a given GPU index.
/// Requires administrator privileges and nvidia-smi.
#[tauri::command]
pub async fn set_gpu_power_limit(gpu_index: u32, watts: u32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("nvidia-smi")
            .args([
                "-i",
                &gpu_index.to_string(),
                "--power-limit",
                &watts.to_string(),
            ])
            .output()
            .map_err(|e| format!("nvidia-smiの実行に失敗しました: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Err(format!(
                "電力制限の設定に失敗しました（管理者権限が必要な場合があります）: {}{}",
                stderr, stdout
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
