use serde::{Deserialize, Serialize};
use std::path::PathBuf;
uuid::uuid; // ensure uuid crate is used

// ── Model ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameProfile {
    pub id: String,
    pub name: String,
    pub exe_path: String,
    pub tags: Vec<String>,

    pub kill_bloatware: bool,
    /// "none" | "ultimate" | "high_performance"
    pub power_plan: String,
    /// "none" | "gaming" | "default"
    pub windows_preset: String,
    /// "none" | "light" | "deep"
    pub storage_mode: String,
    /// "none" | "gaming"
    pub network_mode: String,
    /// "none" | "google" | "cloudflare" | "opendns" | "dhcp"
    pub dns_preset: String,
}

impl Default for GameProfile {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: String::new(),
            exe_path: String::new(),
            tags: Vec::new(),
            kill_bloatware: false,
            power_plan: "none".to_string(),
            windows_preset: "none".to_string(),
            storage_mode: "none".to_string(),
            network_mode: "none".to_string(),
            dns_preset: "none".to_string(),
        }
    }
}

// ── Storage helpers ────────────────────────────────────────────────────────

fn profiles_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("profiles.json")
}

fn load_profiles() -> Vec<GameProfile> {
    let path = profiles_path();
    if !path.exists() {
        return Vec::new();
    }
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str::<Vec<GameProfile>>(&raw).unwrap_or_default()
}

fn save_profiles(profiles: &Vec<GameProfile>) -> Result<(), String> {
    let path = profiles_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;
    }
    let json = serde_json::to_string_pretty(profiles)
        .map_err(|e| format!("JSON シリアライズ失敗: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("ファイル書き込み失敗: {}", e))
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_profiles() -> Vec<GameProfile> {
    load_profiles()
}

#[tauri::command]
pub fn save_profile(profile: GameProfile) -> Result<(), String> {
    let mut profiles = load_profiles();
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile;
    } else {
        profiles.push(profile);
    }
    save_profiles(&profiles)
}

#[tauri::command]
pub fn delete_profile(id: String) -> Result<(), String> {
    let mut profiles = load_profiles();
    let before = profiles.len();
    profiles.retain(|p| p.id != id);
    if profiles.len() == before {
        return Err(format!("ID '{}' のプロファイルが見つかりません", id));
    }
    save_profiles(&profiles)
}
