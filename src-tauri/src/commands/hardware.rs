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
        .args([
            "--query-gpu",
            query,
            "--format",
            "csv,noheader,nounits",
        ])
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

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_gpu_status() -> Result<Vec<GpuStatus>, String> {
    tokio::task::spawn_blocking(fetch_gpu_status_sync)
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
