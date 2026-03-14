use serde::{Deserialize, Serialize};
use std::process::Command;
use winreg::{enums::*, RegKey};

#[derive(Serialize, Deserialize, Clone)]
pub struct InstalledApp {
    pub display_name: String,
    pub publisher: String,
    pub install_date: String,
    pub display_version: String,
    pub install_location: String,
    pub size_mb: f64,
    pub uninstall_string: String,
    pub quiet_uninstall: String,
    pub registry_key: String,
    pub is_system: bool,
}

fn read_apps_from_key(root: &RegKey, path: &str, apps: &mut Vec<InstalledApp>) {
    let key = match root.open_subkey(path) {
        Ok(k) => k,
        Err(_) => return,
    };

    for subkey_name in key.enum_keys().flatten() {
        let subkey = match key.open_subkey(&subkey_name) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let display_name: String = subkey.get_value("DisplayName").unwrap_or_default();
        let uninstall_string: String = subkey.get_value("UninstallString").unwrap_or_default();

        if display_name.is_empty() || uninstall_string.is_empty() {
            continue;
        }

        let publisher: String = subkey.get_value("Publisher").unwrap_or_default();
        let install_date: String = subkey.get_value("InstallDate").unwrap_or_default();
        let display_version: String = subkey.get_value("DisplayVersion").unwrap_or_default();
        let install_location: String = subkey.get_value("InstallLocation").unwrap_or_default();
        let quiet_uninstall: String = subkey.get_value("QuietUninstallString").unwrap_or_default();

        // EstimatedSize is in KB
        let estimated_size_kb: u32 = subkey.get_value("EstimatedSize").unwrap_or(0u32);
        let size_mb = estimated_size_kb as f64 / 1024.0;

        let is_system = publisher.to_lowercase().contains("microsoft");

        apps.push(InstalledApp {
            display_name,
            publisher,
            install_date,
            display_version,
            install_location,
            size_mb,
            uninstall_string,
            quiet_uninstall,
            registry_key: subkey_name,
            is_system,
        });
    }
}

#[tauri::command]
pub fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
    let uninstall_path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
    let uninstall_wow_path = "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

    let mut apps: Vec<InstalledApp> = Vec::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    read_apps_from_key(&hklm, uninstall_path, &mut apps);
    read_apps_from_key(&hklm, uninstall_wow_path, &mut apps);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    read_apps_from_key(&hkcu, uninstall_path, &mut apps);

    // Remove duplicates by display_name
    let mut seen = std::collections::HashSet::new();
    apps.retain(|a| seen.insert(a.display_name.clone()));

    // Sort by size_mb descending
    apps.sort_by(|a, b| {
        b.size_mb
            .partial_cmp(&a.size_mb)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(apps)
}

#[tauri::command]
pub async fn uninstall_app(uninstall_string: String) -> Result<(), String> {
    if uninstall_string.is_empty() {
        return Err("アンインストール文字列が空です".to_string());
    }

    Command::new("cmd")
        .args(["/c", &uninstall_string])
        .spawn()
        .map_err(|e| format!("アンインストーラーの起動に失敗しました: {}", e))?;

    Ok(())
}
