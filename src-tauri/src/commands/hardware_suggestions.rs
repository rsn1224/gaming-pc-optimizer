/// hardware_suggestions.rs — ルールベースのハードウェア診断 (S8-03)
///
/// Feature flag: ENABLE_HARDWARE_SUGGESTIONS
/// CPU / GPU / RAM の現在状態を解析し、改善提案を返す。
/// AI キー不要のローカル診断エンジン。

use serde::{Deserialize, Serialize};
use sysinfo::System;

// ── Feature flag ─────────────────────────────────────────────────────────────

pub const ENABLE_HARDWARE_SUGGESTIONS: bool = true;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareSuggestion {
    pub id: String,
    /// "cpu" | "gpu" | "memory" | "thermal" | "system"
    pub category: String,
    pub title: String,
    pub detail: String,
    /// "info" | "warning" | "critical"
    pub severity: String,
    /// 推奨アクション（任意）
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareDiagnostics {
    pub cpu_usage_percent: f32,
    pub memory_used_percent: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub gpu_temp_c: Option<u32>,
    pub gpu_utilization_percent: Option<u32>,
    pub gpu_name: Option<String>,
    pub suggestions: Vec<HardwareSuggestion>,
}

// ── Command ───────────────────────────────────────────────────────────────────

/// ハードウェア診断データと改善提案を返す。
/// 呼び出し元は `ENABLE_HARDWARE_SUGGESTIONS` を確認してから使用すること。
#[tauri::command]
pub fn get_hardware_diagnostics() -> HardwareDiagnostics {
    // ── Collect system metrics ────────────────────────────────────────────────
    let mut sys = System::new();
    sys.refresh_memory();
    // CPU usage requires two samples; use the global value from a fresh system
    // (first-call value may be 0, which is acceptable for a quick snapshot)
    sys.refresh_cpu_usage();

    let cpu_usage = sys.global_cpu_usage();
    let memory_used_mb = sys.used_memory() / 1024 / 1024;
    let memory_total_mb = sys.total_memory() / 1024 / 1024;
    let memory_percent = if memory_total_mb > 0 {
        (memory_used_mb as f32 / memory_total_mb as f32) * 100.0
    } else {
        0.0
    };

    // ── GPU metrics (best-effort, NVIDIA only) ────────────────────────────────
    let (gpu_temp, gpu_util, gpu_name) = match super::hardware::fetch_gpu_status_sync() {
        Ok(list) => {
            if let Some(gpu) = list.into_iter().next() {
                (Some(gpu.temperature_c), Some(gpu.utilization_percent), Some(gpu.name))
            } else {
                (None, None, None)
            }
        }
        Err(_) => (None, None, None),
    };

    // ── Rule engine ───────────────────────────────────────────────────────────
    let mut suggestions: Vec<HardwareSuggestion> = Vec::new();

    // CPU rules
    if cpu_usage > 90.0 {
        suggestions.push(HardwareSuggestion {
            id: "cpu_critical".to_string(),
            category: "cpu".to_string(),
            title: "CPU 使用率が危険域".to_string(),
            detail: format!("現在 {:.0}% 使用中。ゲーム中のバックグラウンド処理が重大なボトルネックになっています。", cpu_usage),
            severity: "critical".to_string(),
            action: Some("ブロートウェア終了".to_string()),
        });
    } else if cpu_usage > 80.0 {
        suggestions.push(HardwareSuggestion {
            id: "cpu_high".to_string(),
            category: "cpu".to_string(),
            title: "CPU 使用率が高い".to_string(),
            detail: format!("現在 {:.0}% 使用中。不要なバックグラウンドプロセスを終了することで改善できます。", cpu_usage),
            severity: "warning".to_string(),
            action: Some("プロセス管理".to_string()),
        });
    }

    // Memory rules
    if memory_percent > 90.0 {
        suggestions.push(HardwareSuggestion {
            id: "memory_critical".to_string(),
            category: "memory".to_string(),
            title: "メモリ使用率が危険域".to_string(),
            detail: format!(
                "{}MB / {}MB ({:.0}%) 使用中。スワップが発生している可能性があります。不要なアプリを終了してください。",
                memory_used_mb, memory_total_mb, memory_percent
            ),
            severity: "critical".to_string(),
            action: Some("ブロートウェア終了".to_string()),
        });
    } else if memory_percent > 80.0 {
        suggestions.push(HardwareSuggestion {
            id: "memory_high".to_string(),
            category: "memory".to_string(),
            title: "メモリ使用率が高い".to_string(),
            detail: format!(
                "{}MB / {}MB ({:.0}%) 使用中。メモリクリーナーで空きを増やせます。",
                memory_used_mb, memory_total_mb, memory_percent
            ),
            severity: "warning".to_string(),
            action: Some("メモリクリーン".to_string()),
        });
    } else if memory_percent > 70.0 {
        suggestions.push(HardwareSuggestion {
            id: "memory_moderate".to_string(),
            category: "memory".to_string(),
            title: "メモリ使用率がやや高め".to_string(),
            detail: format!("{:.0}% 使用中。ゲーム前にメモリクリーンを実行すると快適です。", memory_percent),
            severity: "info".to_string(),
            action: Some("メモリクリーン".to_string()),
        });
    }

    // GPU thermal rules
    if let Some(temp) = gpu_temp {
        if temp >= 90 {
            suggestions.push(HardwareSuggestion {
                id: "gpu_critical_temp".to_string(),
                category: "thermal".to_string(),
                title: "GPU 温度が非常に高い".to_string(),
                detail: format!("{}°C — サーマルスロットリングが発生しています。GPU電力制限を下げてください。", temp),
                severity: "critical".to_string(),
                action: Some("GPU 電力制限".to_string()),
            });
        } else if temp >= 83 {
            suggestions.push(HardwareSuggestion {
                id: "gpu_high_temp".to_string(),
                category: "thermal".to_string(),
                title: "GPU 温度が上昇中".to_string(),
                detail: format!("{}°C — 注意域です。ケースのエアフローや GPU ファン速度を確認してください。", temp),
                severity: "warning".to_string(),
                action: None,
            });
        }
    }

    // CPU bottleneck detection (GPU util low while CPU is high)
    if let (Some(util), true) = (gpu_util, cpu_usage > 75.0) {
        if util < 40 {
            suggestions.push(HardwareSuggestion {
                id: "cpu_bottleneck".to_string(),
                category: "cpu".to_string(),
                title: "CPU ボトルネックの可能性".to_string(),
                detail: format!(
                    "CPU {:.0}% に対し GPU {}% — CPU が処理の律速になっています。電源プランを Ultimate Performance に切り替えると改善することがあります。",
                    cpu_usage, util
                ),
                severity: "info".to_string(),
                action: Some("電源プラン最適化".to_string()),
            });
        }
    }

    // All good
    if suggestions.is_empty() {
        suggestions.push(HardwareSuggestion {
            id: "all_good".to_string(),
            category: "system".to_string(),
            title: "システム状態: 良好".to_string(),
            detail: "現在、重大なハードウェア問題は検出されていません。".to_string(),
            severity: "info".to_string(),
            action: None,
        });
    }

    HardwareDiagnostics {
        cpu_usage_percent: cpu_usage,
        memory_used_percent: memory_percent,
        memory_used_mb,
        memory_total_mb,
        gpu_temp_c: gpu_temp,
        gpu_utilization_percent: gpu_util,
        gpu_name,
        suggestions,
    }
}
