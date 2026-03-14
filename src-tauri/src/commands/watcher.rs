use sysinfo::{ProcessesToUpdate, System};
use tauri::{Emitter, Manager};
use winreg::enums::*;
use winreg::RegKey;

use crate::AppState;

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
                        let mut triggered = super::policy::evaluate_policies(&ctx);
                        for p in triggered.iter_mut() {
                            super::policy::execute_policy_action(p).ok();
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
                            // Save score snapshot and record game start
                            let profile_id = profile.id.clone();
                            let profile_name = profile.name.clone();
                            let session_id = tokio::task::spawn_blocking(move || {
                                let score = super::optimizer::compute_optimization_score();
                                super::optimizer::save_score_snapshot_internal(&score);
                                super::game_log::record_game_start(
                                    &profile_id,
                                    &profile_name,
                                    score.overall as u32,
                                )
                            })
                            .await
                            .ok();

                            if let Some(sid) = session_id {
                                state
                                    .0
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .current_game_session_id = Some(sid);
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
                let mut triggered = super::policy::evaluate_policies(&ctx);
                for p in triggered.iter_mut() {
                    super::policy::execute_policy_action(p).ok();
                }
            }
        }
    }
}
