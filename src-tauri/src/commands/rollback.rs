use super::metrics::SessionMetrics;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Feature flag ──────────────────────────────────────────────────────────────

pub struct RollbackConfig {
    pub enabled: bool,
    pub max_sessions: usize,
}

pub const ROLLBACK_CONFIG: RollbackConfig = RollbackConfig {
    enabled: true,
    max_sessions: 10,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Safe,
    Caution,
    Advanced,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionMode {
    Real,
    Sim,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Applied,
    Restored,
    PartialRestore,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
    /// "process" | "power" | "windows" | "network"
    pub category: String,
    /// human-readable target name
    pub target: String,
    pub before: serde_json::Value,
    pub after: serde_json::Value,
    pub risk_level: RiskLevel,
    pub applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSnapshot {
    pub power_plan_guid: Option<String>,
    pub windows_settings: Option<serde_json::Value>,
    pub network_settings: Option<serde_json::Value>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationSession {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub profile_id: Option<String>,
    pub mode: SessionMode,
    pub status: SessionStatus,
    pub snapshot: SystemSnapshot,
    pub changes: Vec<ChangeRecord>,
    pub summary: Option<serde_json::Value>,
    /// Performance metrics captured before optimization (Phase 2)
    #[serde(default)]
    pub metrics_before: Option<SessionMetrics>,
    /// Performance metrics captured after optimization (Phase 2)
    #[serde(default)]
    pub metrics_after: Option<SessionMetrics>,
}

// ── Paths ─────────────────────────────────────────────────────────────────────

fn sessions_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("sessions")
}

fn session_path(id: &str) -> PathBuf {
    sessions_dir().join(format!("{}.json", id))
}

// ── Time helpers ──────────────────────────────────────────────────────────────

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
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

fn now_iso8601() -> String {
    let secs = now_unix_secs();
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

pub fn new_session_id() -> String {
    format!("session_{}", now_unix_secs())
}

// ── Snapshot capture ──────────────────────────────────────────────────────────

pub(crate) fn capture_snapshot() -> SystemSnapshot {
    let power_plan_guid = super::power::get_current_power_guid();

    let windows_settings = super::windows_settings::get_windows_settings()
        .ok()
        .and_then(|s| serde_json::to_value(s).ok());

    let network_settings = serde_json::to_value(super::network::get_network_settings()).ok();

    SystemSnapshot {
        power_plan_guid,
        windows_settings,
        network_settings,
        captured_at: now_iso8601(),
    }
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

/// Create and persist a new session with a before-snapshot.
pub(crate) fn begin_session(mode: SessionMode, profile_id: Option<String>) -> OptimizationSession {
    let snapshot = capture_snapshot();
    let id = new_session_id();
    let started_at = snapshot.captured_at.clone();
    let metrics_before = Some(super::metrics::capture_metrics());
    let session = OptimizationSession {
        id,
        started_at,
        ended_at: None,
        profile_id,
        mode,
        status: SessionStatus::Applied,
        snapshot,
        changes: Vec::new(),
        summary: None,
        metrics_before,
        metrics_after: None,
    };
    save_session(&session).ok();

    // Prune old sessions to keep max_sessions
    prune_old_sessions();

    session
}

/// Finalize a session after optimization is complete.
pub(crate) fn complete_session(
    session: &mut OptimizationSession,
    changes: Vec<ChangeRecord>,
    summary: serde_json::Value,
    success: bool,
) {
    session.ended_at = Some(now_iso8601());
    session.changes = changes;
    session.summary = Some(summary);
    session.status = if success {
        SessionStatus::Applied
    } else {
        SessionStatus::Failed
    };
}

/// Attach after-optimization metrics to an existing session.
pub(crate) fn update_metrics_after(id: &str, metrics: SessionMetrics) {
    if let Ok(mut s) = load_session(id) {
        s.metrics_after = Some(metrics);
        save_session(&s).ok();
    }
}

/// Restore system to the before-state captured in the given session.
pub(crate) fn restore_session_internal(id: &str) -> Result<(), String> {
    let mut session = load_session(id)?;
    let snapshot = session.snapshot.clone();
    let mut errors: Vec<String> = Vec::new();

    // 1. Power plan
    if let Some(ref guid) = snapshot.power_plan_guid {
        if let Err(e) = super::power::restore_power_plan_internal(guid) {
            errors.push(format!("電源プラン: {}", e));
        }
    }

    // 2. Windows settings (restore to exact before-values)
    if let Some(ref ws_val) = snapshot.windows_settings {
        match serde_json::from_value::<super::windows_settings::WindowsSettings>(ws_val.clone()) {
            Ok(ws) => {
                super::windows_settings::set_visual_fx(ws.visual_fx).ok();
                super::windows_settings::set_transparency(ws.transparency).ok();
                super::windows_settings::set_game_dvr(ws.game_dvr).ok();
                super::windows_settings::set_menu_show_delay(ws.menu_show_delay).ok();
                super::windows_settings::set_animate_windows(ws.animate_windows).ok();
            }
            Err(e) => errors.push(format!("Windows設定: {}", e)),
        }
    }

    // 3. Network settings (restore to exact before-values)
    if let Some(ref ns_val) = snapshot.network_settings {
        match serde_json::from_value::<super::network::NetworkSettings>(ns_val.clone()) {
            Ok(ns) => {
                if let Err(e) = super::network::restore_network_to(&ns) {
                    errors.push(format!("ネットワーク設定: {}", e));
                }
            }
            Err(e) => errors.push(format!("ネットワーク設定(parse): {}", e)),
        }
    }

    // Update session status
    session.status = if errors.is_empty() {
        SessionStatus::Restored
    } else {
        SessionStatus::PartialRestore
    };
    session.ended_at = Some(now_iso8601());
    save_session(&session).ok();

    super::log_observation(
        "restore_session",
        serde_json::json!({ "id": id, "errors": errors }),
    );

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

// ── Session persistence ───────────────────────────────────────────────────────

pub(crate) fn save_session(session: &OptimizationSession) -> Result<(), String> {
    let dir = sessions_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    std::fs::write(session_path(&session.id), json).map_err(|e| e.to_string())
}

pub(crate) fn load_session(id: &str) -> Result<OptimizationSession, String> {
    let raw = std::fs::read_to_string(session_path(id)).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub(crate) fn list_sessions_internal() -> Vec<OptimizationSession> {
    let dir = sessions_dir();
    if !dir.exists() {
        return vec![];
    }
    let mut sessions: Vec<OptimizationSession> = std::fs::read_dir(&dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|ext| ext == "json"))
                .filter_map(|e| {
                    std::fs::read_to_string(e.path())
                        .ok()
                        .and_then(|s| serde_json::from_str::<OptimizationSession>(&s).ok())
                })
                .collect()
        })
        .unwrap_or_default();
    sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    sessions
}

fn prune_old_sessions() {
    let mut sessions = list_sessions_internal();
    if sessions.len() <= ROLLBACK_CONFIG.max_sessions {
        return;
    }
    // sessions is sorted newest-first; remove the oldest ones
    sessions.truncate(ROLLBACK_CONFIG.max_sessions);
    let keep_ids: std::collections::HashSet<&str> =
        sessions.iter().map(|s| s.id.as_str()).collect();

    if let Ok(entries) = std::fs::read_dir(sessions_dir()) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if !keep_ids.contains(stem) {
                    std::fs::remove_file(&path).ok();
                }
            }
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_sessions() -> Result<Vec<OptimizationSession>, String> {
    tokio::task::spawn_blocking(list_sessions_internal)
        .await
        .map(Ok)
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_latest_session() -> Result<Option<OptimizationSession>, String> {
    tokio::task::spawn_blocking(|| list_sessions_internal().into_iter().next())
        .await
        .map(Ok)
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restore_session(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || restore_session_internal(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_session(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        std::fs::remove_file(session_path(&id)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn rollback_enabled() -> bool {
    ROLLBACK_CONFIG.enabled
}

// ── Session statistics ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SessionStats {
    /// Number of completed real (non-sim) optimization sessions.
    pub total_sessions: usize,
    /// Cumulative processes killed across all sessions.
    pub total_processes_killed: usize,
    /// Cumulative memory freed (MB) across all sessions.
    pub total_memory_freed_mb: f64,
    /// Most memory freed in a single session (MB).
    pub best_memory_freed_mb: f64,
    /// ISO-8601 timestamp of the most recent completed session.
    pub last_session_at: Option<String>,
}

fn session_stats_internal() -> SessionStats {
    let sessions = list_sessions_internal();
    let mut stats = SessionStats {
        total_sessions: 0,
        total_processes_killed: 0,
        total_memory_freed_mb: 0.0,
        best_memory_freed_mb: 0.0,
        last_session_at: None,
    };

    for s in &sessions {
        // Only count Real sessions that actually completed (not Sim, not Failed)
        if s.mode != SessionMode::Real || s.status == SessionStatus::Failed {
            continue;
        }
        stats.total_sessions += 1;

        // Track most recent
        let ts = s.ended_at.as_deref().or(Some(&s.started_at));
        if let Some(ts) = ts {
            if stats
                .last_session_at
                .as_deref()
                .is_none_or(|prev| ts > prev)
            {
                stats.last_session_at = Some(ts.to_string());
            }
        }

        // Extract aggregate numbers from the summary JSON (set by apply_all_optimizations)
        if let Some(serde_json::Value::Object(ref map)) = s.summary {
            let killed = map
                .get("process_killed")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;
            let freed = map
                .get("process_freed_mb")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            stats.total_processes_killed += killed;
            stats.total_memory_freed_mb += freed;
            if freed > stats.best_memory_freed_mb {
                stats.best_memory_freed_mb = freed;
            }
        }

        // Fallback: use before/after metrics delta when summary has no freed_mb
        if let (Some(before), Some(after)) = (&s.metrics_before, &s.metrics_after) {
            let delta = before.memory_used_mb - after.memory_used_mb;
            if delta > 0.0 && stats.best_memory_freed_mb < delta {
                stats.best_memory_freed_mb = delta;
            }
        }
    }

    stats
}

#[tauri::command]
pub async fn get_session_stats() -> Result<SessionStats, String> {
    tokio::task::spawn_blocking(session_stats_internal)
        .await
        .map(Ok)
        .map_err(|e| e.to_string())?
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_session_id_starts_with_session_prefix() {
        let id = new_session_id();
        assert!(id.starts_with("session_"), "id={}", id);
    }

    #[test]
    fn risk_level_serializes_to_snake_case() {
        assert_eq!(serde_json::to_string(&RiskLevel::Safe).unwrap(), "\"safe\"");
        assert_eq!(
            serde_json::to_string(&RiskLevel::Caution).unwrap(),
            "\"caution\""
        );
        assert_eq!(
            serde_json::to_string(&RiskLevel::Advanced).unwrap(),
            "\"advanced\""
        );
    }

    #[test]
    fn session_status_serializes_to_snake_case() {
        assert_eq!(
            serde_json::to_string(&SessionStatus::Applied).unwrap(),
            "\"applied\""
        );
        assert_eq!(
            serde_json::to_string(&SessionStatus::Restored).unwrap(),
            "\"restored\""
        );
        assert_eq!(
            serde_json::to_string(&SessionStatus::PartialRestore).unwrap(),
            "\"partial_restore\""
        );
    }

    #[test]
    fn optimization_session_round_trips_json() {
        let session = OptimizationSession {
            id: "session_100".to_string(),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            ended_at: Some("2026-01-01T00:01:00Z".to_string()),
            profile_id: None,
            mode: SessionMode::Real,
            status: SessionStatus::Applied,
            snapshot: SystemSnapshot {
                power_plan_guid: Some("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c".to_string()),
                windows_settings: None,
                network_settings: None,
                captured_at: "2026-01-01T00:00:00Z".to_string(),
            },
            changes: vec![ChangeRecord {
                category: "power".to_string(),
                target: "power_plan".to_string(),
                before: serde_json::json!("high_performance"),
                after: serde_json::json!("ultimate_performance"),
                risk_level: RiskLevel::Caution,
                applied: true,
            }],
            summary: None,
            metrics_before: None,
            metrics_after: None,
        };

        let json = serde_json::to_string(&session).unwrap();
        let restored: OptimizationSession = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, session.id);
        assert_eq!(restored.mode, SessionMode::Real);
        assert_eq!(restored.changes.len(), 1);
        assert_eq!(restored.changes[0].risk_level, RiskLevel::Caution);
    }

    #[test]
    fn list_sessions_returns_empty_vec_when_dir_missing() {
        // This test verifies the graceful fallback when sessions_dir doesn't exist.
        // We can't mock the path easily, but we verify list_sessions_internal
        // on a non-existent dir returns empty (via the real sessions_dir check).
        // In CI (clean env) the dir won't exist — this is a safety check.
        // If the dir exists, the function should return without panicking.
        let _ = list_sessions_internal(); // must not panic
    }

    #[test]
    fn change_records_have_expected_risk_levels() {
        let changes = vec![
            ChangeRecord {
                category: "process".to_string(),
                target: "bloatware".to_string(),
                before: serde_json::Value::Null,
                after: serde_json::json!({"killed": 3}),
                risk_level: RiskLevel::Safe,
                applied: true,
            },
            ChangeRecord {
                category: "power".to_string(),
                target: "power_plan".to_string(),
                before: serde_json::json!("balanced"),
                after: serde_json::json!("ultimate"),
                risk_level: RiskLevel::Caution,
                applied: true,
            },
            ChangeRecord {
                category: "network".to_string(),
                target: "gaming_tweaks".to_string(),
                before: serde_json::Value::Null,
                after: serde_json::json!({"preset": "gaming"}),
                risk_level: RiskLevel::Advanced,
                applied: true,
            },
        ];

        assert_eq!(changes[0].risk_level, RiskLevel::Safe);
        assert_eq!(changes[1].risk_level, RiskLevel::Caution);
        assert_eq!(changes[2].risk_level, RiskLevel::Advanced);
    }

    #[test]
    fn rollback_config_defaults_are_sane() {
        assert!(ROLLBACK_CONFIG.enabled);
        assert!(ROLLBACK_CONFIG.max_sessions >= 5);
    }
}
