/// ai_metrics.rs — 推奨エンジン V2 呼び出しメトリクス
///
/// DB: %APPDATA%/gaming-pc-optimizer/recommendation_metrics.db
/// テーブル: recommendation_metrics
///   id, model, success, latency_ms, fallback_used, created_at, created_epoch
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// ── DB helpers ────────────────────────────────────────────────────────────────

fn db_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("recommendation_metrics.db")
}

fn open_db() -> Result<Connection, String> {
    open_db_at(db_path())
}

fn open_db_at(path: PathBuf) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Dir create error: {}", e))?;
    }
    let conn =
        Connection::open(&path).map_err(|e| format!("DB open error: {}", e))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS recommendation_metrics (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            model         TEXT    NOT NULL,
            success       INTEGER NOT NULL,
            latency_ms    INTEGER NOT NULL,
            fallback_used INTEGER NOT NULL,
            created_at    TEXT    NOT NULL,
            created_epoch INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("DB init error: {}", e))?;
    Ok(conn)
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ── Write ─────────────────────────────────────────────────────────────────────

/// AI 呼び出し1件を記録する。
pub fn record(
    model: &str,
    success: bool,
    latency_ms: u64,
    fallback_used: bool,
) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "INSERT INTO recommendation_metrics
             (model, success, latency_ms, fallback_used, created_at, created_epoch)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            model,
            success as i64,
            latency_ms as i64,
            fallback_used as i64,
            super::now_iso8601(),
            now_epoch() as i64,
        ],
    )
    .map_err(|e| format!("DB insert error: {}", e))?;
    Ok(())
}

// ── Read ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMetrics {
    pub model: String,
    pub total_calls: i64,
    pub successes: i64,
    pub failures: i64,
    pub fallbacks: i64,
    pub avg_latency_ms: f64,
    pub success_rate: f64,
    pub fallback_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsSummary {
    pub range_hours: u32,
    pub models: Vec<ModelMetrics>,
}

