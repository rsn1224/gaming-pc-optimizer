use sysinfo::{ProcessesToUpdate, System};
use tauri::{Emitter, Manager};
use winreg::enums::*;
use winreg::RegKey;

use crate::AppState;

// ── Feature flags ─────────────────────────────────────────────────────────────

/// S6-01: スコア急落を検出してユーザーに通知する
pub const ENABLE_SCORE_REGRESSION_WATCH: bool = true;
/// S6-02: GPU 温度が高すぎる場合に自動で電力制限を下げる
pub const ENABLE_THERMAL_AUTO_REDUCTION: bool = true;
/// S8-01: ゲーム起動時にフル監視チェーン（T0テレメトリ + game_launched イベント）を実行する
pub const ENABLE_LAUNCH_MONITORING: bool = true;

// ── Regression / Thermal constants ────────────────────────────────────────────

/// 何 pt 以上の急落を「リグレッション」とみなすか
const REGRESSION_THRESHOLD: i16 = 15;
/// リグレッション通知のクールダウン（秒） — 5 分
const REGRESSION_COOLDOWN_SECS: u64 = 300;
/// スコア履歴のローリングウィンドウサイズ
const SCORE_HISTORY_MAX: usize = 6;

/// この温度を超えたら電力制限を下げる (°C)
const THERMAL_HIGH_C: u32 = 88;
/// この温度を下回ったら電力制限を元に戻す (°C)
const THERMAL_RECOVERY_C: u32 = 78;
/// 電力制限の削減率 (%)
const THERMAL_REDUCTION_PCT: u32 = 15;

// ── Autostart (winreg) ────────────────────────────────────────────────────────

const AUTOSTART_NAME: &str = "GamingPCOptimizer";

#[tauri::command]
pub fn get_auto_start() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .and_then(|k| k.get_value::<String, _>(AUTOSTART_NAME))
        .is_ok()
}

#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_SET_VALUE,
        )
        .map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(AUTOSTART_NAME, &exe.to_string_lossy().to_string())
            .map_err(|e| e.to_string())?;
    } else {
        key.delete_value(AUTOSTART_NAME).ok();
    }
    Ok(())
}

// ── Auto-optimize state ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_auto_optimize(state: tauri::State<AppState>) -> bool {
    state
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .auto_optimize
}

#[tauri::command]
pub fn set_auto_optimize(enabled: bool, state: tauri::State<AppState>) {
    state
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .auto_optimize = enabled;
}

#[tauri::command]
pub fn get_active_profile(state: tauri::State<AppState>) -> Option<String> {
    state
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .active_profile_id
        .clone()
}

// ── restore_all ───────────────────────────────────────────────────────────────

/// Restore all backed-up settings. Safe to call from sync or async contexts.
pub fn restore_all_internal() -> Result<String, String> {
    let mut log: Vec<String> = Vec::new();

    // Windows settings (only when a backup file exists)
    if super::windows_settings::has_windows_settings_backup() {
        match super::windows_settings::restore_windows_settings() {
            Ok(_) => log.push("[Windows] 設定を復元しました".to_string()),
            Err(e) => log.push(format!("[Windows] 復元エラー: {}", e)),
        }
    }

    // Network settings (always safe to restore to defaults)
    match super::network::restore_network_settings() {
        Ok(_) => log.push("[ネットワーク] 設定を復元しました".to_string()),
        Err(e) => log.push(format!("[ネットワーク] 復元エラー: {}", e)),
    }

    // Power plan (only when a backup exists)
    if let Some(guid) = super::power::read_power_backup() {
        match super::power::restore_power_plan_internal(&guid) {
            Ok(_) => {
                super::power::clear_power_backup();
                log.push("[電源] 電源プランを復元しました".to_string());
            }
            Err(e) => log.push(format!("[電源] 復元エラー: {}", e)),
        }
    }

    Ok(log.join("\n"))
}

