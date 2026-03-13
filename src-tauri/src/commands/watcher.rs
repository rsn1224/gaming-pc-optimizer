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
    state.0.lock().unwrap().auto_optimize
}

#[tauri::command]
pub fn set_auto_optimize(enabled: bool, state: tauri::State<AppState>) {
    state.0.lock().unwrap().auto_optimize = enabled;
}

#[tauri::command]
pub fn get_active_profile(state: tauri::State<AppState>) -> Option<String> {
    state.0.lock().unwrap().active_profile_id.clone()
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
    state.0.lock().unwrap().active_profile_id = None;
    app.emit("active_profile_changed", Option::<String>::None).ok();
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
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;

        // Read shared state (short critical section)
        let state = handle.state::<AppState>();
        let (auto_on, active_id, is_applying) = {
            let w = state.0.lock().unwrap();
            (w.auto_optimize, w.active_profile_id.clone(), w.is_applying)
        };

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
                if let Err(e) = restore_all_internal() {
                    eprintln!("[watcher] restore error: {e}");
                }
                state.0.lock().unwrap().active_profile_id = None;
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
                    // Guard: set is_applying = true before the async call
                    state.0.lock().unwrap().is_applying = true;

                    let result = super::profiles::apply_profile_internal(&profile.id).await;

                    {
                        let mut w = state.0.lock().unwrap();
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
                                &format!(
                                    "{} 用プロファイルを適用しました",
                                    profile.name
                                ),
                            );
                        }
                        Err(e) => eprintln!("[watcher] apply error: {e}"),
                    }
                    break; // only apply one profile per cycle
                }
            }
        }
    }
}
