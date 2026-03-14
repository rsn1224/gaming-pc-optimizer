use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct HotkeyConfig {
    pub toggle_game_mode: String,
    pub open_app: String,
    pub quick_clean: String,
    pub toggle_overlay: String,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            toggle_game_mode: "Ctrl+Shift+G".to_string(),
            open_app: "Ctrl+Shift+O".to_string(),
            quick_clean: "Ctrl+Shift+C".to_string(),
            toggle_overlay: "Ctrl+Shift+F".to_string(),
        }
    }
}

fn hotkey_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("hotkeys.json")
}

#[tauri::command]
pub fn get_hotkey_config() -> HotkeyConfig {
    let path = hotkey_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(config) = serde_json::from_str::<HotkeyConfig>(&content) {
            return config;
        }
    }
    HotkeyConfig::default()
}

#[tauri::command]
pub fn save_hotkey_config(config: HotkeyConfig) -> Result<(), String> {
    let path = hotkey_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Apply hotkeys: saves the config. Global shortcut plugin is not available,
/// so this just persists the config and returns a note.
#[tauri::command]
pub async fn apply_hotkeys(_app: tauri::AppHandle, config: HotkeyConfig) -> Result<(), String> {
    save_hotkey_config(config)?;
    Ok(())
}