#[tauri::command]
pub fn restore_all(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<String, String> {
    let result = restore_all_internal()?;
    state
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .active_profile_id = None;
    app.emit("active_profile_changed", Option::<String>::None)
        .ok();
    Ok(result)
}

// ── Watcher loop ──────────────────────────────────────────────────────────────

fn exe_matches(profile_exe: &str, running: &std::collections::HashSet<String>) -> bool {
    let lower = profile_exe.to_lowercase();
    if running.contains(&lower) {
        return true;
    }
    // Filename-only match (e.g. "r5apex.exe" matches any full path ending in it)
    let profile_name = std::path::Path::new(&lower)
        .file_name()
        .map(|n| n.to_string_lossy().to_string());
    if let Some(pname) = profile_name {
        return running.iter().any(|r| {
            std::path::Path::new(r)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .as_deref()
                == Some(pname.as_str())
        });
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn running(paths: &[&str]) -> std::collections::HashSet<String> {
        paths.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn exe_matches_exact_lowercase_path() {
        let r = running(&["c:\\games\\r5apex.exe"]);
        assert!(exe_matches("c:\\games\\r5apex.exe", &r));
    }

    #[test]
    fn exe_matches_is_case_insensitive() {
        let r = running(&["c:\\games\\r5apex.exe"]);
        assert!(exe_matches("C:\\Games\\R5Apex.exe", &r));
    }

    #[test]
    fn exe_matches_by_filename_only() {
        let r = running(&["c:\\games\\apex legends\\r5apex.exe"]);
        // Profile stores just the filename
        assert!(exe_matches("r5apex.exe", &r));
    }

    #[test]
    fn exe_matches_returns_false_for_no_match() {
        let r = running(&["c:\\games\\other.exe"]);
        assert!(!exe_matches("r5apex.exe", &r));
    }

    #[test]
    fn exe_matches_returns_false_for_empty_running_set() {
        let r = running(&[]);
        assert!(!exe_matches("r5apex.exe", &r));
    }
}

/// ポリシーアクションを実際に実行する非同期ディスパッチャ。
/// watcher_loop から呼ばれ、各アクション種別を対応するコマンドに転送する。
async fn dispatch_policy_action(policy: &super::policy::Policy, handle: &tauri::AppHandle) {
    use super::policy::PolicyAction;

    let result: Result<String, String> = match &policy.action {
        PolicyAction::KillBloatware => {
            super::process::kill_bloatware(None)
                .await
                .map(|r| format!("killed:{},freed:{:.0}MB", r.killed.len(), r.freed_memory_mb))
        }
        PolicyAction::ApplyAll => {
            super::optimizer::apply_all_optimizations()
                .await
                .map(|r| format!("apply_all: processes={}, errors={}", r.process_killed, r.errors.len()))
        }
        PolicyAction::ApplyPreset { preset_id } => {
            super::presets::apply_preset(preset_id.clone())
                .await
                .map(|r| format!("preset:{} processes={}", preset_id, r.process_killed))
        }
        PolicyAction::SetPowerPlan { plan } => {
            if plan == "ultimate" || plan == "ultimate_performance" {
                super::power::set_ultimate_performance()
                    .await
                    .map(|_| "power:ultimate".to_string())
            } else {
                Err(format!("不明な電源プラン: {}", plan))
            }
        }
        PolicyAction::ApplyGraphNodes { node_ids } => {
            // Graph ノードを順番に適用 (Sprint 4: kill_bloatware / ultimate_power のみ実装)
            let mut applied = Vec::new();
            for id in node_ids {
                let ok = match id.as_str() {
                    "kill_bloatware" => super::process::kill_bloatware(None).await.is_ok(),
                    "ultimate_power" => super::power::set_ultimate_performance().await.is_ok(),
                    "gaming_windows" => {
                        tokio::task::spawn_blocking(super::windows_settings::apply_gaming_windows_settings)
                            .await
                            .map(|r| r.is_ok())
                            .unwrap_or(false)
                    }
                    "network_gaming" => {
                        tokio::task::spawn_blocking(super::network::apply_network_gaming)
                            .await
                            .map(|r| r.is_ok())
                            .unwrap_or(false)
                    }
                    _ => false,
                };
                if ok { applied.push(id.as_str()); }
            }
            Ok(format!("graph_nodes: {:?}", applied))
        }
    };

    match &result {
        Ok(detail) => {
            super::event_log::add_event_internal(
                "policy_fired",
                &format!("ポリシー「{}」を自動実行しました", policy.name),
                detail,
                "success",
            );
            send_notification(handle, &format!("ポリシー「{}」を実行しました", policy.name));
        }
        Err(e) => {
            super::event_log::add_event_internal(
                "policy_error",
                &format!("ポリシー「{}」の実行に失敗しました", policy.name),
                e,
                "warning",
            );
        }
    }
}

fn send_notification(handle: &tauri::AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    handle
        .notification()
        .builder()
        .title("Gaming PC Optimizer")
        .body(body)
        .show()
        .ok();
}

// ── S6-01: Score regression watch ────────────────────────────────────────────

/// スコアを履歴に追記し、急落していれば通知する。
/// watcher_loop の末尾（毎サイクル）から呼ばれる。
fn check_score_regression(
    current_score: u8,
    state: &crate::AppState,
    handle: &tauri::AppHandle,
) {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let (should_notify, baseline) = {
        let mut w = state.0.lock().unwrap_or_else(|p| p.into_inner());

        // Push new score
        w.score_history.push(current_score);
        if w.score_history.len() > SCORE_HISTORY_MAX {
            w.score_history.remove(0);
        }

        // Need at least 3 readings before evaluating
        if w.score_history.len() < 3 {
            return;
        }

        // Baseline = average of all readings except the latest
        let older = &w.score_history[..w.score_history.len() - 1];
        let baseline: i16 = (older.iter().map(|&v| v as u32).sum::<u32>() / older.len() as u32) as i16;
        let delta = current_score as i16 - baseline;

        let cooldown_ok = now_secs.saturating_sub(w.regression_notified_secs) > REGRESSION_COOLDOWN_SECS;

        if delta <= -REGRESSION_THRESHOLD && cooldown_ok {
            w.regression_notified_secs = now_secs;
            (true, baseline)
        } else {
            (false, baseline)
        }
    };

    if should_notify {
        let detail = format!(
            "スコアが {} → {} に急落しました ({:+} pts)",
            baseline,
            current_score,
            current_score as i16 - baseline
        );
        super::event_log::add_event_internal(
            "score_regression",
            "最適化スコアが急落しました",
            &detail,
            "warning",
        );
        send_notification(handle, &format!("⚠ スコア急落: {} pts → 最適化を推奨します", current_score));
        handle.emit("score_regression", current_score).ok();
    }
}

// ── S6-02: Thermal auto-reduction ────────────────────────────────────────────

/// GPU 温度を取得し、閾値超えで電力制限を自動削減、回復時に復元する。
/// watcher_loop の末尾（毎サイクル）から呼ばれる。
async fn check_thermal_auto_reduction(state: &crate::AppState, handle: &tauri::AppHandle) {
    // GPU ステータスを取得
    let gpu_list = match tokio::task::spawn_blocking(super::hardware::fetch_gpu_status_sync).await {
        Ok(Ok(list)) => list,
        _ => return,
    };
    let gpu = match gpu_list.into_iter().next() {
        Some(g) => g,
        None => return,
    };
    let temp = gpu.temperature_c as u32;

    let (currently_reduced, original_limit) = {
        let w = state.0.lock().unwrap_or_else(|p| p.into_inner());
        (w.thermal_reduced, w.thermal_original_limit_w)
    };

    if !currently_reduced && temp >= THERMAL_HIGH_C {
        // 現在の電力情報を取得
        let power_info = match tokio::task::spawn_blocking(super::hardware::get_gpu_power_info).await {
            Ok(Ok(info)) => info,
            _ => return,
        };
        let reduced_w = (power_info.current_w * (100 - THERMAL_REDUCTION_PCT)) / 100;
        let reduced_w = reduced_w.max(power_info.min_w);

        let set_result = super::hardware::set_gpu_power_limit(0, reduced_w).await;

        if set_result.is_ok() {
            {
                let mut w = state.0.lock().unwrap_or_else(|p| p.into_inner());
                w.thermal_reduced = true;
                w.thermal_original_limit_w = Some(power_info.current_w);
            }
            super::event_log::add_event_internal(
                "thermal_throttle",
                "GPU 温度超過 — 電力制限を自動削減しました",
                &format!("{}°C 検知 → {} W → {} W (-{}%)", temp, power_info.current_w, reduced_w, THERMAL_REDUCTION_PCT),
                "warning",
            );
            send_notification(handle, &format!("🌡 GPU {}°C — 電力制限を {}W に削減しました", temp, reduced_w));
            handle.emit("thermal_throttle_changed", true).ok();
        }
    } else if currently_reduced && temp <= THERMAL_RECOVERY_C {
        // 元の電力制限に戻す
        let restore_w = original_limit.unwrap_or(0);
        if restore_w > 0 {
            let _ = super::hardware::set_gpu_power_limit(0, restore_w).await;
        } else {
            let _ = super::hardware::reset_gpu_power_limit().await;
        }
        {
            let mut w = state.0.lock().unwrap_or_else(|p| p.into_inner());
            w.thermal_reduced = false;
            w.thermal_original_limit_w = None;
        }
        super::event_log::add_event_internal(
            "thermal_restored",
            "GPU 温度回復 — 電力制限を復元しました",
            &format!("{}°C まで低下", temp),
            "info",
        );
        handle.emit("thermal_throttle_changed", false).ok();
    }
}

pub async fn watcher_loop(handle: tauri::AppHandle) {
    let mut sys = System::new();
    loop {
        // Read shared state first to determine the sleep duration
        let state = handle.state::<AppState>();
        let (auto_on, active_id, is_applying) = {
            let w = state.0.lock().unwrap_or_else(|p| p.into_inner());
            (w.auto_optimize, w.active_profile_id.clone(), w.is_applying)
        };

        // Dynamic interval based on current watcher state:
        //   auto off   → 30 s  (no work to do, save resources)
        //   applying   →  1 s  (wait for profile apply to finish)
        //   game on    →  2 s  (detect game exit quickly)
        //   searching  →  4 s  (normal polling rate)
        let secs = if !auto_on {
            30
        } else if is_applying {
            1
        } else if active_id.is_some() {
            2
        } else {
            4
        };
        tokio::time::sleep(std::time::Duration::from_secs(secs)).await;

        if !auto_on || is_applying {
            continue;
        }

        // Load profiles from disk
        let profiles = super::profiles::load_profiles();

        // Refresh process list
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let running: std::collections::HashSet<String> = sys
            .processes()
            .values()
            .filter_map(|p| p.exe().map(|e| e.to_string_lossy().to_lowercase()))
            .collect();

        if let Some(ref active_id) = active_id {
            // ── Active profile: check if the game is still running ──────────
            let still_running = profiles
                .iter()
                .find(|p| &p.id == active_id)
                .map(|p| !p.exe_path.is_empty() && exe_matches(&p.exe_path, &running))
                .unwrap_or(false);

            if !still_running {
                // Grab the current session id before restoring
                let session_id_opt = state
                    .0
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .current_game_session_id
                    .clone();

                match restore_all_internal() {
                    Ok(_) => {
                        super::event_log::add_event_internal(
                            "restore",
                            "元の設定に復元しました",
                            "ゲーム終了を検知して自動復元",
                            "info",
                        );
                        // Record game end in performance log
                        if let Some(ref sid) = session_id_opt {
                            let sid_clone = sid.clone();
                            tokio::task::spawn_blocking(move || {
                                let score = super::optimizer::compute_optimization_score();
                                super::game_log::record_game_end(
                                    &sid_clone,
                                    score.overall as u32,
                                    0.0,
                                );
                            })
                            .await
                            .ok();
                        }
                    }
                    Err(e) => eprintln!("[watcher] restore error: {e}"),
                }
                {
                    let mut w = state.0.lock().unwrap_or_else(|p| p.into_inner());
                    w.active_profile_id = None;
                    w.current_game_session_id = None;
                }
                handle
                    .emit("active_profile_changed", Option::<String>::None)
                    .ok();
                send_notification(&handle, "元の状態に復元しました");
            }
        } else {
            // ── No active profile: look for a matching game ─────────────────
            for profile in &profiles {
                if profile.exe_path.is_empty() {
                    continue;
                }
                if exe_matches(&profile.exe_path, &running) {
                    // ── Policy Engine: OnGameStart (flag-guarded) ───────────
                    if super::policy::ENABLE_POLICY_ENGINE {
                        let ctx = super::policy::EvalContext {
                            current_score: 0,
                            game_just_started: true,
                        };
                        let triggered = super::policy::evaluate_policies(&ctx);
                        for p in triggered {
                            dispatch_policy_action(&p, &handle).await;
                            super::policy::mark_fired(p.id);
                        }
                    }

                    // Guard: set is_applying = true before the async call
                    state
                        .0
                        .lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .is_applying = true;

                    let result = super::profiles::apply_profile_internal(&profile.id).await;

                    {
                        let mut w = state.0.lock().unwrap_or_else(|p| p.into_inner());
                        w.is_applying = false;
                        if result.is_ok() {
                            w.active_profile_id = Some(profile.id.clone());
                        }
                    }

                    match result {
                        Ok(_) => {
                            handle
                                .emit("active_profile_changed", Some(profile.id.clone()))
                                .ok();
                            send_notification(
                                &handle,
                                &format!("{} 用プロファイルを適用しました", profile.name),
                            );
                            super::event_log::add_event_internal(
                                "profile_applied",
                                &format!("「{}」を自動適用しました", profile.name),
                                "ゲーム起動を検知してプロファイルを適用",
                                "success",
                            );
                            // S8-01: Save score snapshot, record game start, capture T0 telemetry
                            let profile_id = profile.id.clone();
                            let profile_name = profile.name.clone();
                            let launch_result = tokio::task::spawn_blocking(move || {
                                let score = super::optimizer::compute_optimization_score();
                                super::optimizer::save_score_snapshot_internal(&score);
                                let sid = super::game_log::record_game_start(
                                    &profile_id,
                                    &profile_name,
                                    score.overall as u32,
                                );
                                // T0 telemetry: baseline snapshot before optimization takes effect
                                if ENABLE_LAUNCH_MONITORING && super::telemetry::ENABLE_TELEMETRY {
                                    let mut sys2 = System::new();
                                    sys2.refresh_memory();
                                    let rec = super::telemetry::TelemetryRecord {
                                        id: None,
                                        session_id: sid.clone(),
                                        phase: super::telemetry::TelemetryPhase::Before,
                                        timestamp: super::now_iso8601(),
                                        score_overall: score.overall,
                                        score_process: score.process,
                                        score_power: score.power,
                                        score_windows: score.windows,
                                        score_network: score.network,
                                        memory_used_mb: (sys2.used_memory() / 1024 / 1024) as f64,
                                        memory_percent: if sys2.total_memory() > 0 {
                                            (sys2.used_memory() as f64 / sys2.total_memory() as f64) * 100.0
                                        } else {
                                            0.0
                                        },
                                        cpu_usage: 0.0,
                                        process_count: 0,
                                    };
                                    super::telemetry::insert_record(&rec).ok();
                                }
                                (sid, score.overall)
                            })
                            .await
                            .ok()
                            .unwrap_or_else(|| (String::new(), 0));

                            let (session_id_str, score_before) = launch_result;

                            if !session_id_str.is_empty() {
                                state
                                    .0
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .current_game_session_id = Some(session_id_str);
                            }

                            // S8-01: Emit detailed game_launched event for frontend banner
                            if ENABLE_LAUNCH_MONITORING {
                                handle.emit("game_launched", serde_json::json!({
                                    "game_name": profile.name,
                                    "profile_id": profile.id,
                                    "score_before": score_before,
                                })).ok();
                            }
                        }
                        Err(e) => eprintln!("[watcher] apply error: {e}"),
                    }
                    break; // only apply one profile per cycle
                }
            }

            // ── Policy Engine: OnScoreBelow (flag-guarded, no active game) ──
            if super::policy::ENABLE_POLICY_ENGINE {
                let score = tokio::task::spawn_blocking(|| {
                    super::optimizer::compute_optimization_score().overall
                })
                .await
                .unwrap_or(100);

                let ctx = super::policy::EvalContext {
                    current_score: score,
                    game_just_started: false,
                };
                let triggered = super::policy::evaluate_policies(&ctx);
                for p in triggered {
                    dispatch_policy_action(&p, &handle).await;
                    super::policy::mark_fired(p.id);
                }

                // S6-01: Score regression watch (runs after policy engine so score is fresh)
                if ENABLE_SCORE_REGRESSION_WATCH {
                    check_score_regression(score, &state, &handle);
                }
            } else if ENABLE_SCORE_REGRESSION_WATCH {
                // Policy engine off but regression watch still enabled
                let score = tokio::task::spawn_blocking(|| {
                    super::optimizer::compute_optimization_score().overall
                })
                .await
                .unwrap_or(100);
                check_score_regression(score, &state, &handle);
            }

            // S6-02: Thermal auto-reduction (independent of active game state)
            if ENABLE_THERMAL_AUTO_REDUCTION {
                check_thermal_auto_reduction(&state, &handle).await;
            }
        }
    }
}
