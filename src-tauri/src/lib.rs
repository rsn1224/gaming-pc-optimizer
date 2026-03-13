mod commands;

use commands::{
    ai, hardware, network, power, process, profiles, steam, storage, system_info, updates, watcher,
    windows_settings,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

// ── Shared app state ─────────────────────────────────────────────────────────

pub struct WatcherState {
    pub auto_optimize: bool,
    pub active_profile_id: Option<String>,
    pub is_applying: bool,
}

pub struct AppState(pub std::sync::Mutex<WatcherState>);

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState(std::sync::Mutex::new(WatcherState {
            auto_optimize: false,
            active_profile_id: None,
            is_applying: false,
        })))
        .setup(|app| {
            // ── System tray ────────────────────────────────────────────────
            let show =
                MenuItem::with_id(app, "show", "ダッシュボードを開く", true, None::<&str>)?;
            let auto_check = CheckMenuItem::with_id(
                app,
                "toggle_auto",
                "自動最適化",
                true,
                false,
                None::<&str>,
            )?;
            let restore_item =
                MenuItem::with_id(app, "restore_all", "すべて元に戻す", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;

            let menu =
                Menu::with_items(app, &[&show, &auto_check, &restore_item, &sep, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Gaming PC Optimizer")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            w.show().ok();
                            w.set_focus().ok();
                        }
                    }
                    "toggle_auto" => {
                        // CheckMenuItem auto-toggles its checked state on click;
                        // mirror the new value into AppState and notify the frontend.
                        let state = app.state::<AppState>();
                        let enabled = {
                            let mut w = state.0.lock().unwrap();
                            w.auto_optimize = !w.auto_optimize;
                            w.auto_optimize
                        };
                        app.emit("auto_optimize_changed", enabled).ok();
                    }
                    "restore_all" => {
                        match watcher::restore_all_internal() {
                            Ok(log) => println!("[tray restore] {}", log),
                            Err(e) => eprintln!("[tray restore] error: {}", e),
                        }
                        let state = app.state::<AppState>();
                        state.0.lock().unwrap().active_profile_id = None;
                        app.emit("active_profile_changed", Option::<String>::None)
                            .ok();
                    }
                    "quit" => std::process::exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                window.hide().ok();
                            } else {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        }
                    }
                })
                .build(app)?;

            // ── Close-to-tray ──────────────────────────────────────────────
            let handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = handle.get_webview_window("main") {
                            w.hide().ok();
                        }
                    }
                });
            }

            // ── Background watcher task ────────────────────────────────────
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                watcher::watcher_loop(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Process
            process::get_running_processes,
            process::kill_bloatware,
            // Power
            power::get_current_power_plan,
            power::set_ultimate_performance,
            power::restore_power_plan,
            // System info
            system_info::get_system_info,
            system_info::get_gpu_info,
            // Windows settings
            windows_settings::get_windows_settings,
            windows_settings::set_visual_fx,
            windows_settings::set_transparency,
            windows_settings::set_game_dvr,
            windows_settings::set_menu_show_delay,
            windows_settings::set_animate_windows,
            windows_settings::apply_gaming_windows_settings,
            windows_settings::restore_windows_settings,
            windows_settings::has_windows_settings_backup,
            // Storage
            storage::scan_storage,
            storage::clean_storage,
            // Network
            network::get_network_settings,
            network::apply_network_gaming,
            network::restore_network_settings,
            network::get_network_adapters,
            network::set_adapter_dns,
            network::ping_host,
            // Profiles
            profiles::list_profiles,
            profiles::save_profile,
            profiles::delete_profile,
            profiles::apply_profile,
            profiles::export_profiles_context,
            profiles::launch_game,
            // Steam
            steam::discover_steam_games,
            steam::discover_and_create_steam_drafts,
            // AI
            ai::get_ai_api_key,
            ai::set_ai_api_key,
            ai::generate_ai_recommendations,
            ai::get_ai_update_priorities,
            ai::get_ai_hardware_mode,
            // Updates
            updates::check_app_updates,
            updates::upgrade_apps,
            updates::check_driver_info,
            // Hardware
            hardware::get_gpu_status,
            hardware::set_gpu_power_limit,
            // Watcher / tray commands
            watcher::get_auto_start,
            watcher::set_auto_start,
            watcher::get_auto_optimize,
            watcher::set_auto_optimize,
            watcher::get_active_profile,
            watcher::restore_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
