use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const CURRENT_VERSION: &str = "1.0.0";

#[derive(Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: String,
    pub has_update: bool,
    pub checked_at: u64,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn no_update_response() -> UpdateInfo {
    UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: CURRENT_VERSION.to_string(),
        release_url: String::new(),
        release_notes: "最新版をご利用中です".to_string(),
        has_update: false,
        checked_at: now_secs(),
    }
}

fn compare_versions(current: &str, latest: &str) -> bool {
    // Simple semver comparison: parse each part and compare
    let parse = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.parse::<u64>().ok())
            .collect()
    };
    let cur = parse(current);
    let lat = parse(latest);
    let len = cur.len().max(lat.len());
    for i in 0..len {
        let c = cur.get(i).copied().unwrap_or(0);
        let l = lat.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("gaming-pc-optimizer/1.0.0")
        .build()
        .map_err(|e| e.to_string())?;

    let url = "https://api.github.com/repos/your-username/gaming-pc-optimizer/releases/latest";

    let resp = match client.get(url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(no_update_response()),
    };

    if !resp.status().is_success() {
        return Ok(no_update_response());
    }

    let body: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return Ok(no_update_response()),
    };

    let tag_name = match body["tag_name"].as_str() {
        Some(t) => t.to_string(),
        None => return Ok(no_update_response()),
    };

    let release_url = body["html_url"].as_str().unwrap_or("").to_string();

    let release_notes = body["body"]
        .as_str()
        .unwrap_or("リリースノートはありません")
        .to_string();

    let latest_clean = tag_name.trim_start_matches('v').to_string();
    let has_update = compare_versions(CURRENT_VERSION, &latest_clean);

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: tag_name,
        release_url,
        release_notes,
        has_update,
        checked_at: now_secs(),
    })
}

#[tauri::command]
pub fn open_release_url(url: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", &url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
