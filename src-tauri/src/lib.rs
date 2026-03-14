mod commands;
mod error;
pub use error::AppError;

use commands::{
    ai, app_settings, audit_log, backup, bandwidth, benchmark, clipboard_opt, cpu_affinity,
    crash_report, disk_health, event_log, fps, game_integrity, game_log, hardware,
    hardware_suggestions, hotkeys, icons, memory_cleaner, metrics, network, optimizer,
    optimizer_graph, osd, policy, power, presets, process, profile_share, profiles, registry_opt,
    report, rollback, safety_kernel, scheduler, self_improve, startup, steam, storage, system_info,
    telemetry, uninstaller, update_check, updates, watcher, windows_settings,
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
    pub current_game_session_id: Option<String>,
    // S6-01: score regression watch
    pub score_history: Vec<u8>,          // rolling window (max 6)
    pub regression_notified_secs: u64,   // epoch secs of last regression notification
    // S6-02: thermal auto-reduction
    pub thermal_reduced: bool,
    pub thermal_original_limit_w: Option<u32>,
    // S10-03: session ended coaching trigger
    pub last_game_name: Option<String>,
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
            current_game_session_id: None,
            score_history: Vec::new(),
            regression_notified_secs: 0,
            thermal_reduced: false,
            thermal_original_limit_w: None,
            last_game_name: None,
        })))
        .setup(|app| {
            // ── System tray ────────────────────────────────────────────────
            let show = MenuItem::with_id(app, "show", "ダッシュボードを開く", true, None::<&str>)?;
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

            let menu = Menu::with_items(app, &[&show, &auto_check, &restore_item, &sep, &quit])?;

            let tray_icon = app
                .default_window_icon()
                .ok_or("トレイアイコンが見つかりません")?
                .clone();

            TrayIconBuilder::with_id("main")
                .icon(tray_icon)
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
                            let mut w = state.0.lock().unwrap_or_else(|p| p.into_inner());
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
                        state
                            .0
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .active_profile_id = None;
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
            process::get_all_processes,
            process::kill_process,
            process::kill_bloatware,
            icons::get_exe_icon_base64,
            // Power
            power::get_current_power_plan,
            power::set_ultimate_performance,
            power::restore_power_plan,
            power::list_power_plans,
            power::set_power_plan_by_guid,
            power::get_power_plan,
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
            windows_settings::apply_windows_preset,
            windows_settings::export_windows_settings_context,
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
            network::auto_test_dns,
            network::export_network_advisor_context,
            // Profiles
            profiles::list_profiles,
            profiles::save_profile,
            profiles::delete_profile,
            profiles::apply_profile,
            profiles::simulate_profile,
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
            ai::get_ai_network_recommendation,
            ai::get_ai_windows_recommendation,
            ai::get_ai_storage_recommendation,
            ai::get_game_settings_advice,
            // S9-01: AI Profile Generator
            ai::generate_ai_profile,
            // S10-01: Performance Coach
            ai::generate_performance_coaching,
            // Self-improvement
            self_improve::export_self_improve_context,
            // Optimizer
            optimizer::apply_all_optimizations,
            optimizer::simulate_all_optimizations,
            optimizer::get_optimization_score,
            optimizer::get_score_history,
            // Safety Kernel (Sprint 1/2 / ENABLE_SAFETY_KERNEL=true)
            safety_kernel::safe_apply_optimizations,
            safety_kernel::run_safety_prechecks,
            // Audit Log (Sprint 1 / ENABLE_AUDIT_LOG=false → Sprint 2 flip pending)
            audit_log::get_audit_log,
            audit_log::clear_audit_log,
            // Telemetry (Sprint 1/2 / ENABLE_TELEMETRY=false)
            telemetry::get_telemetry_for_session,
            // Optimization Graph (Sprint 2)
            optimizer_graph::get_optimization_graph,
            optimizer_graph::get_apply_plan,
            // Policy Engine (Sprint 2 / ENABLE_POLICY_ENGINE=false)
            policy::list_policies,
            policy::save_policy,
            policy::delete_policy,
            policy::toggle_policy,
            policy::fire_policy_manual,
            // Benchmark
            benchmark::run_benchmark,
            // Event Log
            event_log::get_event_log,
            event_log::clear_event_log,
            // Metrics (Phase 2)
            metrics::get_current_metrics,
            // Updates
            updates::check_app_updates,
            updates::upgrade_apps,
            updates::check_driver_info,
            updates::export_updates_context,
            // Startup
            startup::get_startup_entries,
            startup::disable_startup_entry,
            startup::enable_startup_entry,
            // Hardware
            hardware::get_gpu_status,
            // Hardware Suggestions (S8-03)
            hardware_suggestions::get_hardware_diagnostics,
            hardware::set_gpu_power_limit,
            hardware::get_gpu_power_info,
            hardware::reset_gpu_power_limit,
            hardware::set_gpu_fan_speed,
            hardware::get_motherboard_info,
            hardware::get_cpu_detailed_info,
            hardware::get_temperature_snapshot,
            // Memory Cleaner
            memory_cleaner::get_memory_info,
            memory_cleaner::clean_memory,
            // Hotkeys
            hotkeys::get_hotkey_config,
            hotkeys::save_hotkey_config,
            hotkeys::apply_hotkeys,
            // Watcher / tray commands
            watcher::get_auto_start,
            watcher::set_auto_start,
            watcher::get_auto_optimize,
            watcher::set_auto_optimize,
            watcher::get_active_profile,
            watcher::restore_all,
            // Rollback Center (Phase 1)
            rollback::list_sessions,
            rollback::get_latest_session,
            rollback::restore_session,
            rollback::delete_session,
            rollback::rollback_enabled,
            rollback::get_session_stats,
            // Presets (Phase 3-2)
            presets::list_presets,
            presets::apply_preset,
            // Backup
            backup::export_backup,
            backup::import_backup,
            // FPS Monitor
            fps::get_fps_estimate,
            // Disk Health
            disk_health::get_disk_health,
            // Scheduler
            scheduler::create_schedule,
            scheduler::delete_schedule,
            scheduler::get_schedule,
            // Clipboard Optimizer
            clipboard_opt::get_clipboard_status,
            clipboard_opt::clear_clipboard,
            clipboard_opt::clean_clipboard_temps,
            // Game Performance Log
            game_log::get_game_log,
            game_log::get_game_stats,
            game_log::clear_game_log,
            game_log::delete_game_session,
            // App Settings / Appearance
            app_settings::get_appearance,
            app_settings::save_appearance,
            // Crash Report
            crash_report::get_error_log,
            crash_report::clear_error_log,
            crash_report::export_crash_report,
            // Bandwidth Monitor
            bandwidth::get_bandwidth_snapshot,
            // Registry Optimizer
            registry_opt::get_registry_tweaks,
            registry_opt::apply_registry_tweak,
            registry_opt::revert_registry_tweak,
            registry_opt::apply_all_safe_tweaks,
            // CPU Affinity
            cpu_affinity::get_process_affinities,
            cpu_affinity::set_process_affinity,
            cpu_affinity::reset_process_affinity,
            // Game Integrity
            game_integrity::get_steam_games_for_verify,
            game_integrity::verify_game_files,
            // Uninstaller
            uninstaller::get_installed_apps,
            uninstaller::uninstall_app,
            // OSD Window
            osd::show_osd_window,
            osd::hide_osd_window,
            osd::is_osd_visible,
            // Profile Share
            profile_share::export_profile_share,
            profile_share::import_profile_share,
            profile_share::export_all_profiles_share,
            // Update Check
            update_check::check_for_updates,
            update_check::open_release_url,
            // Performance Report
            report::generate_performance_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
