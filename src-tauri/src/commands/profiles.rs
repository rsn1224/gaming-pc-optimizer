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
    /// AI confidence score 0–100 (100 = very confident)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_confidence: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launcher: Option<String>, // "steam" | "epic" | "battlenet" | "custom"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steam_app_id: Option<String>,
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
            recommended_confidence: None,
            launcher: None,
            steam_app_id: None,
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

pub(crate) fn save_profiles(profiles: &[GameProfile]) -> Result<(), String> {
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
        let dy = if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) { 366 } else { 365 };
        if days < dy { break; }
        days -= dy;
        y += 1;
    }
    let leap = y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400));
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

// ── simulate_profile ─────────────────────────────────────────────────────────

/// Build preview changes from a profile's settings against the current snapshot.
/// Read-only — no system changes are made.
fn build_profile_preview_changes(
    profile: &GameProfile,
    snapshot: &super::rollback::SystemSnapshot,
) -> Vec<super::optimizer::PreviewChange> {
    use super::optimizer::PreviewChange;
    use super::rollback::RiskLevel;

    let mut changes = Vec::new();

    // 1. Kill bloatware
    if profile.kill_bloatware {
        changes.push(PreviewChange {
            category: "process".to_string(),
            target: "ブロートウェア停止".to_string(),
            current_value: serde_json::Value::Null,
            new_value: serde_json::json!("既知のブロートウェアプロセスを停止"),
            risk_level: RiskLevel::Safe,
            will_apply: true,
            description: "OneDrive, Cortana, Xbox Game Bar 等の不要プロセスを停止します".to_string(),
        });
    }

    // 2. Power plan
    match profile.power_plan.as_str() {
        "ultimate" => {
            let guid = snapshot.power_plan_guid.clone().unwrap_or_default();
            let already = guid.to_lowercase().contains("e9a42b02");
            changes.push(PreviewChange {
                category: "power".to_string(),
                target: "電源プラン".to_string(),
                current_value: serde_json::json!(if guid.is_empty() { "不明" } else { guid.as_str() }),
                new_value: serde_json::json!("Ultimate Performance"),
                risk_level: RiskLevel::Caution,
                will_apply: !already,
                description: "Ultimate Performance プランに切替（ACアダプタ接続推奨）".to_string(),
            });
        }
        "high_performance" => {
            let guid = snapshot.power_plan_guid.clone().unwrap_or_default();
            let already = guid.to_lowercase().contains("8c5e7fda");
            changes.push(PreviewChange {
                category: "power".to_string(),
                target: "電源プラン".to_string(),
                current_value: serde_json::json!(if guid.is_empty() { "不明" } else { guid.as_str() }),
                new_value: serde_json::json!("High Performance"),
                risk_level: RiskLevel::Caution,
                will_apply: !already,
                description: "高パフォーマンスプランに切替".to_string(),
            });
        }
        _ => {}
    }

    // 3. Windows preset
    match profile.windows_preset.as_str() {
        "gaming" => {
            let already = if let Some(ws_val) = &snapshot.windows_settings {
                serde_json::from_value::<super::windows_settings::WindowsSettings>(ws_val.clone())
                    .map(|ws| {
                        ws.visual_fx == 2
                            && !ws.transparency
                            && !ws.game_dvr
                            && ws.menu_show_delay == 0
                            && !ws.animate_windows
                    })
                    .unwrap_or(false)
            } else {
                false
            };
            changes.push(PreviewChange {
                category: "windows".to_string(),
                target: "Windows 視覚効果・ゲーム設定".to_string(),
                current_value: snapshot.windows_settings.clone().unwrap_or(serde_json::Value::Null),
                new_value: serde_json::json!({
                    "visual_fx": 2, "transparency": false,
                    "game_dvr": false, "menu_show_delay": 0, "animate_windows": false
                }),
                risk_level: RiskLevel::Caution,
                will_apply: !already,
                description: "視覚効果をパフォーマンス優先に設定・Game DVR 無効化".to_string(),
            });
        }
        "default" => {
            changes.push(PreviewChange {
                category: "windows".to_string(),
                target: "Windows 設定をデフォルトに復元".to_string(),
                current_value: snapshot.windows_settings.clone().unwrap_or(serde_json::Value::Null),
                new_value: serde_json::json!("default"),
                risk_level: RiskLevel::Caution,
                will_apply: true,
                description: "Windows 視覚効果・ゲーム設定をデフォルトに戻します".to_string(),
            });
        }
        _ => {}
    }

    // 4. Storage mode
    match profile.storage_mode.as_str() {
        "light" => {
            changes.push(PreviewChange {
                category: "storage".to_string(),
                target: "一時ファイルクリーン（軽量）".to_string(),
                current_value: serde_json::Value::Null,
                new_value: serde_json::json!(["user_temp", "win_temp"]),
                risk_level: RiskLevel::Safe,
                will_apply: true,
                description: "ユーザー・Windows 一時ファイルを削除します".to_string(),
            });
        }
        "deep" => {
            changes.push(PreviewChange {
                category: "storage".to_string(),
                target: "ストレージクリーン（ディープ）".to_string(),
                current_value: serde_json::Value::Null,
                new_value: serde_json::json!(["user_temp", "win_temp", "browser_cache", "shader_cache"]),
                risk_level: RiskLevel::Caution,
                will_apply: true,
                description: "一時ファイル・ブラウザキャッシュ・シェーダーキャッシュを削除します".to_string(),
            });
        }
        _ => {}
    }

    // 5. Network mode
    if profile.network_mode == "gaming" {
        let ns = super::network::get_network_settings();
        let already = ns.throttling_disabled && ns.system_responsiveness == 0 && ns.nagle_disabled;
        changes.push(PreviewChange {
            category: "network".to_string(),
            target: "ネットワーク最適化".to_string(),
            current_value: serde_json::to_value(&ns).unwrap_or(serde_json::Value::Null),
            new_value: serde_json::json!({
                "throttling_disabled": true,
                "system_responsiveness": 0,
                "nagle_disabled": true
            }),
            risk_level: RiskLevel::Advanced,
            will_apply: !already,
            description: "NetworkThrottling 無効化・Nagle アルゴリズム無効化（管理者権限必要）".to_string(),
        });
    }

    // 6. DNS preset
    if profile.dns_preset != "none" {
        changes.push(PreviewChange {
            category: "network".to_string(),
            target: format!("DNS: {}", profile.dns_preset),
            current_value: serde_json::Value::Null,
            new_value: serde_json::json!(profile.dns_preset),
            risk_level: RiskLevel::Caution,
            will_apply: true,
            description: format!("{} DNS サーバーに変更します", profile.dns_preset),
        });
    }

    changes
}

