use serde::{Deserialize, Serialize};
use sysinfo::System;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Point-in-time performance snapshot used for Before/After comparison.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionMetrics {
    pub process_count: usize,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub memory_percent: f64,
    pub captured_at: String,
}

impl SessionMetrics {
    #[allow(dead_code)]
    pub fn delta_from(&self, before: &SessionMetrics) -> MetricsDelta {
        MetricsDelta {
            process_count_delta: self.process_count as i64 - before.process_count as i64,
            memory_freed_mb: before.memory_used_mb - self.memory_used_mb,
            memory_percent_delta: self.memory_percent - before.memory_percent,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct MetricsDelta {
    pub process_count_delta: i64,
    pub memory_freed_mb: f64,
    pub memory_percent_delta: f64,
}

// ── Capture ───────────────────────────────────────────────────────────────────

pub(crate) fn capture_metrics() -> SessionMetrics {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total = sys.total_memory() as f64 / 1024.0 / 1024.0;
    let used = sys.used_memory() as f64 / 1024.0 / 1024.0;
    let pct = if total > 0.0 {
        (used / total) * 100.0
    } else {
        0.0
    };

    SessionMetrics {
        process_count: sys.processes().len(),
        memory_used_mb: used,
        memory_total_mb: total,
        memory_percent: pct,
        captured_at: super::now_iso8601(),
    }
}

// ── Tauri command ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_current_metrics() -> SessionMetrics {
    tokio::task::spawn_blocking(capture_metrics)
        .await
        .unwrap_or_default()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_metrics_default_is_zeroed() {
        let m = SessionMetrics::default();
        assert_eq!(m.process_count, 0);
        assert_eq!(m.memory_used_mb, 0.0);
        assert_eq!(m.memory_percent, 0.0);
    }

    #[test]
    fn delta_from_computes_freed_memory() {
        let before = SessionMetrics {
            process_count: 200,
            memory_used_mb: 8192.0,
            memory_total_mb: 16384.0,
            memory_percent: 50.0,
            captured_at: String::new(),
        };
        let after = SessionMetrics {
            process_count: 150,
            memory_used_mb: 6144.0,
            memory_total_mb: 16384.0,
            memory_percent: 37.5,
            captured_at: String::new(),
        };
        let delta = after.delta_from(&before);
        assert_eq!(delta.process_count_delta, -50);
        assert!((delta.memory_freed_mb - 2048.0).abs() < 0.01);
    }

    #[test]
    fn delta_from_negative_freed_when_memory_increases() {
        let before = SessionMetrics {
            memory_used_mb: 4096.0,
            ..SessionMetrics::default()
        };
        let after = SessionMetrics {
            memory_used_mb: 5000.0,
            ..SessionMetrics::default()
        };
        let delta = after.delta_from(&before);
        assert!(delta.memory_freed_mb < 0.0, "freed should be negative");
    }
}
