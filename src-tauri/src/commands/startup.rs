use serde::{Deserialize, Serialize};
use winreg::{enums::*, RegKey};

#[derive(Serialize, Deserialize, Clone)]
pub struct StartupEntry {
    pub name: String,
    pub command: String,
    pub source: String, // "HKCU_Run" | "HKLM_Run"
    pub enabled: bool,
}

const HKCU_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const HKCU_RUN_DISABLED: &str = r"Software\Microsoft\Windows\CurrentVersion\Run-Disabled";
const HKLM_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[tauri::command]
pub fn get_startup_entries() -> Result<Vec<StartupEntry>, String> {
    let mut entries: Vec<StartupEntry> = Vec::new();

    // HKCU enabled entries
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey(HKCU_RUN) {
            for value in run_key.enum_values().flatten() {
                let (name, data) = value;
                let command = data.to_string();
                entries.push(StartupEntry {
                    name,
                    command,
                    source: "HKCU_Run".to_string(),
                    enabled: true,
                });
            }
        }
    }

    // HKCU disabled entries (backed up)
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(disabled_key) = hkcu.open_subkey(HKCU_RUN_DISABLED) {
            for value in disabled_key.enum_values().flatten() {
                let (name, data) = value;
                let command = data.to_string();
                entries.push(StartupEntry {
                    name,
                    command,
                    source: "HKCU_Run".to_string(),
                    enabled: false,
                });
            }
        }
    }

    // HKLM enabled entries (read-only)
    {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(run_key) = hklm.open_subkey(HKLM_RUN) {
            for value in run_key.enum_values().flatten() {
                let (name, data) = value;
                let command = data.to_string();
                entries.push(StartupEntry {
                    name,
                    command,
                    source: "HKLM_Run".to_string(),
                    enabled: true,
                });
            }
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn disable_startup_entry(name: String, source: String) -> Result<(), String> {
    if source != "HKCU_Run" {
        return Err("HKLM エントリは管理者権限が必要なため無効化できません".to_string());
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Read value from Run key
    let run_key = hkcu
        .open_subkey_with_flags(HKCU_RUN, KEY_READ | KEY_WRITE)
        .map_err(|e| format!("Run キーを開けませんでした: {}", e))?;

    let command: String = run_key
        .get_value(&name)
        .map_err(|_| format!("エントリ '{}' が見つかりません", name))?;

    // Write to disabled key
    let (disabled_key, _) = hkcu
        .create_subkey(HKCU_RUN_DISABLED)
        .map_err(|e| format!("Run-Disabled キーを作成できませんでした: {}", e))?;

    disabled_key
        .set_value(&name, &command)
        .map_err(|e| format!("無効化キーへの書き込みに失敗しました: {}", e))?;

    // Delete from Run key
    run_key
        .delete_value(&name)
        .map_err(|e| format!("Run キーからの削除に失敗しました: {}", e))?;

    super::log_observation(
        "disable_startup_entry",
        serde_json::json!({ "name": name, "source": source }),
    );

    Ok(())
}

#[tauri::command]
pub fn enable_startup_entry(name: String, source: String) -> Result<(), String> {
    if source != "HKCU_Run" {
        return Err("HKLM エントリは管理者権限が必要なため操作できません".to_string());
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Read from disabled key
    let disabled_key = hkcu
        .open_subkey_with_flags(HKCU_RUN_DISABLED, KEY_READ | KEY_WRITE)
        .map_err(|e| format!("Run-Disabled キーを開けませんでした: {}", e))?;

    let command: String = disabled_key
        .get_value(&name)
        .map_err(|_| format!("無効化エントリ '{}' が見つかりません", name))?;

    // Write back to Run key
    let run_key = hkcu
        .open_subkey_with_flags(HKCU_RUN, KEY_READ | KEY_WRITE)
        .or_else(|_| {
            hkcu.create_subkey(HKCU_RUN)
                .map(|(k, _)| k)
        })
        .map_err(|e| format!("Run キーを開けませんでした: {}", e))?;

    run_key
        .set_value(&name, &command)
        .map_err(|e| format!("Run キーへの書き込みに失敗しました: {}", e))?;

    // Delete from disabled key
    disabled_key
        .delete_value(&name)
        .map_err(|e| format!("Run-Disabled キーからの削除に失敗しました: {}", e))?;

    super::log_observation(
        "enable_startup_entry",
        serde_json::json!({ "name": name, "source": source }),
    );

    Ok(())
}
