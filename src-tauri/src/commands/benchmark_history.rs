/// benchmark_history.rs — ベンチマーク履歴永続化 (ENABLE_BENCHMARK_HISTORY)
///
/// 実行結果を SQLite に保存し、時系列での性能推移を追跡できるようにする。
///
/// DB: %APPDATA%/gaming-pc-optimizer/benchmark_history.db
/// Feature flag: ENABLE_BENCHMARK_HISTORY = false
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Feature flag ──────────────────────────────────────────────────────────────

pub const ENABLE_BENCHMARK_HISTORY: bool = true;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRecord {
    pub id: i64,
    pub run_at: i64, // Unix epoch seconds
    pub cpu_score: i64,
    pub memory_score: i64,
    pub disk_score: i64,
    pub total_score: i64,
    pub cpu_ms: i64,
    pub memory_ms: i64,
    pub disk_ms: i64,
}

// ── DB helpers ────────────────────────────────────────────────────────────────

fn db_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("benchmark_history.db")
}

fn open_db() -> Result<Connection, String> {
    open_db_at(db_path())
}

fn open_db_at(path: PathBuf) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Dir create error: {}", e))?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("DB open error: {}", e))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS benchmark_runs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            run_at       INTEGER NOT NULL,
            cpu_score    INTEGER NOT NULL,
            memory_score INTEGER NOT NULL,
            disk_score   INTEGER NOT NULL,
            total_score  INTEGER NOT NULL,
            cpu_ms       INTEGER NOT NULL,
            memory_ms    INTEGER NOT NULL,
            disk_ms      INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("DB init error: {}", e))?;
    Ok(conn)
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// ベンチマーク結果を永続化する。
/// ENABLE_BENCHMARK_HISTORY = false の場合はエラーを返す。
#[tauri::command]
pub async fn save_benchmark_result(
    cpu_score: i64,
    memory_score: i64,
    disk_score: i64,
    total_score: i64,
    cpu_ms: i64,
    memory_ms: i64,
    disk_ms: i64,
) -> Result<BenchmarkRecord, String> {
    if !ENABLE_BENCHMARK_HISTORY {
        return Err(
            "ENABLE_BENCHMARK_HISTORY is disabled. Set it to true in benchmark_history.rs."
                .to_string(),
        );
    }
    let run_at = now_epoch();
    let conn = open_db()?;
    conn.execute(
        "INSERT INTO benchmark_runs
             (run_at, cpu_score, memory_score, disk_score, total_score, cpu_ms, memory_ms, disk_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            run_at,
            cpu_score,
            memory_score,
            disk_score,
            total_score,
            cpu_ms,
            memory_ms,
            disk_ms,
        ],
    )
    .map_err(|e| format!("DB insert error: {}", e))?;
    let id = conn.last_insert_rowid();
    Ok(BenchmarkRecord {
        id,
        run_at,
        cpu_score,
        memory_score,
        disk_score,
        total_score,
        cpu_ms,
        memory_ms,
        disk_ms,
    })
}

