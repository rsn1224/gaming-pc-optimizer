use super::rollback::{self, ChangeRecord, RiskLevel, SessionMode};
use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AllOptimizationResult {
    pub process_killed: usize,
    pub process_freed_mb: f64,
    pub power_plan_set: bool,
    pub windows_applied: bool,
    pub network_applied: bool,
    pub errors: Vec<String>,
}

/// A single change that WOULD be applied in dry-run preview.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewChange {
    pub category: String,
    pub target: String,
    pub current_value: serde_json::Value,
    pub new_value: serde_json::Value,
    pub risk_level: RiskLevel,
    /// false if the system is already at the target value
    pub will_apply: bool,
    pub description: String,
}

/// Result of a dry-run simulation (nothing was changed).
#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationResult {
    pub changes: Vec<PreviewChange>,
    pub safe_count: usize,
    pub caution_count: usize,
    pub advanced_count: usize,
    /// ID of the Sim session saved to disk (for display in RollbackCenter)
    pub session_id: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Read-only analysis of what `apply_all_optimizations` would change.
/// Called inside `spawn_blocking`; all calls are synchronous.
fn analyze_what_would_change(snapshot: &rollback::SystemSnapshot) -> Vec<PreviewChange> {
    let mut changes = Vec::new();

    // 1. Process stop (informational — we don't scan actual processes for speed)
    changes.push(PreviewChange {
        category: "process".to_string(),
        target: "ブロートウェア停止".to_string(),
        current_value: serde_json::Value::Null,
        new_value: serde_json::json!("既知のブロートウェアプロセスを停止"),
        risk_level: RiskLevel::Safe,
        will_apply: true,
        description: "OneDrive, Cortana, Xbox Game Bar 等の不要プロセスを停止します".to_string(),
    });

    // 2. Power plan
    let current_guid = snapshot.power_plan_guid.clone().unwrap_or_default();
    let is_ultimate = current_guid.to_lowercase().contains("e9a42b02");
    changes.push(PreviewChange {
        category: "power".to_string(),
        target: "電源プラン".to_string(),
        current_value: serde_json::json!(if current_guid.is_empty() {
            "不明"
        } else {
            current_guid.as_str()
        }),
        new_value: serde_json::json!("Ultimate Performance"),
        risk_level: RiskLevel::Caution,
        will_apply: !is_ultimate,
        description: "Ultimate Performance プランに切替（ACアダプタ接続推奨）".to_string(),
    });

    // 3. Windows settings — compare current vs gaming preset
    if let Some(ws_val) = &snapshot.windows_settings {
        if let Ok(ws) =
            serde_json::from_value::<super::windows_settings::WindowsSettings>(ws_val.clone())
        {
            let already_gaming = ws.visual_fx == 2
                && !ws.transparency
                && !ws.game_dvr
                && ws.menu_show_delay == 0
                && !ws.animate_windows;
            changes.push(PreviewChange {
                category: "windows".to_string(),
                target: "Windows 視覚効果・ゲーム設定".to_string(),
                current_value: ws_val.clone(),
                new_value: serde_json::json!({
                    "visual_fx": 2,
                    "transparency": false,
                    "game_dvr": false,
                    "menu_show_delay": 0,
                    "animate_windows": false
                }),
                risk_level: RiskLevel::Caution,
                will_apply: !already_gaming,
                description: "視覚効果をパフォーマンス優先に設定・Game DVR 無効化".to_string(),
            });
        }
    } else {
        // Snapshot missing — assume it will apply
        changes.push(PreviewChange {
            category: "windows".to_string(),
            target: "Windows 視覚効果・ゲーム設定".to_string(),
            current_value: serde_json::Value::Null,
            new_value: serde_json::json!({ "preset": "gaming" }),
            risk_level: RiskLevel::Caution,
            will_apply: true,
            description: "視覚効果をパフォーマンス優先に設定・Game DVR 無効化".to_string(),
        });
    }

    // 4. Network gaming tweaks
    let ns = super::network::get_network_settings();
    let already_gaming_net =
        ns.throttling_disabled && ns.system_responsiveness == 0 && ns.nagle_disabled;
    changes.push(PreviewChange {
        category: "network".to_string(),
        target: "ネットワーク最適化".to_string(),
        current_value: serde_json::to_value(&ns).unwrap_or(serde_json::Value::Null),
        new_value: serde_json::json!({
            "throttling_disabled": true,
            "system_responsiveness": 0,
            "nagle_disabled": true
        }),
        risk_level: RiskLevel::Advanced,
        will_apply: !already_gaming_net,
        description: "NetworkThrottling 無効化・Nagle アルゴリズム無効化（管理者権限必要）"
            .to_string(),
    });

    changes
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// One-shot command: kill bloatware → Ultimate Performance → gaming Windows
/// settings → gaming network tweaks. Each step is attempted independently
/// so a failure in one does not abort the rest.
#[tauri::command]
pub async fn apply_all_optimizations() -> Result<AllOptimizationResult, String> {
    // ── Phase 1: Rollback — capture before-state ──────────────────────────────
    let session_id: Option<String> = if rollback::ROLLBACK_CONFIG.enabled {
        let maybe =
            tokio::task::spawn_blocking(|| rollback::begin_session(SessionMode::Real, None))
                .await
                .ok();
        maybe.map(|s| s.id)
    } else {
        None
    };

    // ── Optimization steps (unchanged behaviour) ──────────────────────────────
    let mut result = AllOptimizationResult {
        process_killed: 0,
        process_freed_mb: 0.0,
        power_plan_set: false,
        windows_applied: false,
        network_applied: false,
        errors: Vec::new(),
    };

    // 1. Kill all known bloatware
    match super::process::kill_bloatware(None).await {
        Ok(r) => {
            result.process_killed = r.killed.len();
            result.process_freed_mb = r.freed_memory_mb;
        }
        Err(e) => result.errors.push(format!("プロセス停止: {}", e)),
    }

    // 2. Switch to Ultimate Performance power plan
    match super::power::set_ultimate_performance().await {
        Ok(_) => result.power_plan_set = true,
        Err(e) => result.errors.push(format!("電源プラン: {}", e)),
    }

    // 3. Apply gaming Windows settings (sync fn → spawn_blocking)
    match tokio::task::spawn_blocking(super::windows_settings::apply_gaming_windows_settings).await
    {
        Ok(Ok(_)) => result.windows_applied = true,
        Ok(Err(e)) => result.errors.push(format!("Windows設定: {}", e)),
        Err(e) => result.errors.push(format!("Windows設定(spawn): {}", e)),
    }

    // 4. Apply network gaming tweaks (sync fn → spawn_blocking)
    match tokio::task::spawn_blocking(super::network::apply_network_gaming).await {
        Ok(Ok(_)) => result.network_applied = true,
        Ok(Err(e)) => result.errors.push(format!("ネットワーク: {}", e)),
        Err(e) => result.errors.push(format!("ネットワーク(spawn): {}", e)),
    }

    super::log_observation(
        "apply_all_optimizations",
        serde_json::json!({
            "process_killed": result.process_killed,
            "process_freed_mb": result.process_freed_mb,
            "power_plan_set": result.power_plan_set,
            "windows_applied": result.windows_applied,
            "network_applied": result.network_applied,
            "errors": result.errors,
        }),
    );

    // ── Phase 1+2: Rollback + Metrics — finalize session ─────────────────────
    if let Some(ref sid) = session_id {
        if let Ok(mut session) = rollback::load_session(sid) {
            let snapshot = &session.snapshot;
            let changes = vec![
                ChangeRecord {
                    category: "process".to_string(),
                    target: "ブロートウェア停止".to_string(),
                    before: serde_json::Value::Null,
                    after: serde_json::json!({
                        "killed": result.process_killed,
                        "freed_mb": result.process_freed_mb
                    }),
                    risk_level: RiskLevel::Safe,
                    applied: result.process_killed > 0,
                },
                ChangeRecord {
                    category: "power".to_string(),
                    target: "電源プラン".to_string(),
                    before: snapshot
                        .power_plan_guid
                        .as_deref()
                        .map(serde_json::Value::from)
                        .unwrap_or(serde_json::Value::Null),
                    after: serde_json::json!("ultimate_performance"),
                    risk_level: RiskLevel::Caution,
                    applied: result.power_plan_set,
                },
                ChangeRecord {
                    category: "windows".to_string(),
                    target: "ゲーミング設定".to_string(),
                    before: snapshot
                        .windows_settings
                        .clone()
                        .unwrap_or(serde_json::Value::Null),
                    after: serde_json::json!({ "preset": "gaming" }),
                    risk_level: RiskLevel::Caution,
                    applied: result.windows_applied,
                },
                ChangeRecord {
                    category: "network".to_string(),
                    target: "ゲーミングネットワーク最適化".to_string(),
                    before: snapshot
                        .network_settings
                        .clone()
                        .unwrap_or(serde_json::Value::Null),
                    after: serde_json::json!({ "preset": "gaming" }),
                    risk_level: RiskLevel::Advanced,
                    applied: result.network_applied,
                },
            ];

            let summary = serde_json::to_value(&result).unwrap_or(serde_json::Value::Null);
            let success = result.errors.is_empty();
            rollback::complete_session(&mut session, changes, summary, success);
            rollback::save_session(&session).ok();
        }

        // Phase 2: capture after-metrics
        let sid_clone = sid.clone();
        tokio::task::spawn_blocking(move || {
            let after = super::metrics::capture_metrics();
            rollback::update_metrics_after(&sid_clone, after);
        })
        .await
        .ok();
    }

    // Save score snapshot after optimization
    tokio::task::spawn_blocking(|| {
        let score = compute_optimization_score();
        save_score_snapshot_internal(&score);
    })
    .await
    .ok();

    // Log the optimization event
    super::event_log::add_event_internal(
        "optimization_run",
        "全最適化を実行しました",
        &format!(
            "プロセス停止: {}件, {:.0}MB解放{}",
            result.process_killed,
            result.process_freed_mb,
            if result.errors.is_empty() {
                ""
            } else {
                " (一部エラー)"
            }
        ),
        if result.errors.is_empty() {
            "success"
        } else {
            "warning"
        },
    );

    Ok(result)
}

/// Dry-run: analyze what `apply_all_optimizations` would change without applying.
/// Saves a `SessionMode::Sim` session for history display.
#[tauri::command]
pub async fn simulate_all_optimizations() -> Result<SimulationResult, String> {
    // Begin a Sim session — captures snapshot, nothing is changed
    let session = tokio::task::spawn_blocking(|| rollback::begin_session(SessionMode::Sim, None))
        .await
        .map_err(|e| e.to_string())?;

    let snapshot = session.snapshot.clone();
    let session_id = session.id.clone();

    // Analyze what would change (read-only, in blocking context)
    let changes = tokio::task::spawn_blocking(move || analyze_what_would_change(&snapshot))
        .await
        .map_err(|e| e.to_string())?;

    let safe_count = changes
        .iter()
        .filter(|c| c.risk_level == RiskLevel::Safe && c.will_apply)
        .count();
    let caution_count = changes
        .iter()
        .filter(|c| c.risk_level == RiskLevel::Caution && c.will_apply)
        .count();
    let advanced_count = changes
        .iter()
        .filter(|c| c.risk_level == RiskLevel::Advanced && c.will_apply)
        .count();

    // Persist sim session with preview changes (applied=false)
    if let Ok(mut s) = rollback::load_session(&session_id) {
        let change_records: Vec<ChangeRecord> = changes
            .iter()
            .map(|c| ChangeRecord {
                category: c.category.clone(),
                target: c.target.clone(),
                before: c.current_value.clone(),
                after: c.new_value.clone(),
                risk_level: c.risk_level.clone(),
                applied: false,
            })
            .collect();
        let summary = serde_json::json!({
            "mode": "sim",
            "safe": safe_count,
            "caution": caution_count,
            "advanced": advanced_count
        });
        rollback::complete_session(&mut s, change_records, summary, true);
        rollback::save_session(&s).ok();
    }

    Ok(SimulationResult {
        changes,
        safe_count,
        caution_count,
        advanced_count,
        session_id,
    })
}

// ── Optimization score ────────────────────────────────────────────────────────

/// Per-category optimization scores (0–100 each) plus an overall weighted score.
#[derive(Debug, Serialize)]
pub struct OptimizationScore {
    /// Weighted overall score: process×30 + power×20 + windows×25 + network×25
    pub overall: u8,
    /// 100 minus the fraction of known bloatware currently running
    pub process: u8,
    /// 100 if a high-performance power plan is active, else 0
    pub power: u8,
    /// Sub-score based on game_dvr, visual_fx, transparency, menu delay
    pub windows: u8,
    /// Sub-score based on throttling, Nagle, system responsiveness
    pub network: u8,
    /// Number of bloatware processes currently running
    pub bloatware_running: usize,
}

pub(crate) fn compute_optimization_score() -> OptimizationScore {
    // ── Process ────────────────────────────────────────────────────────────────
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let running_names: std::collections::HashSet<String> = sys
        .processes()
        .values()
        .filter_map(|p| {
            p.exe().and_then(|e| {
                std::path::Path::new(e)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase())
            })
        })
        .collect();

    let bloatware_list = super::process::BLOATWARE_PROCESSES;
    let total = bloatware_list.len();
    let bloatware_running = bloatware_list
        .iter()
        .filter(|b| running_names.contains(&b.to_lowercase()))
        .count();
    let process_score = if total == 0 {
        100u8
    } else {
        100u8.saturating_sub((bloatware_running * 100 / total) as u8)
    };

    // ── Power ──────────────────────────────────────────────────────────────────
    let power_score = match super::power::get_current_power_guid() {
        Some(g) => {
            let g = g.to_lowercase();
            // Ultimate Performance (e9a42b02) or High Performance (8c5e7fda)
            if g.contains("e9a42b02") || g.contains("8c5e7fda") {
                100
            } else {
                0
            }
        }
        None => 0,
    };

    // ── Windows ────────────────────────────────────────────────────────────────
    let windows_score = match super::windows_settings::get_windows_settings() {
        Ok(ws) => {
            let mut s = 0u8;
            if !ws.game_dvr {
                s += 40;
            }
            if ws.visual_fx == 2 {
                s += 35;
            }
            if !ws.transparency {
                s += 15;
            }
            if ws.menu_show_delay == 0 {
                s += 10;
            }
            s
        }
        Err(_) => 0,
    };

    // ── Network ────────────────────────────────────────────────────────────────
    let ns = super::network::get_network_settings();
    let mut network_score = 0u8;
    if ns.throttling_disabled {
        network_score += 40;
    }
    if ns.nagle_disabled {
        network_score += 40;
    }
    if ns.system_responsiveness == 0 {
        network_score += 20;
    }

    // ── Overall (weighted) ────────────────────────────────────────────────────
    let overall = ((process_score as u32 * 30
        + power_score as u32 * 20
        + windows_score as u32 * 25
        + network_score as u32 * 25)
        / 100) as u8;

    OptimizationScore {
        overall,
        process: process_score,
        power: power_score,
        windows: windows_score,
        network: network_score,
        bloatware_running,
    }
}

