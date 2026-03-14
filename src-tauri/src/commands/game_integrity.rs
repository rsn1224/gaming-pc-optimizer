use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone)]
pub struct GameIntegrityResult {
    pub game_name: String,
    pub app_id: String,
    pub status: String,
    pub issues_found: u32,
    pub message: String,
}

fn parse_acf_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    let search = format!("\"{}\"", key);
    let pos = content.find(search.as_str())?;
    let after_key = &content[pos + search.len()..];
    // skip whitespace then expect a quoted value
    let trimmed = after_key.trim_start_matches(['\t', ' ']);
    if let Some(inner) = trimmed.strip_prefix('"') {
        let end = inner.find('"')?;
        Some(&inner[..end])
    } else {
        None
    }
}

fn scan_steam_acf_files() -> Vec<serde_json::Value> {
    let steam_path = r"C:\Program Files (x86)\Steam\steamapps";
    let mut games = Vec::new();

    let read_dir = match std::fs::read_dir(steam_path) {
        Ok(r) => r,
        Err(_) => return games,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let app_id = parse_acf_value(&content, "appid").unwrap_or("").to_string();
        let name = parse_acf_value(&content, "name").unwrap_or("").to_string();
        if app_id.is_empty() || name.is_empty() {
            continue;
        }
        games.push(serde_json::json!({
            "app_id": app_id,
            "name": name,
            "source": "steam_acf"
        }));
    }

    games
}

fn read_profiles_steam_games() -> Vec<serde_json::Value> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let profiles_path = std::path::PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("profiles.json");

    let content = match std::fs::read_to_string(&profiles_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let profiles: Vec<serde_json::Value> = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    profiles
        .into_iter()
        .filter_map(|p| {
            let app_id = p.get("steam_app_id")?.as_str()?.to_string();
            if app_id.is_empty() {
                return None;
            }
            let name = p
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("不明")
                .to_string();
            Some(serde_json::json!({
                "app_id": app_id,
                "name": name,
                "source": "profile"
            }))
        })
        .collect()
}

#[tauri::command]
pub fn get_steam_games_for_verify() -> Result<Vec<serde_json::Value>, String> {
    let mut games = scan_steam_acf_files();
    let profile_games = read_profiles_steam_games();

    // merge: avoid duplicates by app_id
    let existing_ids: std::collections::HashSet<String> = games
        .iter()
        .filter_map(|g| g.get("app_id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    for g in profile_games {
        let id = g.get("app_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !existing_ids.contains(&id) {
            games.push(g);
        }
    }

    Ok(games)
}

#[tauri::command]
pub async fn verify_game_files(app_id: String, game_name: String) -> Result<GameIntegrityResult, String> {
    let url = format!("steam://validate/{}", app_id);
    Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn()
        .map_err(|e| format!("Steamの起動に失敗しました: {}", e))?;

    Ok(GameIntegrityResult {
        game_name,
        app_id,
        status: "started".to_string(),
        issues_found: 0,
        message: "Steamでファイル検証を開始しました。Steamクライアントで進行状況を確認してください。".to_string(),
    })
}