/// 指定した時間範囲内のメトリクスをモデル別に集計する。
pub fn get_summary(range_hours: u32) -> Result<MetricsSummary, String> {
    let conn = open_db()?;
    let cutoff = now_epoch().saturating_sub(range_hours as u64 * 3600) as i64;

    let mut stmt = conn
        .prepare(
            "SELECT model, success, latency_ms, fallback_used
             FROM recommendation_metrics
             WHERE created_epoch >= ?1
             ORDER BY id DESC
             LIMIT 50000",
        )
        .map_err(|e| e.to_string())?;

    // aggregate per model: (total, successes, failures, fallbacks, total_latency)
    let mut map: std::collections::HashMap<String, (i64, i64, i64, i64, i64)> =
        std::collections::HashMap::new();

    let rows = stmt
        .query_map(params![cutoff], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (model, success, latency_ms, fallback_used) = row.map_err(|e| e.to_string())?;
        let e = map.entry(model).or_insert((0, 0, 0, 0, 0));
        e.0 += 1;
        if success == 1 {
            e.1 += 1;
        } else {
            e.2 += 1;
        }
        if fallback_used == 1 {
            e.3 += 1;
        }
        e.4 += latency_ms;
    }

    let models: Vec<ModelMetrics> = map
        .into_iter()
        .map(|(model, (total, succ, fail, fb, lat))| ModelMetrics {
            model,
            total_calls: total,
            successes: succ,
            failures: fail,
            fallbacks: fb,
            avg_latency_ms: if total > 0 {
                lat as f64 / total as f64
            } else {
                0.0
            },
            success_rate: if total > 0 {
                succ as f64 / total as f64
            } else {
                0.0
            },
            fallback_rate: if total > 0 {
                fb as f64 / total as f64
            } else {
                0.0
            },
        })
        .collect();

    Ok(MetricsSummary { range_hours, models })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn in_memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recommendation_metrics (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                model         TEXT    NOT NULL,
                success       INTEGER NOT NULL,
                latency_ms    INTEGER NOT NULL,
                fallback_used INTEGER NOT NULL,
                created_at    TEXT    NOT NULL,
                created_epoch INTEGER NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn record_to(
        conn: &Connection,
        model: &str,
        success: bool,
        latency_ms: u64,
        fallback_used: bool,
    ) {
        conn.execute(
            "INSERT INTO recommendation_metrics
                 (model, success, latency_ms, fallback_used, created_at, created_epoch)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                model,
                success as i64,
                latency_ms as i64,
                fallback_used as i64,
                "2026-01-01T00:00:00Z",
                now_epoch() as i64,
            ],
        )
        .unwrap();
    }

    fn get_summary_from(conn: &Connection, range_hours: u32) -> MetricsSummary {
        let cutoff = now_epoch().saturating_sub(range_hours as u64 * 3600) as i64;
        let mut stmt = conn
            .prepare(
                "SELECT model, success, latency_ms, fallback_used
                 FROM recommendation_metrics
                 WHERE created_epoch >= ?1
                 ORDER BY id DESC LIMIT 50000",
            )
            .unwrap();

        let mut map: std::collections::HashMap<String, (i64, i64, i64, i64, i64)> =
            std::collections::HashMap::new();
        let rows = stmt
            .query_map(params![cutoff], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .unwrap();
        for row in rows {
            let (model, success, latency_ms, fallback_used) = row.unwrap();
            let e = map.entry(model).or_insert((0, 0, 0, 0, 0));
            e.0 += 1;
            if success == 1 { e.1 += 1; } else { e.2 += 1; }
            if fallback_used == 1 { e.3 += 1; }
            e.4 += latency_ms;
        }
        let models: Vec<ModelMetrics> = map
            .into_iter()
            .map(|(model, (total, succ, fail, fb, lat))| ModelMetrics {
                model, total_calls: total, successes: succ, failures: fail, fallbacks: fb,
                avg_latency_ms: if total > 0 { lat as f64 / total as f64 } else { 0.0 },
                success_rate: if total > 0 { succ as f64 / total as f64 } else { 0.0 },
                fallback_rate: if total > 0 { fb as f64 / total as f64 } else { 0.0 },
            })
            .collect();
        MetricsSummary { range_hours, models }
    }

    #[test]
    fn empty_db_returns_empty_summary() {
        let conn = in_memory_conn();
        let summary = get_summary_from(&conn, 24);
        assert!(summary.models.is_empty());
    }

    #[test]
    fn records_aggregate_correctly() {
        let conn = in_memory_conn();
        record_to(&conn, "claude-haiku", true, 300, false);
        record_to(&conn, "claude-haiku", true, 500, false);
        record_to(&conn, "claude-haiku", false, 1000, true);

        let summary = get_summary_from(&conn, 24);
        let m = summary.models.iter().find(|m| m.model == "claude-haiku").unwrap();

        assert_eq!(m.total_calls, 3);
        assert_eq!(m.successes, 2);
        assert_eq!(m.failures, 1);
        assert_eq!(m.fallbacks, 1);
        assert!((m.avg_latency_ms - 600.0).abs() < 1.0);
        assert!((m.success_rate - 2.0 / 3.0).abs() < 0.01);
    }

    #[test]
    fn multiple_models_tracked_separately() {
        let conn = in_memory_conn();
        record_to(&conn, "claude-haiku", true, 200, false);
        record_to(&conn, "rule_based_v1", true, 1, true);

        let summary = get_summary_from(&conn, 24);
        assert_eq!(summary.models.len(), 2);
        let haiku = summary.models.iter().find(|m| m.model == "claude-haiku").unwrap();
        let rule = summary.models.iter().find(|m| m.model == "rule_based_v1").unwrap();
        assert_eq!(haiku.fallback_rate, 0.0);
        assert_eq!(rule.fallback_rate, 1.0);
    }

    #[test]
    fn now_epoch_is_recent() {
        let epoch = now_epoch();
        // 2026-01-01 = ~1767225600 seconds since UNIX epoch
        assert!(epoch > 1_700_000_000, "epoch should be after 2023");
    }
}