#[tauri::command]
pub async fn get_optimization_score() -> OptimizationScore {
    tokio::task::spawn_blocking(compute_optimization_score)
        .await
        .unwrap_or(OptimizationScore {
            overall: 0,
            process: 0,
            power: 0,
            windows: 0,
            network: 0,
            bloatware_running: 0,
        })
}

// ── Score history ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScoreSnapshot {
    /// Unix epoch seconds
    pub timestamp: u64,
    pub overall: u8,
    pub process: u8,
    pub power: u8,
    pub windows: u8,
    pub network: u8,
}

fn score_history_path() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("score_history.json")
}

fn load_score_history_internal() -> Vec<ScoreSnapshot> {
    let path = score_history_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub(crate) fn save_score_snapshot_internal(score: &OptimizationScore) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let path = score_history_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let mut history = load_score_history_internal();
    history.push(ScoreSnapshot {
        timestamp,
        overall: score.overall,
        process: score.process,
        power: score.power,
        windows: score.windows,
        network: score.network,
    });
    // Rolling window: keep last 100 entries
    if history.len() > 100 {
        history.drain(0..history.len() - 100);
    }
    if let Ok(json) = serde_json::to_string_pretty(&history) {
        std::fs::write(&path, json).ok();
    }
}

#[tauri::command]
pub fn get_score_history() -> Vec<ScoreSnapshot> {
    load_score_history_internal()
}
