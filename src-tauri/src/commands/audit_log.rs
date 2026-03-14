use super::now_iso8601;
/// audit_log.rs — 監査ログ (Sprint 1 / S1-01)
///
/// すべての自動アクション (user / policy_engine / safety_kernel / watcher) を
/// JSON ファイルに追記する。最大 500 件のローリング・ウィンドウを維持する。
use serde::{Deserialize, Serialize};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuditActor {
    User,
    PolicyEngine,
    SafetyKernel,
    Watcher,
}

/// 監査ログの1エントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub timestamp: String,
    pub actor: AuditActor,
    /// 実行したアクションの識別子 (例: "apply_all_optimizations", "kill_process")
    pub action: String,
    /// "success" | "failure" | "skipped"
    pub result: String,
    /// アクション固有の詳細 (JSON)
    pub detail: serde_json::Value,
    /// 関連する rollback session ID (任意)
    pub session_id: Option<String>,
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn audit_log_path() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("audit_log.json")
}

fn load_internal() -> Vec<AuditLogEntry> {
    let path = audit_log_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_internal(log: &[AuditLogEntry]) {
    let path = audit_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Ok(json) = serde_json::to_string_pretty(log) {
        std::fs::write(&path, json).ok();
    }
}

// ── Public API (called from other modules) ────────────────────────────────────

/// 監査エントリを追加する（ローリング 500 件）
pub fn add_audit_entry(
    actor: AuditActor,
    action: &str,
    result: &str,
    detail: serde_json::Value,
    session_id: Option<String>,
) {
    let entry = AuditLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: now_iso8601(),
        actor,
        action: action.to_string(),
        result: result.to_string(),
        detail,
        session_id,
    };
    let mut log = load_internal();
    log.push(entry);
    // Rolling window: keep last 500 entries
    if log.len() > 500 {
        log.drain(0..log.len() - 500);
    }
    save_internal(&log);
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_audit_log() -> Vec<AuditLogEntry> {
    load_internal()
}

#[tauri::command]
pub fn clear_audit_log() -> Result<(), String> {
    save_internal(&[]);
    Ok(())
}