/// 直近 50 件のベンチマーク履歴を新しい順で返す。
/// ENABLE_BENCHMARK_HISTORY = false の場合は空リストを返す（エラーにしない）。
#[tauri::command]
pub async fn get_benchmark_history() -> Result<Vec<BenchmarkRecord>, String> {
    if !ENABLE_BENCHMARK_HISTORY {
        return Ok(vec![]);
    }
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, run_at, cpu_score, memory_score, disk_score,
                    total_score, cpu_ms, memory_ms, disk_ms
             FROM benchmark_runs
             ORDER BY run_at DESC
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let records = stmt
        .query_map([], |row| {
            Ok(BenchmarkRecord {
                id: row.get(0)?,
                run_at: row.get(1)?,
                cpu_score: row.get(2)?,
                memory_score: row.get(3)?,
                disk_score: row.get(4)?,
                total_score: row.get(5)?,
                cpu_ms: row.get(6)?,
                memory_ms: row.get(7)?,
                disk_ms: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(records)
}

/// ベンチマーク履歴を全削除する。
#[tauri::command]
pub async fn clear_benchmark_history() -> Result<u32, String> {
    if !ENABLE_BENCHMARK_HISTORY {
        return Ok(0);
    }
    let conn = open_db()?;
    let deleted = conn
        .execute("DELETE FROM benchmark_runs", [])
        .map_err(|e| format!("DB delete error: {}", e))?;
    Ok(deleted as u32)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE benchmark_runs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                run_at       INTEGER NOT NULL,
                cpu_score    INTEGER NOT NULL,
                memory_score INTEGER NOT NULL,
                disk_score   INTEGER NOT NULL,
                total_score  INTEGER NOT NULL,
                cpu_ms       INTEGER NOT NULL,
                memory_ms    INTEGER NOT NULL,
                disk_ms      INTEGER NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn insert(conn: &Connection, total: i64, run_at: i64) -> i64 {
        conn.execute(
            "INSERT INTO benchmark_runs
                 (run_at, cpu_score, memory_score, disk_score, total_score,
                  cpu_ms, memory_ms, disk_ms)
             VALUES (?1, 500, 300, 200, ?2, 100, 50, 80)",
            params![run_at, total],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn fetch_all(conn: &Connection) -> Vec<BenchmarkRecord> {
        let mut stmt = conn
            .prepare(
                "SELECT id, run_at, cpu_score, memory_score, disk_score,
                        total_score, cpu_ms, memory_ms, disk_ms
                 FROM benchmark_runs ORDER BY run_at DESC LIMIT 50",
            )
            .unwrap();
        stmt.query_map([], |row| {
            Ok(BenchmarkRecord {
                id: row.get(0)?,
                run_at: row.get(1)?,
                cpu_score: row.get(2)?,
                memory_score: row.get(3)?,
                disk_score: row.get(4)?,
                total_score: row.get(5)?,
                cpu_ms: row.get(6)?,
                memory_ms: row.get(7)?,
                disk_ms: row.get(8)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    #[test]
    fn flag_is_enabled_for_v2() {
        assert!(ENABLE_BENCHMARK_HISTORY);
    }

    #[test]
    fn insert_and_fetch_returns_record() {
        let conn = in_memory();
        let id = insert(&conn, 1200, now_epoch());
        let records = fetch_all(&conn);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, id);
        assert_eq!(records[0].total_score, 1200);
    }

    #[test]
    fn records_are_ordered_newest_first() {
        let conn = in_memory();
        insert(&conn, 1000, 1000);
        insert(&conn, 1500, 2000);
        insert(&conn, 800, 1500);
        let records = fetch_all(&conn);
        // ordered by run_at DESC: 2000, 1500, 1000
        assert_eq!(records[0].total_score, 1500);
        assert_eq!(records[1].total_score, 800);
        assert_eq!(records[2].total_score, 1000);
    }

    #[test]
    fn delete_clears_all_rows() {
        let conn = in_memory();
        insert(&conn, 1000, now_epoch());
        insert(&conn, 1200, now_epoch());
        conn.execute("DELETE FROM benchmark_runs", []).unwrap();
        let records = fetch_all(&conn);
        assert!(records.is_empty());
    }

    #[test]
    fn sub_scores_stored_correctly() {
        let conn = in_memory();
        conn.execute(
            "INSERT INTO benchmark_runs
                 (run_at, cpu_score, memory_score, disk_score, total_score,
                  cpu_ms, memory_ms, disk_ms)
             VALUES (9999, 700, 400, 250, 1350, 150, 60, 90)",
            [],
        )
        .unwrap();
        let records = fetch_all(&conn);
        assert_eq!(records[0].cpu_score, 700);
        assert_eq!(records[0].memory_score, 400);
        assert_eq!(records[0].disk_score, 250);
        assert_eq!(records[0].cpu_ms, 150);
    }

    #[test]
    fn now_epoch_is_reasonable() {
        // 2026-01-01 = ~1767225600
        assert!(now_epoch() > 1_700_000_000);
    }

    #[test]
    fn benchmark_record_serializes_camel_case() {
        let rec = BenchmarkRecord {
            id: 1,
            run_at: 1767225600,
            cpu_score: 700,
            memory_score: 400,
            disk_score: 250,
            total_score: 1350,
            cpu_ms: 150,
            memory_ms: 60,
            disk_ms: 90,
        };
        let json = serde_json::to_value(&rec).unwrap();
        assert!(json.get("runAt").is_some());
        assert!(json.get("totalScore").is_some());
        assert!(json.get("cpuMs").is_some());
        assert_eq!(json["totalScore"], 1350);
    }
}