/// Dry-run simulation for a specific profile: shows what would change without applying.
/// Saves a `SessionMode::Sim` entry in rollback history.
#[tauri::command]
pub async fn simulate_profile(id: String) -> Result<super::optimizer::SimulationResult, String> {
    use super::optimizer::{PreviewChange, SimulationResult};
    use super::rollback::{self, ChangeRecord, RiskLevel, SessionMode};

    let profiles = load_profiles();
    let profile = profiles
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("ID '{}' のプロファイルが見つかりません", id))?;

    let profile_name = profile.name.clone();
    let profile_id_str = profile.id.clone();

    // Begin Sim session — captures snapshot, nothing is changed
    let session = tokio::task::spawn_blocking(move || {
        rollback::begin_session(SessionMode::Sim, Some(profile_id_str))
    })
    .await
    .map_err(|e| e.to_string())?;

    let snapshot = session.snapshot.clone();
    let session_id = session.id.clone();

    // Analyze changes (read-only, blocking)
    let changes: Vec<PreviewChange> = tokio::task::spawn_blocking(move || {
        build_profile_preview_changes(&profile, &snapshot)
    })
    .await
    .map_err(|e| e.to_string())?;

    let safe_count = changes
        .iter()
        .filter(|c| c.risk_level == RiskLevel::Safe && c.will_apply)
        .count();
    let caution_count = changes
        .iter()
        .filter(|c| c.risk_level == RiskLevel::Caution && c.will_apply)
        .count();
    let advanced_count = changes
        .iter()
        .filter(|c| c.risk_level == RiskLevel::Advanced && c.will_apply)
        .count();

    // Persist sim session with preview change records
    if let Ok(mut s) = rollback::load_session(&session_id) {
        let change_records: Vec<ChangeRecord> = changes
            .iter()
            .map(|c| ChangeRecord {
                category: c.category.clone(),
                target: c.target.clone(),
                before: c.current_value.clone(),
                after: c.new_value.clone(),
                risk_level: c.risk_level.clone(),
                applied: false,
            })
            .collect();
        let summary = serde_json::json!({
            "mode": "sim",
            "profile_name": profile_name,
            "safe": safe_count,
            "caution": caution_count,
            "advanced": advanced_count
        });
        rollback::complete_session(&mut s, change_records, summary, true);
        rollback::save_session(&s).ok();
    }

    Ok(SimulationResult {
        changes,
        safe_count,
        caution_count,
        advanced_count,
        session_id,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_profile(overrides: impl Fn(&mut GameProfile)) -> GameProfile {
        let mut p = GameProfile::default();
        overrides(&mut p);
        p
    }

    // ── is_draft ──────────────────────────────────────────────────────────────

    #[test]
    fn is_draft_true_for_default_profile() {
        assert!(is_draft(&GameProfile::default()));
    }

    #[test]
    fn is_draft_false_when_kill_bloatware_set() {
        let p = make_profile(|p| p.kill_bloatware = true);
        assert!(!is_draft(&p));
    }

    #[test]
    fn is_draft_false_when_power_plan_set() {
        let p = make_profile(|p| p.power_plan = "ultimate".to_string());
        assert!(!is_draft(&p));
    }

    #[test]
    fn is_draft_false_when_network_mode_set() {
        let p = make_profile(|p| p.network_mode = "gaming".to_string());
        assert!(!is_draft(&p));
    }

    // ── GameProfile::default ──────────────────────────────────────────────────

    #[test]
    fn game_profile_default_fields_are_none_values() {
        let p = GameProfile::default();
        assert!(!p.id.is_empty(), "id must be a non-empty UUID");
        assert_eq!(p.power_plan, "none");
        assert_eq!(p.windows_preset, "none");
        assert_eq!(p.network_mode, "none");
        assert_eq!(p.dns_preset, "none");
        assert!(!p.kill_bloatware);
    }

    // ── unix_to_ymd_hms ───────────────────────────────────────────────────────

    #[test]
    fn unix_epoch_zero_is_1970_01_01() {
        assert_eq!(unix_to_ymd_hms(0), (1970, 1, 1, 0, 0, 0));
    }

    #[test]
    fn unix_one_day_is_1970_01_02() {
        assert_eq!(unix_to_ymd_hms(86400), (1970, 1, 2, 0, 0, 0));
    }

    #[test]
    fn unix_leap_year_feb29_is_valid() {
        // 2000-02-29 00:00:00 UTC = 951782400
        let (y, mo, d, _, _, _) = unix_to_ymd_hms(951782400);
        assert_eq!((y, mo, d), (2000, 2, 29));
    }
}
