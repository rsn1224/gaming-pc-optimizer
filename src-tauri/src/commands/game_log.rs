use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_SESSIONS: usize = 500;

#[derive(Serialize, Deserialize, Clone)]
pub struct GameSession {
    pub id: String,
    pub game_name: String,
    pub profile_id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub duration_minutes: Option<u32>,
    pub score_before: Option<u32>,
    pub score_after: Option<u32>,
    pub memory_freed_mb: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GameStats {
    pub game_name: String,
    pub total_sessions: u32,
    pub total_hours: f32,
    pub avg_score: f32,
    pub last_played: u64,
}

fn game_log_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("game_log.json")
}

fn load_game_log() -> Vec<GameSession> {
    let path = game_log_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_game_log(sessions: &[GameSession]) -> Result<(), String> {
    let path = game_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(sessions).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Called when a profile is applied (game starts). Returns the session ID.
pub fn record_game_start(profile_id: &str, game_name: &str, score_before: u32) -> String {
    let timestamp = now_secs();
    // Truncate profile_id to first 8 chars for the session ID
    let id_part: String = profile_id.chars().take(8).collect();
    let session_id = format!("{}_{}", timestamp, id_part);

    let session = GameSession {
        id: session_id.clone(),
        game_name: game_name.to_string(),
        profile_id: profile_id.to_string(),
        started_at: timestamp,
        ended_at: None,
        duration_minutes: None,
        score_before: Some(score_before),
        score_after: None,
        memory_freed_mb: 0.0,
    };

    let mut sessions = load_game_log();
    sessions.insert(0, session);

    // Trim oldest if exceeding max
    if sessions.len() > MAX_SESSIONS {
        sessions.truncate(MAX_SESSIONS);
    }

    save_game_log(&sessions).ok();
    session_id
}

/// Called when game ends (profile restored).
pub fn record_game_end(session_id: &str, score_after: u32, memory_freed_mb: f64) {
    let mut sessions = load_game_log();
    let ended_at = now_secs();

    if let Some(session) = sessions.iter_mut().find(|s| s.id == session_id) {
        let duration_secs = ended_at.saturating_sub(session.started_at);
        let duration_minutes = (duration_secs / 60) as u32;

        session.ended_at = Some(ended_at);
        session.duration_minutes = Some(duration_minutes);
        session.score_after = Some(score_after);
        session.memory_freed_mb = memory_freed_mb;
    }

    save_game_log(&sessions).ok();
}

/// セッション ID で1件取得するヘルパー（watcher / ai から使用）
pub(crate) fn get_session_by_id(id: &str) -> Option<GameSession> {
    load_game_log().into_iter().find(|s| s.id == id)
}

#[tauri::command]
pub fn get_game_log() -> Vec<GameSession> {
    load_game_log()
}

#[tauri::command]
pub fn get_game_stats() -> Vec<GameStats> {
    let sessions = load_game_log();

    // Group by game_name
    let mut map: std::collections::HashMap<String, Vec<&GameSession>> =
        std::collections::HashMap::new();
    for session in &sessions {
        map.entry(session.game_name.clone())
            .or_default()
            .push(session);
    }

    let mut stats: Vec<GameStats> = map
        .into_iter()
        .map(|(game_name, game_sessions)| {
            let total_sessions = game_sessions.len() as u32;

            let total_minutes: u32 = game_sessions
                .iter()
                .filter_map(|s| s.duration_minutes)
                .sum();
            let total_hours = total_minutes as f32 / 60.0;

            let scores: Vec<u32> = game_sessions
                .iter()
                .filter_map(|s| s.score_before)
                .collect();
            let avg_score = if scores.is_empty() {
                0.0
            } else {
                scores.iter().sum::<u32>() as f32 / scores.len() as f32
            };

            let last_played = game_sessions
                .iter()
                .map(|s| s.started_at)
                .max()
                .unwrap_or(0);

            GameStats {
                game_name,
                total_sessions,
                total_hours,
                avg_score,
                last_played,
            }
        })
        .collect();

    // Sort by last_played descending
    stats.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    stats
}

#[tauri::command]
pub fn clear_game_log() -> Result<(), String> {
    let path = game_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, "[]").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_game_session(id: String) -> Result<(), String> {
    let mut sessions = load_game_log();
    let before = sessions.len();
    sessions.retain(|s| s.id != id);
    if sessions.len() == before {
        return Err(format!("Session not found: {}", id));
    }
    save_game_log(&sessions)
}
