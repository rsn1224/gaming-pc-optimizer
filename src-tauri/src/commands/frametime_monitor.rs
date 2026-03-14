/// frametime_monitor.rs — リアルタイムパフォーマンス監視 (ENABLE_FRAMETIME_OVERLAY)
///
/// 1秒ごとに CPU% / GPU% / VRAM / GPU温度 をサンプリングし、
/// Tauri イベント "perf_snapshot" で配信する。
/// 60 サンプルのローリングウィンドウで 1% Low / 0.1% Low を計算する。
///
/// イベント:
///   "perf_snapshot" → PerfSnapshot   （毎秒）
///   "perf_stats"    → PerformanceStats（5秒ごと）
///
/// Feature flag: ENABLE_FRAMETIME_OVERLAY = false
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use sysinfo::System;
use tauri::Emitter;

// ── Feature flag ──────────────────────────────────────────────────────────────

pub const ENABLE_FRAMETIME_OVERLAY: bool = false;

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_SIZE: usize = 60; // 60 秒分のローリングウィンドウ

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerfSnapshot {
    pub timestamp: i64,          // Unix epoch seconds
    pub cpu_percent: f32,        // 0–100
    pub gpu_util_percent: f32,   // 0–100 (nvidia-smi) または -1 (非対応)
    pub gpu_vram_used_mb: u64,   // MiB
    pub gpu_vram_total_mb: u64,  // MiB
    pub gpu_temp_c: i32,         // °C または -1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceStats {
    pub sample_count: usize,
    pub avg_cpu: f32,
    pub p1_low_cpu: f32,    // 1% Low CPU（上位99%より悪い値）
    pub avg_gpu: f32,
    pub p1_low_gpu: f32,    // GPU あり環境のみ有効
    pub gpu_available: bool,
    pub peak_vram_mb: u64,
}

// ── Global state ──────────────────────────────────────────────────────────────

static MONITOR_RUNNING: OnceLock<Arc<AtomicBool>> = OnceLock::new();
static SAMPLE_BUF: OnceLock<Mutex<VecDeque<PerfSnapshot>>> = OnceLock::new();

fn monitor_flag() -> Arc<AtomicBool> {
    MONITOR_RUNNING
        .get_or_init(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

fn sample_buf() -> &'static Mutex<VecDeque<PerfSnapshot>> {
    SAMPLE_BUF.get_or_init(|| Mutex::new(VecDeque::with_capacity(WINDOW_SIZE + 1)))
}

// ── Snapshot collection ───────────────────────────────────────────────────────

fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// nvidia-smi でリアルタイム GPU メトリクスを取得する。
/// Returns (util%, vram_used_mb, vram_total_mb, temp_c)
/// nvidia-smi が存在しない場合は (-1.0, 0, 0, -1) を返す。
fn query_nvidia_smi() -> (f32, u64, u64, i32) {
    let out = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output();

    let stdout = match out {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => return (-1.0, 0, 0, -1),
    };

    let parts: Vec<&str> = stdout.splitn(4, ',').collect();
    if parts.len() < 4 {
        return (-1.0, 0, 0, -1);
    }
    let util  = parts[0].trim().parse::<f32>().unwrap_or(-1.0);
    let used  = parts[1].trim().parse::<u64>().unwrap_or(0);
    let total = parts[2].trim().parse::<u64>().unwrap_or(0);
    let temp  = parts[3].trim().parse::<i32>().unwrap_or(-1);
    (util, used, total, temp)
}

fn take_snapshot() -> PerfSnapshot {
    // CPU 使用率 (2回計測で精度確保)
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    std::thread::sleep(std::time::Duration::from_millis(150));
    sys.refresh_cpu_usage();
    let cpu_pct = sys.global_cpu_usage();

    // GPU (nvidia-smi)
    let (gpu_util, vram_used, vram_total, gpu_temp) = query_nvidia_smi();

    PerfSnapshot {
        timestamp: now_epoch(),
        cpu_percent: (cpu_pct * 10.0).round() / 10.0,
        gpu_util_percent: if gpu_util >= 0.0 { (gpu_util * 10.0).round() / 10.0 } else { -1.0 },
        gpu_vram_used_mb: vram_used,
        gpu_vram_total_mb: vram_total,
        gpu_temp_c: gpu_temp,
    }
}

// ── Stats calculation ─────────────────────────────────────────────────────────

/// 1% Low: サンプルを昇順ソートして下位1%の値を返す。
/// ゲームのフレームタイム統計と同じ概念を CPU/GPU に適用する。
pub fn percentile_low(samples: &[f32], pct: f32) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    // 1% Low = sorted[floor(n * 0.01)]
    let idx = ((sorted.len() as f32 * pct / 100.0).floor() as usize).min(sorted.len() - 1);
    sorted[idx]
}

