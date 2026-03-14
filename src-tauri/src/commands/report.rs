use std::time::{SystemTime, UNIX_EPOCH};

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn format_timestamp(secs: u64) -> String {
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let days = (secs / 86400) as u32;
    let (year, month, day) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
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

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn collect_system_info() -> super::system_info::SystemInfo {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage =
        sys.cpus().iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / sys.cpus().len().max(1) as f32;

    let cpu_name = sys
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let memory_total_mb = sys.total_memory() as f64 / 1024.0 / 1024.0;
    let memory_used_mb = sys.used_memory() as f64 / 1024.0 / 1024.0;
    let memory_percent = if sys.total_memory() > 0 {
        (sys.used_memory() as f32 / sys.total_memory() as f32) * 100.0
    } else {
        0.0
    };

    super::system_info::SystemInfo {
        cpu_usage,
        cpu_name,
        cpu_cores: sys.cpus().len(),
        memory_total_mb,
        memory_used_mb,
        memory_percent,
        os_name: System::name().unwrap_or_else(|| "Windows".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
    }
}

#[tauri::command]
pub async fn generate_performance_report() -> Result<String, String> {
    // Collect all data using blocking tasks
    let score = tokio::task::spawn_blocking(super::optimizer::compute_optimization_score)
        .await
        .map_err(|e| e.to_string())?;

    let score_history = tokio::task::spawn_blocking(super::optimizer::get_score_history)
        .await
        .map_err(|e| e.to_string())?;

    let game_sessions = tokio::task::spawn_blocking(super::game_log::get_game_log)
        .await
        .map_err(|e| e.to_string())?;

    let event_log = tokio::task::spawn_blocking(super::event_log::get_event_log)
        .await
        .map_err(|e| e.to_string())?;

    let sys_info = tokio::task::spawn_blocking(collect_system_info)
        .await
        .map_err(|e| e.to_string())?;

    // Benchmark results (optional)
    let benchmark_json: Option<serde_json::Value> = {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        let bench_path = std::path::PathBuf::from(appdata)
            .join("gaming-pc-optimizer")
            .join("benchmark_last.json");
        if bench_path.exists() {
            std::fs::read_to_string(&bench_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
        } else {
            None
        }
    };

    // Take last 10 score history entries (history is oldest-first, so rev then take 10)
    let history_last10: Vec<_> = score_history.iter().rev().take(10).collect();
    // Last 10 game sessions (sessions are newest-first)
    let sessions_last10: Vec<_> = game_sessions.iter().take(10).collect();
    // Last 20 event log entries (event log is newest-first)
    let events_last20: Vec<_> = event_log.iter().take(20).collect();

    let generated_at = format_timestamp(now_secs());

    let score_badge = if score.overall >= 80 { "good" } else { "warn" };

    // Build score history rows
    let score_history_rows: String = history_last10
        .iter()
        .map(|s| {
            format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape_html(&format_timestamp(s.timestamp)),
                s.overall,
                s.process,
                s.power,
                s.windows,
                s.network
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Build game session rows
    let session_rows: String = sessions_last10
        .iter()
        .map(|s| {
            let started = format_timestamp(s.started_at);
            let duration = s
                .duration_minutes
                .map(|m| format!("{}分", m))
                .unwrap_or_else(|| "-".to_string());
            let score_b = s
                .score_before
                .map(|v| v.to_string())
                .unwrap_or_else(|| "-".to_string());
            let score_a = s
                .score_after
                .map(|v| v.to_string())
                .unwrap_or_else(|| "-".to_string());
            format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{:.1} MB</td></tr>",
                escape_html(&s.game_name),
                escape_html(&started),
                escape_html(&duration),
                escape_html(&score_b),
                escape_html(&score_a),
                s.memory_freed_mb
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Build event log rows
    let event_rows: String = events_last20
        .iter()
        .map(|e| {
            let ts = format_timestamp(e.timestamp);
            format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape_html(&ts),
                escape_html(&e.event_type),
                escape_html(&e.title),
                escape_html(&e.detail)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Benchmark section
    let benchmark_section = if let Some(bench) = benchmark_json {
        format!(
            r#"<h2>ベンチマーク結果</h2>
<table>
  <tr><th>項目</th><th>スコア</th><th>時間 (ms)</th></tr>
  <tr><td>CPU</td><td>{}</td><td>{}</td></tr>
  <tr><td>メモリ</td><td>{}</td><td>{}</td></tr>
  <tr><td>ディスク</td><td>{}</td><td>{}</td></tr>
  <tr><td><strong>総合</strong></td><td><strong>{}</strong></td><td>-</td></tr>
</table>"#,
            bench["cpu_score"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
            bench["cpu_ms"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
            bench["memory_score"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
            bench["memory_ms"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
            bench["disk_score"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
            bench["disk_ms"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
            bench["total_score"]
                .as_f64()
                .map(|v| format!("{:.0}", v))
                .unwrap_or_else(|| "-".to_string()),
        )
    } else {
        "<h2>ベンチマーク結果</h2><p style=\"color:#64748b\">ベンチマークデータはありません。ベンチマークページから実行してください。</p>".to_string()
    };

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Gaming PC Optimizer - パフォーマンスレポート</title>
  <style>
    body {{ background: #0f1117; color: #e2e8f0; font-family: sans-serif; padding: 2rem; }}
    h1 {{ color: #22d3ee; border-bottom: 1px solid #22d3ee33; padding-bottom: 0.5rem; }}
    h2 {{ color: #94a3b8; margin-top: 2rem; }}
    table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; }}
    th {{ background: #1e293b; color: #94a3b8; padding: 0.5rem; text-align: left; }}
    td {{ padding: 0.5rem; border-bottom: 1px solid #1e293b; }}
    .score {{ font-size: 2rem; font-weight: bold; color: #22d3ee; }}
    .badge {{ display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }}
    .good {{ background: #064e3b; color: #34d399; }}
    .warn {{ background: #451a03; color: #f97316; }}
    .meta {{ color: #64748b; font-size: 0.85rem; margin-bottom: 1rem; }}
    .score-grid {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin: 1rem 0; }}
    .score-card {{ background: #1e293b; border-radius: 8px; padding: 1rem; text-align: center; }}
    .score-card .label {{ color: #94a3b8; font-size: 0.75rem; margin-bottom: 0.5rem; }}
    .score-card .value {{ color: #22d3ee; font-size: 1.5rem; font-weight: bold; }}
  </style>
</head>
<body>
  <h1>Gaming PC Optimizer - パフォーマンスレポート</h1>
  <p class="meta">生成日時: {generated_at}</p>

  <h2>システム情報</h2>
  <table>
    <tr><th>項目</th><th>値</th></tr>
    <tr><td>CPU</td><td>{cpu_name}</td></tr>
    <tr><td>コア数</td><td>{cpu_cores}</td></tr>
    <tr><td>メモリ (合計)</td><td>{memory_total_mb:.0} MB</td></tr>
    <tr><td>メモリ (使用中)</td><td>{memory_used_mb:.0} MB ({memory_percent:.1}%)</td></tr>
    <tr><td>OS</td><td>{os_name} {os_version}</td></tr>
  </table>

  <h2>最適化スコア</h2>
  <p>総合スコア: <span class="score">{overall}</span> <span class="badge {score_badge}">{score_label}</span></p>
  <div class="score-grid">
    <div class="score-card"><div class="label">プロセス</div><div class="value">{process}</div></div>
    <div class="score-card"><div class="label">電源プラン</div><div class="value">{power}</div></div>
    <div class="score-card"><div class="label">Windows</div><div class="value">{windows}</div></div>
    <div class="score-card"><div class="label">ネットワーク</div><div class="value">{network}</div></div>
    <div class="score-card"><div class="label">ブロートウェア</div><div class="value">{bloatware}</div></div>
  </div>

  <h2>スコア履歴 (直近10件)</h2>
  {score_history_section}

  <h2>ゲームセッション履歴 (直近10件)</h2>
  {session_section}

  <h2>イベントログ (直近20件)</h2>
  {event_section}

  {benchmark_section}
</body>
</html>"#,
        generated_at = generated_at,
        cpu_name = escape_html(&sys_info.cpu_name),
        cpu_cores = sys_info.cpu_cores,
        memory_total_mb = sys_info.memory_total_mb,
        memory_used_mb = sys_info.memory_used_mb,
        memory_percent = sys_info.memory_percent,
        os_name = escape_html(&sys_info.os_name),
        os_version = escape_html(&sys_info.os_version),
        overall = score.overall,
        score_badge = score_badge,
        score_label = if score.overall >= 80 {
            "最適化済み"
        } else {
            "要改善"
        },
        process = score.process,
        power = score.power,
        windows = score.windows,
        network = score.network,
        bloatware = score.bloatware_running,
        score_history_section = if history_last10.is_empty() {
            "<p style=\"color:#64748b\">スコア履歴はありません。最適化を実行すると記録されます。</p>"
                .to_string()
        } else {
            format!(
                "<table><tr><th>日時</th><th>総合</th><th>プロセス</th><th>電源</th><th>Windows</th><th>ネットワーク</th></tr>{}</table>",
                score_history_rows
            )
        },
        session_section = if sessions_last10.is_empty() {
            "<p style=\"color:#64748b\">ゲームセッション履歴はありません。プロファイルからゲームを起動すると記録されます。</p>"
                .to_string()
        } else {
            format!(
                "<table><tr><th>ゲーム</th><th>開始日時</th><th>プレイ時間</th><th>スコア (前)</th><th>スコア (後)</th><th>解放メモリ</th></tr>{}</table>",
                session_rows
            )
        },
        event_section = if events_last20.is_empty() {
            "<p style=\"color:#64748b\">イベントログはありません。</p>".to_string()
        } else {
            format!(
                "<table><tr><th>日時</th><th>種類</th><th>タイトル</th><th>詳細</th></tr>{}</table>",
                event_rows
            )
        },
        benchmark_section = benchmark_section,
    );

    Ok(html)
}
