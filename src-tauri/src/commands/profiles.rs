use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Model ────────────────────────────────────────────────────────────────────

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

// ── Storage helpers ──────────────────────────────────────────────────────────

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

fn save_profiles(profiles: &[GameProfile]) -> Result<(), String> {
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

// ── Tauri commands ───────────────────────────────────────────────────────────

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

// ── apply_profile ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn apply_profile(id: String) -> Result<String, String> {
    let profiles = load_profiles();
    let profile = profiles
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("ID '{}' のプロファイルが見つかりません", id))?;

    let mut log: Vec<String> = Vec::new();

    // Step 1: ブロートウェア停止
    if profile.kill_bloatware {
        match super::process::kill_bloatware(None).await {
            Ok(r) => log.push(format!(
                "[プロセス] {} 個停止, {:.1} MB 解放",
                r.killed.len(),
                r.freed_memory_mb
            )),
            Err(e) => return Err(format!("[プロセス停止エラー] {}", e)),
        }
    }

    // Step 2: 電源プラン
    match profile.power_plan.as_str() {
        "ultimate" => {
            super::power::set_ultimate_performance()
                .await
                .map_err(|e| format!("[電源プランエラー] {}", e))?;
            log.push("[電源] Ultimate Performance に切替".to_string());
        }
        "high_performance" => {
            // GUIDで高パフォーマンスプランを直接指定
            let out = std::process::Command::new("powercfg")
                .args(["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"])
                .output()
                .map_err(|e| format!("[電源プランエラー] {}", e))?;
            if !out.status.success() {
                return Err(format!(
                    "[電源プランエラー] {}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            log.push("[電源] 高パフォーマンスに切替".to_string());
        }
        _ => {} // "none"
    }

    // Step 3: Windows 設定
    match profile.windows_preset.as_str() {
        "gaming" => {
            super::windows_settings::apply_gaming_windows_settings()
                .map_err(|e| format!("[Windows設定エラー] {}", e))?;
            log.push("[Windows] ゲーミング設定を適用".to_string());
        }
        "default" => {
            super::windows_settings::restore_windows_settings()
                .map_err(|e| format!("[Windows設定エラー] {}", e))?;
            log.push("[Windows] デフォルト設定に復元".to_string());
        }
        _ => {}
    }

    // Step 4: ストレージクリーン
    let storage_ids: Vec<String> = match profile.storage_mode.as_str() {
        "light" => vec!["user_temp".to_string(), "win_temp".to_string()],
        "deep" => vec![
            "user_temp".to_string(),
            "win_temp".to_string(),
            "chrome_cache".to_string(),
            "edge_cache".to_string(),
            "thumbnails".to_string(),
            "nvidia_dx_cache".to_string(),
            "nvidia_gl_cache".to_string(),
            "amd_dx_cache".to_string(),
            "dx_shader_cache".to_string(),
        ],
        _ => vec![],
    };
    if !storage_ids.is_empty() {
        let r = super::storage::clean_storage(storage_ids);
        log.push(format!(
            "[ストレージ] {:.1} MB クリーン",
            r.freed_mb
        ));
    }

    // Step 5: ネットワーク最適化
    if profile.network_mode == "gaming" {
        super::network::apply_network_gaming()
            .map_err(|e| format!("[ネットワークエラー] {}", e))?;
        log.push("[ネットワーク] ゲーミング設定を適用".to_string());
    }

    // Step 6: DNS
    if profile.dns_preset != "none" {
        // 最初のアダプターに適用
        let adapters = super::network::get_network_adapters();
        if let Some(adapter) = adapters.into_iter().next() {
            super::network::set_adapter_dns(adapter.name.clone(), profile.dns_preset.clone())
                .map_err(|e| format!("[DNSエラー] {}", e))?;
            log.push(format!("[DNS] {} → {}", adapter.name, profile.dns_preset));
        }
    }

    Ok(log.join("\n"))
}