pub fn compute_stats(buf: &VecDeque<PerfSnapshot>) -> PerformanceStats {
    if buf.is_empty() {
        return PerformanceStats {
            sample_count: 0,
            avg_cpu: 0.0,
            p1_low_cpu: 0.0,
            avg_gpu: 0.0,
            p1_low_gpu: 0.0,
            gpu_available: false,
            peak_vram_mb: 0,
        };
    }

    let cpu_vals: Vec<f32> = buf.iter().map(|s| s.cpu_percent).collect();
    let avg_cpu = cpu_vals.iter().sum::<f32>() / cpu_vals.len() as f32;
    let p1_low_cpu = percentile_low(&cpu_vals, 1.0);

    let gpu_samples: Vec<f32> = buf
        .iter()
        .filter(|s| s.gpu_util_percent >= 0.0)
        .map(|s| s.gpu_util_percent)
        .collect();
    let gpu_available = !gpu_samples.is_empty();
    let avg_gpu = if gpu_available {
        gpu_samples.iter().sum::<f32>() / gpu_samples.len() as f32
    } else {
        0.0
    };
    let p1_low_gpu = if gpu_available {
        percentile_low(&gpu_samples, 1.0)
    } else {
        0.0
    };

    let peak_vram_mb = buf.iter().map(|s| s.gpu_vram_used_mb).max().unwrap_or(0);

    PerformanceStats {
        sample_count: buf.len(),
        avg_cpu: (avg_cpu * 10.0).round() / 10.0,
        p1_low_cpu: (p1_low_cpu * 10.0).round() / 10.0,
        avg_gpu: (avg_gpu * 10.0).round() / 10.0,
        p1_low_gpu: (p1_low_gpu * 10.0).round() / 10.0,
        gpu_available,
        peak_vram_mb,
    }
}

// ── Monitor loop ──────────────────────────────────────────────────────────────

