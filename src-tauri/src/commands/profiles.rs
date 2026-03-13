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

    // Phase 8: AI-set metadata — optional for backward-compat with existing profiles.json
    // NOTE: future `game_id: Option<String>` belongs here when 1-game:N-profiles is needed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_mode: Option<String>, // "competitive" | "balanced" | "quality"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launcher: Option<String>, // "steam" | "epic" | "battlenet" | "custom"
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
            recommended_mode: None,
            recommended_reason: None,
            launcher: None,
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

pub fn load_profiles() -> Vec<GameProfile> {
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

// ── is_draft helper ──────────────────────────────────────────────────────────

/// A profile is a "draft" if none of its optimization flags have been set yet.
/// Computed dynamically at export time; no field added to GameProfile.
fn is_draft(p: &GameProfile) -> bool {
    !p.kill_bloatware
        && p.power_plan == "none"
        && p.windows_preset == "none"
        && p.storage_mode == "none"
        && p.network_mode == "none"
        && p.dns_preset == "none"
}

// ── export_profiles_context ───────────────────────────────────────────────────

#[derive(Serialize)]
struct SystemSnapshot {
    cpu_name: String,
    cpu_cores: usize,
    memory_total_mb: f64,
    os_name: String,
    os_version: String,
}

#[derive(Serialize)]
struct GpuSnapshot {
    name: String,
    vram_total_mb: f64,
}

#[derive(Serialize)]
struct ProfileEntry<'a> {
    id: &'a str,
    name: &'a str,
    exe_path: &'a str,
    tags: &'a [String],
    is_draft: bool,
    settings: ProfileSettings<'a>,
}

#[derive(Serialize)]
struct ProfileSettings<'a> {
    kill_bloatware: bool,
    power_plan: &'a str,
    windows_preset: &'a str,
    storage_mode: &'a str,
    network_mode: &'a str,
    dns_preset: &'a str,
}

/// Export system info + all profiles into a single JSON string.
/// Intended for use with Claude Code to generate AI-assisted profile suggestions.
/// `cpu_usage` is deliberately excluded to avoid the 200 ms polling delay.
#[tauri::command]
pub fn export_profiles_context() -> Result<String, String> {
    // System info (lightweight — no cpu_usage, no sleep)
    use sysinfo::{MemoryRefreshKind, RefreshKind, System};
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();

    let (cpu_name, cpu_cores) = {
        use sysinfo::CpuRefreshKind;
        let mut s2 = System::new_with_specifics(
            RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing()),
        );
        s2.refresh_cpu_list(CpuRefreshKind::nothing());
        let name = s2.cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        let cores = s2.cpus().len();
        (name, cores)
    };

    let system = SystemSnapshot {
        cpu_name,
        cpu_cores,
        memory_total_mb: sys.total_memory() as f64 / 1024.0 / 1024.0,
        os_name: System::name().unwrap_or_else(|| "Windows".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
    };

    // GPU info
    let gpu: Vec<GpuSnapshot> = super::system_info::get_gpu_info()
        .into_iter()
        .map(|g| GpuSnapshot {
            name: g.name,
            vram_total_mb: g.vram_total_mb,
        })
        .collect();

    // Profiles
    let raw_profiles = load_profiles();
    let profile_entries: Vec<ProfileEntry> = raw_profiles
        .iter()
        .map(|p| ProfileEntry {
            id: &p.id,
            name: &p.name,
            exe_path: &p.exe_path,
            tags: &p.tags,
            is_draft: is_draft(p),
            settings: ProfileSettings {
                kill_bloatware: p.kill_bloatware,
                power_plan: &p.power_plan,
                windows_preset: &p.windows_preset,
                storage_mode: &p.storage_mode,
                network_mode: &p.network_mode,
                dns_preset: &p.dns_preset,
            },
        })
        .collect();

    // Available options (so AI knows valid values)
    let available_options = serde_json::json!({
        "power_plan":      ["none", "ultimate", "high_performance"],
        "windows_preset":  ["none", "gaming", "default"],
        "storage_mode":    ["none", "light", "deep"],
        "network_mode":    ["none", "gaming"],
        "dns_preset":      ["none", "google", "cloudflare", "opendns", "dhcp"]
    });

    let ctx = serde_json::json!({
        "schema_version": "1",
        "generated_at": chrono_now(),
        "available_options": available_options,
        "system": system,
        "gpu": gpu,
        "profiles": profile_entries,
    });

    serde_json::to_string_pretty(&ctx).map_err(|e| e.to_string())
}

fn chrono_now() -> String {
    // Simple ISO-8601 timestamp without pulling in chrono crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Format as approximate UTC (good enough for context metadata)
    let (y, mo, d, h, mi, s) = unix_to_ymd_hms(secs);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, mi, s)
}

fn unix_to_ymd_hms(secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let s = secs % 60;
    let total_min = secs / 60;
    let mi = total_min % 60;
    let total_hr = total_min / 60;
    let h = total_hr % 24;
    let mut days = total_hr / 24;
    let mut y = 1970u64;
    loop {
        let dy = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if days < dy { break; }
        days -= dy;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let months = [31u64, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mo = 1u64;
    for dm in &months {
        if days < *dm { break; }
        days -= dm;
        mo += 1;
    }
    (y, mo, days + 1, h, mi, s)
}

// ── launch_game ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn launch_game(exe_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&exe_path);
    let dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    std::process::Command::new(&exe_path)
        .current_dir(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("起動失敗: {}", e))
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

/// Internal version callable from watcher task (not a Tauri command).
pub async fn apply_profile_internal(id: &str) -> Result<String, String> {
    let profiles = load_profiles();
    let profile = profiles
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("ID '{}' のプロファイルが見つかりません", id))?;
    apply_profile_with(profile).await
}

#[tauri::command]
pub async fn apply_profile(id: String) -> Result<String, String> {
    apply_profile_internal(&id).await
}

async fn apply_profile_with(profile: GameProfile) -> Result<String, String> {
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

    // Step 2: 電源プラン（変更前に現在のプランをバックアップ）
    match profile.power_plan.as_str() {
        "ultimate" => {
            if let Some(guid) = super::power::get_current_power_guid() {
                super::power::save_power_backup(&guid);
            }
            super::power::set_ultimate_performance()
                .await
                .map_err(|e| format!("[電源プランエラー] {}", e))?;
            log.push("[電源] Ultimate Performance に切替".to_string());
        }
        "high_performance" => {
            if let Some(guid) = super::power::get_current_power_guid() {
                super::power::save_power_backup(&guid);
            }
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
        log.push(format!("[ストレージ] {:.1} MB クリーン", r.freed_mb));
    }

    // Step 5: ネットワーク最適化
    if profile.network_mode == "gaming" {
        super::network::apply_network_gaming()
            .map_err(|e| format!("[ネットワークエラー] {}", e))?;
        log.push("[ネットワーク] ゲーミング設定を適用".to_string());
    }

    // Step 6: DNS
    if profile.dns_preset != "none" {
        let adapters = super::network::get_network_adapters();
        if let Some(adapter) = adapters.into_iter().next() {
            super::network::set_adapter_dns(adapter.name.clone(), profile.dns_preset.clone())
                .map_err(|e| format!("[DNSエラー] {}", e))?;
            log.push(format!("[DNS] {} → {}", adapter.name, profile.dns_preset));
        }
    }

    Ok(log.join("\n"))
}
