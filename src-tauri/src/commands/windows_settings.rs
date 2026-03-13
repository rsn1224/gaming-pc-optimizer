use serde::{Deserialize, Serialize};
use winreg::enums::*;
use winreg::RegKey;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowsSettings {
    pub visual_fx: u32,       // 0=auto, 1=best appearance, 2=best performance, 3=custom
    pub transparency: bool,
    pub game_dvr: bool,
    pub menu_show_delay: u32, // ms (0–400)
    pub animate_windows: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SettingsBackup {
    pub settings: WindowsSettings,
}

// ── helpers ────────────────────────────────────────────────────────────────

fn read_dword(key: &RegKey, name: &str, default: u32) -> u32 {
    key.get_value::<u32, _>(name).unwrap_or(default)
}

fn read_str_u32(key: &RegKey, name: &str, default: u32) -> u32 {
    key.get_value::<String, _>(name)
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(default)
}

fn backup_path() -> std::path::PathBuf {
    let mut path = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    path.push("gaming-pc-optimizer");
    path.push("settings_backup.json");
    path
}

// ── read ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_windows_settings() -> Result<WindowsSettings, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let visual_fx = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects")
        .map(|k| read_dword(&k, "VisualFXSetting", 0))
        .unwrap_or(0);

    let transparency = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .map(|k| read_dword(&k, "EnableTransparency", 1) != 0)
        .unwrap_or(true);

    let game_dvr = hkcu
        .open_subkey("System\\GameConfigStore")
        .map(|k| read_dword(&k, "GameDVR_Enabled", 1) != 0)
        .unwrap_or(true);

    let menu_show_delay = hkcu
        .open_subkey("Control Panel\\Desktop")
        .map(|k| read_str_u32(&k, "MenuShowDelay", 400))
        .unwrap_or(400);

    let animate_windows = hkcu
        .open_subkey("Control Panel\\Desktop\\WindowMetrics")
        .map(|k| {
            k.get_value::<String, _>("MinAnimate")
                .unwrap_or_else(|_| "1".to_string())
                != "0"
        })
        .unwrap_or(true);

    Ok(WindowsSettings {
        visual_fx,
        transparency,
        game_dvr,
        menu_show_delay,
        animate_windows,
    })
}

// ── individual setters ──────────────────────────────────────────────────────

#[tauri::command]
pub fn set_visual_fx(mode: u32) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects")
        .map_err(|e| e.to_string())?;
    key.set_value("VisualFXSetting", &mode)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_transparency(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .map_err(|e| e.to_string())?;
    key.set_value("EnableTransparency", &(if enabled { 1u32 } else { 0u32 }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_game_dvr(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("System\\GameConfigStore")
        .map_err(|e| e.to_string())?;
    key.set_value("GameDVR_Enabled", &(if enabled { 1u32 } else { 0u32 }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_menu_show_delay(delay_ms: u32) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Control Panel\\Desktop")
        .map_err(|e| e.to_string())?;
    key.set_value("MenuShowDelay", &delay_ms.to_string())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_animate_windows(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Control Panel\\Desktop\\WindowMetrics")
        .map_err(|e| e.to_string())?;
    key.set_value("MinAnimate", &(if enabled { "1" } else { "0" }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── bulk apply / restore ────────────────────────────────────────────────────

/// Read current settings, save as backup, then apply gaming optimizations.
#[tauri::command]
pub fn apply_gaming_windows_settings() -> Result<WindowsSettings, String> {
    // Backup current state first
    let current = get_windows_settings()?;
    let backup = SettingsBackup { settings: current };
    let backup_path = backup_path();
    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Ok(json) = serde_json::to_string_pretty(&backup) {
        std::fs::write(&backup_path, json).ok();
    }

    // Apply gaming-optimized values
    set_visual_fx(2)?;           // Best performance
    set_transparency(false)?;    // No transparency
    set_game_dvr(false)?;        // Disable Game DVR
    set_menu_show_delay(0)?;     // Instant menus
    set_animate_windows(false)?; // No animations

    get_windows_settings()
}

/// Restore from backup file, or fall back to Windows defaults.
#[tauri::command]
pub fn restore_windows_settings() -> Result<WindowsSettings, String> {
    let backup_path = backup_path();
    let restored = if backup_path.exists() {
        std::fs::read_to_string(&backup_path)
            .ok()
            .and_then(|s| serde_json::from_str::<SettingsBackup>(&s).ok())
            .map(|b| b.settings)
    } else {
        None
    };

    let target = restored.unwrap_or(WindowsSettings {
        visual_fx: 0,
        transparency: true,
        game_dvr: true,
        menu_show_delay: 400,
        animate_windows: true,
    });

    set_visual_fx(target.visual_fx)?;
    set_transparency(target.transparency)?;
    set_game_dvr(target.game_dvr)?;
    set_menu_show_delay(target.menu_show_delay)?;
    set_animate_windows(target.animate_windows)?;

    // Remove backup after successful restore
    std::fs::remove_file(&backup_path).ok();

    get_windows_settings()
}

/// Returns true when a backup file exists (i.e. gaming settings are active).
#[tauri::command]
pub fn has_windows_settings_backup() -> bool {
    backup_path().exists()
}

/// Apply an arbitrary WindowsSettings preset in one call (used by the preset UI).
#[tauri::command]
pub fn apply_windows_preset(settings: WindowsSettings) -> Result<WindowsSettings, String> {
    set_visual_fx(settings.visual_fx)?;
    set_transparency(settings.transparency)?;
    set_game_dvr(settings.game_dvr)?;
    set_menu_show_delay(settings.menu_show_delay)?;
    set_animate_windows(settings.animate_windows)?;
    get_windows_settings()
}

/// Export current settings + builtin preset definitions as JSON.
/// Intended to be pasted into Claude Code for natural-language preset generation.
#[tauri::command]
pub fn export_windows_settings_context() -> Result<String, String> {
    let current = get_windows_settings()?;

    let context = serde_json::json!({
        "schema_version": "1.0",
        "purpose": "WindowsSettings preset generation context for Claude",
        "fields": {
            "visual_fx": "0=auto, 1=見た目優先, 2=パフォーマンス優先, 3=カスタム",
            "transparency": "bool — タスクバー透明効果",
            "game_dvr": "bool — Game DVR / Xbox Game Bar 録画機能",
            "menu_show_delay": "u32 ms (0–400) — コンテキストメニュー表示遅延",
            "animate_windows": "bool — ウィンドウ最小化・最大化アニメーション"
        },
        "current": current,
        "builtin_presets": [
            {
                "id": "default",
                "label": "標準 (Windows デフォルト)",
                "settings": { "visual_fx": 0, "transparency": true, "game_dvr": true, "menu_show_delay": 400, "animate_windows": true }
            },
            {
                "id": "gaming",
                "label": "ゲーミング最適化",
                "settings": { "visual_fx": 2, "transparency": false, "game_dvr": false, "menu_show_delay": 0, "animate_windows": false }
            },
            {
                "id": "balanced",
                "label": "バランス",
                "settings": { "visual_fx": 0, "transparency": false, "game_dvr": false, "menu_show_delay": 100, "animate_windows": true }
            }
        ],
        "custom_presets_note": "Add new presets to src/data/windows_presets.ts (BUILTIN_WINDOWS_PRESETS array)"
    });

    serde_json::to_string_pretty(&context).map_err(|e| e.to_string())
}
