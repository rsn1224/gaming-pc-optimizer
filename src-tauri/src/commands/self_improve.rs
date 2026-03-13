use super::obs_log_path;

/// Export the last `limit` observations as a JSON context string,
/// ready to paste into Claude for self-improvement suggestions.
#[tauri::command]
pub fn export_self_improve_context(limit: usize) -> Result<String, String> {
    let raw = std::fs::read_to_string(obs_log_path()).unwrap_or_default();
    let lines: Vec<&str> = raw.lines().collect();
    let take_from = if lines.len() > limit {
        lines.len() - limit
    } else {
        0
    };
    let recent: Vec<serde_json::Value> = lines[take_from..]
        .iter()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();

    let ctx = serde_json::json!({
        "observations": recent,
        "count": recent.len(),
        "prompt": "これはユーザーのPC最適化行動ログです。パターンを分析して、このユーザーの使い方をより効率的にするための改善提案を日本語で3点挙げてください。"
    });
    serde_json::to_string_pretty(&ctx).map_err(|e| e.to_string())
}
