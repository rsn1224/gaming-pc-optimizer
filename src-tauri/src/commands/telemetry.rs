use super::now_iso8601;
/// telemetry.rs — テレメトリ・ループ基盤 (Sprint 1 / S1-02)
///
/// 最適化の前後 (T0/T1/T2) に SystemMetrics + OptimizationScore を SQLite に記録する。
/// DB ファイル: %APPDATA%/gaming-pc-optimizer/telemetry.db
/// テーブル: telemetry (session_id, phase, scores, memory, cpu...)
///
/// Feature flag: ENABLE_TELEMETRY = false (Sprint 1 では off)
///   true になるとapply_all_optimizations が T0 キャプチャを実行し、
///   30 秒後に T1 キャプチャをバックグラウンドで実行する。
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

// ── Feature flag ──────────────────────────────────────────────────────────────
pub const ENABLE_TELEMETRY: bool = true;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TelemetryPhase {
    Before,
    T1_30s,
    T2_5min,
}

impl TelemetryPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            TelemetryPhase::Before => "before",
            TelemetryPhase::T1_30s => "t1_30s",
            TelemetryPhase::T2_5min => "t2_5min",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "before" => TelemetryPhase::Before,
            "t1_30s" => TelemetryPhase::T1_30s,
            _ => TelemetryPhase::T2_5min,
        }
    }
}

/// 1 フェーズぶんのテレメトリ記録
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryRecord {
    pub id: Option<i64>,
    pub session_id: String,
    pub phase: TelemetryPhase,
    pub timestamp: String,
    pub score_overall: u8,
    pub score_process: u8,
    pub score_power: u8,
    pub score_windows: u8,
    pub score_network: u8,
    pub memory_used_mb: f64,
    pub memory_percent: f64,
    pub cpu_usage: f64,
    pub process_count: usize,
}

// ── Database ──────────────────────────────────────────────────────────────────

fn db_path() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("telemetry.db")
}

pub fn open_db() -> rusqlite::Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS telemetry (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT    NOT NULL,
            phase           TEXT    NOT NULL,
            timestamp       TEXT    NOT NULL,
            score_overall   INTEGER NOT NULL DEFAULT 0,
            score_process   INTEGER NOT NULL DEFAULT 0,
            score_power     INTEGER NOT NULL DEFAULT 0,
            score_windows   INTEGER NOT NULL DEFAULT 0,
            score_network   INTEGER NOT NULL DEFAULT 0,
            memory_used_mb  REAL    NOT NULL DEFAULT 0,
            memory_percent  REAL    NOT NULL DEFAULT 0,
            cpu_usage       REAL    NOT NULL DEFAULT 0,
            process_count   INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_telemetry_session
            ON telemetry (session_id);",
    )?;
    Ok(conn)
}

// ── Write ─────────────────────────────────────────────────────────────────────

pub fn insert_record(rec: &TelemetryRecord) -> Result<i64, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO telemetry (
            session_id, phase, timestamp,
            score_overall, score_process, score_power, score_windows, score_network,
            memory_used_mb, memory_percent, cpu_usage, process_count
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![
            rec.session_id,
            rec.phase.as_str(),
            rec.timestamp,
            rec.score_overall as i32,
            rec.score_process as i32,
            rec.score_power as i32,
            rec.score_windows as i32,
            rec.score_network as i32,
            rec.memory_used_mb,
            rec.memory_percent,
            rec.cpu_usage,
            rec.process_count as i32,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

// ── Read ──────────────────────────────────────────────────────────────────────

pub fn get_records_for_session(session_id: &str) -> Result<Vec<TelemetryRecord>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, phase, timestamp,
                    score_overall, score_process, score_power, score_windows, score_network,
                    memory_used_mb, memory_percent, cpu_usage, process_count
             FROM telemetry
             WHERE session_id = ?1
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            let phase_str: String = row.get(2)?;
            Ok(TelemetryRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                phase: TelemetryPhase::from_str(&phase_str),
                timestamp: row.get(3)?,
                score_overall: row.get::<_, i32>(4)? as u8,
                score_process: row.get::<_, i32>(5)? as u8,
                score_power: row.get::<_, i32>(6)? as u8,
                score_windows: row.get::<_, i32>(7)? as u8,
                score_network: row.get::<_, i32>(8)? as u8,
                memory_used_mb: row.get(9)?,
                memory_percent: row.get(10)?,
                cpu_usage: row.get(11)?,
                process_count: row.get::<_, i32>(12)? as usize,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

// ── Capture helper (called by optimizer when flag is on) ──────────────────────

/// システム状態とスコアを取得して DB に記録する。
/// ENABLE_TELEMETRY が false の場合は何もしない (no-op)。
pub fn capture_and_insert(
    session_id: &str,
    phase: TelemetryPhase,
) -> Result<TelemetryRecord, String> {
    let sys_metrics = super::metrics::capture_metrics();
    let score = super::optimizer::compute_optimization_score();

    let rec = TelemetryRecord {
        id: None,
        session_id: session_id.to_string(),
        phase,
        timestamp: now_iso8601(),
        score_overall: score.overall,
        score_process: score.process,
        score_power: score.power,
        score_windows: score.windows,
        score_network: score.network,
        memory_used_mb: sys_metrics.memory_used_mb,
        memory_percent: sys_metrics.memory_percent,
        cpu_usage: 0.0, // sysinfo CPU は別途 refresh が必要なため 0 で初期化
        process_count: sys_metrics.process_count,
    };
    insert_record(&rec)?;
    Ok(rec)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_telemetry_for_session(session_id: String) -> Result<Vec<TelemetryRecord>, String> {
    tokio::task::spawn_blocking(move || get_records_for_session(&session_id))
        .await
        .map_err(|e| e.to_string())?
}