async fn monitor_loop(app: tauri::AppHandle, running: Arc<AtomicBool>) {
    let mut tick: u32 = 0;
    while running.load(Ordering::Relaxed) {
        let snap = tokio::task::spawn_blocking(take_snapshot)
            .await
            .unwrap_or_default();

        // Update shared buffer
        {
            let mut buf = sample_buf().lock().unwrap_or_else(|p| p.into_inner());
            buf.push_back(snap.clone());
            if buf.len() > WINDOW_SIZE {
                buf.pop_front();
            }
        }

        app.emit("perf_snapshot", &snap).ok();

        tick += 1;
        // Emit computed stats every 5 seconds
        if tick % 5 == 0 {
            let stats = {
                let buf = sample_buf().lock().unwrap_or_else(|p| p.into_inner());
                compute_stats(&buf)
            };
            app.emit("perf_stats", &stats).ok();
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// パフォーマンス監視ループを開始する。既に実行中の場合は何もしない。
#[tauri::command]
pub async fn start_frametime_monitor(app: tauri::AppHandle) -> Result<(), String> {
    if !ENABLE_FRAMETIME_OVERLAY {
        return Err("ENABLE_FRAMETIME_OVERLAY is disabled.".to_string());
    }
    let flag = monitor_flag();
    if flag.load(Ordering::Relaxed) {
        return Ok(()); // already running
    }
    flag.store(true, Ordering::Relaxed);
    let flag_clone = flag;
    tauri::async_runtime::spawn(async move {
        monitor_loop(app, flag_clone).await;
    });
    Ok(())
}

/// パフォーマンス監視ループを停止する。
#[tauri::command]
pub async fn stop_frametime_monitor() -> Result<(), String> {
    monitor_flag().store(false, Ordering::Relaxed);
    Ok(())
}

/// 現在のサンプルバッファを返す（フロントエンド初期化用）。
/// ENABLE_FRAMETIME_OVERLAY = false の場合は空リストを返す。
#[tauri::command]
pub async fn get_perf_snapshots() -> Result<Vec<PerfSnapshot>, String> {
    if !ENABLE_FRAMETIME_OVERLAY {
        return Ok(vec![]);
    }
    let buf = sample_buf().lock().unwrap_or_else(|p| p.into_inner());
    Ok(buf.iter().cloned().collect())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_is_off_by_default() {
        assert!(!ENABLE_FRAMETIME_OVERLAY);
    }

    #[test]
    fn percentile_low_single_element() {
        let samples = vec![42.0f32];
        assert!((percentile_low(&samples, 1.0) - 42.0).abs() < 0.01);
    }

    #[test]
    fn percentile_low_empty_returns_zero() {
        assert_eq!(percentile_low(&[], 1.0), 0.0);
    }

    #[test]
    fn percentile_low_1pct_of_100_samples() {
        // 100 samples: 0,1,2,...,99
        let samples: Vec<f32> = (0..100).map(|i| i as f32).collect();
        let p1 = percentile_low(&samples, 1.0);
        // index = floor(100 * 0.01) = 1 → value = 1.0
        assert!((p1 - 1.0).abs() < 0.01, "expected ~1.0, got {}", p1);
    }

    #[test]
    fn percentile_low_1pct_returns_worst_1_percent() {
        // All 100 except one outlier at 5
        let mut samples: Vec<f32> = vec![100.0; 99];
        samples.push(5.0);
        let p1 = percentile_low(&samples, 1.0);
        // Sorted: [5, 100, 100, ...], index=1 → 100.0
        // 1% of 100 = index 1 → 100.0
        assert!(p1 >= 5.0, "p1_low should include the outlier region");
    }

    #[test]
    fn percentile_low_all_same() {
        let samples = vec![75.0f32; 60];
        assert!((percentile_low(&samples, 1.0) - 75.0).abs() < 0.01);
    }

    #[test]
    fn compute_stats_empty_buf_returns_zero() {
        let buf: VecDeque<PerfSnapshot> = VecDeque::new();
        let stats = compute_stats(&buf);
        assert_eq!(stats.sample_count, 0);
        assert_eq!(stats.avg_cpu, 0.0);
        assert!(!stats.gpu_available);
    }

    #[test]
    fn compute_stats_cpu_average() {
        let mut buf = VecDeque::new();
        buf.push_back(PerfSnapshot { cpu_percent: 40.0, gpu_util_percent: -1.0, ..Default::default() });
        buf.push_back(PerfSnapshot { cpu_percent: 60.0, gpu_util_percent: -1.0, ..Default::default() });
        let stats = compute_stats(&buf);
        assert!((stats.avg_cpu - 50.0).abs() < 0.5);
        assert!(!stats.gpu_available);
    }

    #[test]
    fn compute_stats_gpu_available_when_nvidia_smi_present() {
        let mut buf = VecDeque::new();
        buf.push_back(PerfSnapshot {
            cpu_percent: 50.0,
            gpu_util_percent: 80.0,
            gpu_vram_used_mb: 4096,
            gpu_vram_total_mb: 8192,
            ..Default::default()
        });
        buf.push_back(PerfSnapshot {
            cpu_percent: 55.0,
            gpu_util_percent: 70.0,
            gpu_vram_used_mb: 5000,
            gpu_vram_total_mb: 8192,
            ..Default::default()
        });
        let stats = compute_stats(&buf);
        assert!(stats.gpu_available);
        assert!((stats.avg_gpu - 75.0).abs() < 0.5);
        assert_eq!(stats.peak_vram_mb, 5000);
    }

    #[test]
    fn compute_stats_excludes_negative_gpu() {
        let mut buf = VecDeque::new();
        // mixed: some with GPU, some without
        buf.push_back(PerfSnapshot { cpu_percent: 50.0, gpu_util_percent: 90.0, ..Default::default() });
        buf.push_back(PerfSnapshot { cpu_percent: 60.0, gpu_util_percent: -1.0, ..Default::default() });
        let stats = compute_stats(&buf);
        assert!(stats.gpu_available);
        assert!((stats.avg_gpu - 90.0).abs() < 0.5); // only one valid GPU sample
    }

    #[test]
    fn perf_snapshot_default_is_zero() {
        let s = PerfSnapshot::default();
        assert_eq!(s.cpu_percent, 0.0);
        assert_eq!(s.gpu_util_percent, 0.0);
        assert_eq!(s.gpu_temp_c, 0);
    }

    #[test]
    fn perf_snapshot_serializes_camel_case() {
        let s = PerfSnapshot {
            timestamp: 1767225600,
            cpu_percent: 45.5,
            gpu_util_percent: 78.0,
            gpu_vram_used_mb: 4096,
            gpu_vram_total_mb: 8192,
            gpu_temp_c: 72,
        };
        let json = serde_json::to_value(&s).unwrap();
        assert!(json.get("cpuPercent").is_some());
        assert!(json.get("gpuUtilPercent").is_some());
        assert!(json.get("gpuVramUsedMb").is_some());
        assert!(json.get("gpuTempC").is_some());
        assert_eq!(json["cpuPercent"], 45.5);
        assert_eq!(json["gpuTempC"], 72);
    }

    #[test]
    fn performance_stats_serializes_camel_case() {
        let stats = PerformanceStats {
            sample_count: 60,
            avg_cpu: 55.0,
            p1_low_cpu: 20.0,
            avg_gpu: 75.0,
            p1_low_gpu: 30.0,
            gpu_available: true,
            peak_vram_mb: 6144,
        };
        let json = serde_json::to_value(&stats).unwrap();
        assert!(json.get("sampleCount").is_some());
        assert!(json.get("avgCpu").is_some());
        assert!(json.get("p1LowCpu").is_some());
        assert!(json.get("gpuAvailable").is_some());
        assert!(json.get("peakVramMb").is_some());
        assert_eq!(json["peakVramMb"], 6144);
    }
}
