use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AllOptimizationResult {
    pub process_killed: usize,
    pub process_freed_mb: f64,
    pub power_plan_set: bool,
    pub windows_applied: bool,
    pub network_applied: bool,
    pub errors: Vec<String>,
}

/// One-shot command: kill bloatware → Ultimate Performance → gaming Windows
/// settings → gaming network tweaks. Each step is attempted independently
/// so a failure in one does not abort the rest.
#[tauri::command]
pub async fn apply_all_optimizations() -> Result<AllOptimizationResult, String> {
    let mut result = AllOptimizationResult {
        process_killed: 0,
        process_freed_mb: 0.0,
        power_plan_set: false,
        windows_applied: false,
        network_applied: false,
        errors: Vec::new(),
    };

    // 1. Kill all known bloatware
    match super::process::kill_bloatware(None).await {
        Ok(r) => {
            result.process_killed = r.killed.len();
            result.process_freed_mb = r.freed_memory_mb;
        }
        Err(e) => result.errors.push(format!("プロセス停止: {}", e)),
    }

    // 2. Switch to Ultimate Performance power plan
    match super::power::set_ultimate_performance().await {
        Ok(_) => result.power_plan_set = true,
        Err(e) => result.errors.push(format!("電源プラン: {}", e)),
    }

    // 3. Apply gaming Windows settings (sync fn → spawn_blocking)
    match tokio::task::spawn_blocking(super::windows_settings::apply_gaming_windows_settings).await {
        Ok(Ok(_)) => result.windows_applied = true,
        Ok(Err(e)) => result.errors.push(format!("Windows設定: {}", e)),
        Err(e) => result.errors.push(format!("Windows設定(spawn): {}", e)),
    }

    // 4. Apply network gaming tweaks (sync fn → spawn_blocking)
    match tokio::task::spawn_blocking(super::network::apply_network_gaming).await {
        Ok(Ok(_)) => result.network_applied = true,
        Ok(Err(e)) => result.errors.push(format!("ネットワーク: {}", e)),
        Err(e) => result.errors.push(format!("ネットワーク(spawn): {}", e)),
    }

    super::log_observation(
        "apply_all_optimizations",
        serde_json::json!({
            "process_killed": result.process_killed,
            "process_freed_mb": result.process_freed_mb,
            "power_plan_set": result.power_plan_set,
            "windows_applied": result.windows_applied,
            "network_applied": result.network_applied,
            "errors": result.errors,
        }),
    );

    Ok(result)
}
