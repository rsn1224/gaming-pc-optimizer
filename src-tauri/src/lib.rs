mod commands;

use commands::{network, power, process, storage, system_info, windows_settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            process::get_running_processes,
            process::kill_bloatware,
            power::get_current_power_plan,
            power::set_ultimate_performance,
            power::restore_power_plan,
            system_info::get_system_info,
            system_info::get_gpu_info,
            windows_settings::get_windows_settings,
            windows_settings::set_visual_fx,
            windows_settings::set_transparency,
            windows_settings::set_game_dvr,
            windows_settings::set_menu_show_delay,
            windows_settings::set_animate_windows,
            windows_settings::apply_gaming_windows_settings,
            windows_settings::restore_windows_settings,
            windows_settings::has_windows_settings_backup,
            storage::scan_storage,
            storage::clean_storage,
            network::get_network_settings,
            network::apply_network_gaming,
            network::restore_network_settings,
            network::get_network_adapters,
            network::set_adapter_dns,
            network::ping_host,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
