use super::profiles::{load_profiles, save_profiles, GameProfile};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct SharedProfile {
    pub schema: String, // "gaming-pc-optimizer-profile-v1"
    pub exported_at: String,
    pub profile: GameProfile,
    pub system_hint: String,
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let days = (secs / 86400) as u32;
    let (year, month, day) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

fn days_to_ymd(mut days: u32) -> (u32, u32, u32) {
    let mut year = 1970u32;
    loop {
        let leap =
            (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400);
    let days_in_month: [u32; 12] = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1u32;
    for &dim in &days_in_month {
        if days < dim {
            break;
        }
        days -= dim;
        month += 1;
    }
    (year, month, days + 1)
}

fn get_cpu_name() -> String {
    use sysinfo::{CpuRefreshKind, RefreshKind, System};
    let mut sys =
        System::new_with_specifics(RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing()));
    sys.refresh_cpu_list(CpuRefreshKind::nothing());
    sys.cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string())
}

/// Export a single profile as shareable JSON string
#[tauri::command]
pub fn export_profile_share(profile_id: String) -> Result<String, String> {
    let profiles = load_profiles();
    let profile = profiles
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("ID '{}' のプロファイルが見つかりません", profile_id))?;

    let cpu_name = get_cpu_name();
    let shared = SharedProfile {
        schema: "gaming-pc-optimizer-profile-v1".to_string(),
        exported_at: now_iso(),
        system_hint: format!("Exported from: {}", cpu_name),
        profile,
    };

    serde_json::to_string_pretty(&shared).map_err(|e| e.to_string())
}

/// Import a shared profile JSON string
#[tauri::command]
pub fn import_profile_share(json: String) -> Result<String, String> {
    let shared: SharedProfile =
        serde_json::from_str(&json).map_err(|e| format!("JSON パースエラー: {}", e))?;

    if shared.schema != "gaming-pc-optimizer-profile-v1" {
        return Err(format!("非対応のスキーマです: {}", shared.schema));
    }

    let mut profile = shared.profile;
    // Assign a new UUID so it doesn't conflict with existing profiles
    profile.id = uuid::Uuid::new_v4().to_string();
    let profile_name = profile.name.clone();

    let mut profiles = load_profiles();
    profiles.push(profile);
    save_profiles(&profiles)?;

    Ok(profile_name)
}

/// Export all profiles as a JSON bundle
#[tauri::command]
pub fn export_all_profiles_share() -> Result<String, String> {
    let profiles = load_profiles();
    let cpu_name = get_cpu_name();

    let shared_profiles: Vec<SharedProfile> = profiles
        .into_iter()
        .map(|profile| SharedProfile {
            schema: "gaming-pc-optimizer-profile-v1".to_string(),
            exported_at: now_iso(),
            system_hint: format!("Exported from: {}", cpu_name),
            profile,
        })
        .collect();

    let bundle = serde_json::json!({
        "schema": "gaming-pc-optimizer-bundle-v1",
        "exported_at": now_iso(),
        "system_hint": format!("Exported from: {}", cpu_name),
        "profiles": shared_profiles,
    });

    serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())
}
