use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct AppearanceSettings {
    pub accent_color: String,  // "cyan" | "purple" | "orange" | "green" | "pink"
    pub font_size: String,     // "small" | "medium" | "large"
    pub sidebar_compact: bool, // compact sidebar (icon-only mode)
    pub animations_enabled: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            accent_color: "cyan".to_string(),
            font_size: "medium".to_string(),
            sidebar_compact: false,
            animations_enabled: true,
        }
    }
}

fn appearance_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("appearance.json")
}

#[tauri::command]
pub fn get_appearance() -> AppearanceSettings {
    let path = appearance_path();
    if !path.exists() {
        return AppearanceSettings::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_appearance(settings: AppearanceSettings) -> Result<(), String> {
    let path = appearance_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
