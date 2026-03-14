use super::runner::{CommandRunner, SystemRunner};
use std::path::PathBuf;


/// Extract the active power scheme GUID from `powercfg /getactivescheme` output.
/// Returns the raw GUID string (e.g. "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c").
pub(crate) fn parse_active_guid(output: &str) -> Option<String> {
    output
        .lines()
        .find(|l| l.to_lowercase().contains("power scheme guid"))
        .and_then(|l| {
            l.split_whitespace()
                .find(|part| part.len() == 36 && part.contains('-'))
                .map(|s| s.to_string())
        })
}

/// Inner logic for get_current_power_plan, injectable with any CommandRunner.
pub(crate) fn current_power_plan_inner(runner: &impl CommandRunner) -> Result<String, String> {
    let (code, stdout, stderr) = runner.run("powercfg", &["/getactivescheme"])?;
    if code != 0 {
        return Err(format!("powercfg failed: {}", stderr.trim()));
    }
    Ok(stdout.trim().to_string())
}

#[tauri::command]
pub async fn get_current_power_plan() -> Result<String, String> {
    tokio::task::spawn_blocking(|| current_power_plan_inner(&SystemRunner))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_ultimate_performance() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        // Ultimate Performance プランを有効化 (GUID: e9a42b02-d5df-448d-aa00-03f14749eb61)
        let duplicate = crate::win_cmd!("powercfg")
            .args(["-duplicatescheme", "e9a42b02-d5df-448d-aa00-03f14749eb61"])
            .output()
            .map_err(|e| e.to_string())?;

        let list_output = crate::win_cmd!("powercfg")
            .args(["/list"])
            .output()
            .map_err(|e| e.to_string())?;

        let list_str = String::from_utf8_lossy(&list_output.stdout).to_string();

        let ultimate_guid = list_str
            .lines()
            .find(|line| {
                line.to_lowercase().contains("ultimate")
                    || line.contains("e9a42b02-d5df-448d-aa00-03f14749eb61")
            })
            .and_then(|line| {
                line.split_whitespace()
                    .find(|part| part.len() == 36 && part.contains('-'))
                    .map(|s| s.to_string())
            });

        let guid =
            ultimate_guid.unwrap_or_else(|| "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c".to_string());

        let set_output = crate::win_cmd!("powercfg")
            .args(["/setactive", &guid])
            .output()
            .map_err(|e| e.to_string())?;

        let previous_guid = {
            let prev_out = crate::win_cmd!("powercfg")
                .args(["/getactivescheme"])
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            parse_active_guid(&prev_out)
        };

        if set_output.status.success() {
            crate::win_cmd!("powercfg")
                .args([
                    "/SETACVALUEINDEX",
                    "SCHEME_CURRENT",
                    "2a737441-1930-4402-8d77-b2bebba308a3",
                    "48e6b7a6-50f5-4782-a5d4-53bb8f07e226",
                    "0",
                ])
                .output()
                .ok();
            crate::win_cmd!("powercfg")
                .args([
                    "/SETACVALUEINDEX",
                    "SCHEME_CURRENT",
                    "54533251-82be-4824-96c1-47b60b740d00",
                    "893dee8e-2bef-41e0-89c6-b55d0929964c",
                    "100",
                ])
                .output()
                .ok();
            crate::win_cmd!("powercfg")
                .args(["/SETACTIVE", "SCHEME_CURRENT"])
                .output()
                .ok();

            super::log_observation(
                "set_ultimate_performance",
                serde_json::json!({ "guid": guid, "previous_guid": previous_guid }),
            );
            Ok(format!("{}|{}", guid, previous_guid.unwrap_or_default()))
        } else {
            let stderr = String::from_utf8_lossy(&set_output.stderr).to_string();
            let _ = duplicate;
            Err(format!("電源プラン変更に失敗しました: {}", stderr))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 指定した GUID の電源プランをアクティブに設定する (ゲーム終了後の復元用)。
/// フロントエンドが `set_ultimate_performance` の戻り値から前の GUID を保存しておき、
/// ゲーム終了時にこのコマンドを呼ぶ。
#[tauri::command]
pub async fn restore_power_plan(previous_guid: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let guid = previous_guid.trim().to_string();
        let is_valid = guid.len() == 36
            && guid.chars().filter(|&c| c == '-').count() == 4
            && guid.chars().all(|c| c.is_ascii_hexdigit() || c == '-');

        if !is_valid {
            return Err(format!("無効な GUID 形式です: {}", guid));
        }

        let out = crate::win_cmd!("powercfg")
            .args(["/setactive", &guid])
            .output()
            .map_err(|e| e.to_string())?;

        if out.status.success() {
            Ok(())
        } else {
            Err(format!(
                "電源プランの復元に失敗しました: {}",
                String::from_utf8_lossy(&out.stderr)
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Power backup helpers ──────────────────────────────────────────────────────

fn power_backup_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("power_backup.json")
}

/// Get the currently active power plan GUID.
pub fn get_current_power_guid() -> Option<String> {
    let out = crate::win_cmd!("powercfg")
        .args(["/getactivescheme"])
        .output()
        .ok()?;
    parse_active_guid(&String::from_utf8_lossy(&out.stdout))
}

/// Save the given GUID as the "pre-optimization" power plan (only if no backup exists).
pub fn save_power_backup(prev_guid: &str) {
    let path = power_backup_path();
    if path.exists() {
        return; // don't overwrite existing backup
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let json = serde_json::json!({ "prev_guid": prev_guid });
    std::fs::write(&path, json.to_string()).ok();
}

/// Read the backup GUID, returns None if no backup exists.
pub fn read_power_backup() -> Option<String> {
    let raw = std::fs::read_to_string(power_backup_path()).ok()?;
    let val: serde_json::Value = serde_json::from_str(&raw).ok()?;
    val["prev_guid"].as_str().map(String::from)
}

/// Delete the power backup file after a successful restore.
pub fn clear_power_backup() {
    std::fs::remove_file(power_backup_path()).ok();
}

/// Sync version of restore_power_plan for use in non-async contexts (watcher, tray).
pub fn restore_power_plan_internal(guid: &str) -> Result<(), String> {
    let guid = guid.trim();
    let valid = guid.len() == 36
        && guid.chars().filter(|&c| c == '-').count() == 4
        && guid.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !valid {
        return Err(format!("無効な GUID 形式: {}", guid));
    }
    let out = crate::win_cmd!("powercfg")
        .args(["/setactive", guid])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

// ── Power plan listing ────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PowerPlanInfo {
    pub guid: String,
    pub name: String,
    pub is_active: bool,
}

/// Parse the output of `powercfg /list` into a list of PowerPlanInfo.
/// Handles both English and Japanese locale output:
///   "Power Scheme GUID: 381b4222-...  (Balanced) *"
///   "電源設定スキーム GUID: 381b4222-...  (バランス) *"
fn parse_power_plan_list(output: &str) -> Vec<PowerPlanInfo> {
    let mut plans = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        // Must contain "GUID:" and a parenthesis for the name
        let lower = line.to_lowercase();
        if !lower.contains("guid:") {
            continue;
        }
        // Extract GUID (36-char hex with dashes)
        let guid = match line.split_whitespace().find(|part| {
            part.len() == 36
                && part.contains('-')
                && part.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        }) {
            Some(g) => g.to_string(),
            None => continue,
        };
        // Extract name from parentheses
        let name = {
            let start = line.find('(').map(|i| i + 1);
            let end = line.rfind(')');
            match (start, end) {
                (Some(s), Some(e)) if e > s => line[s..e].trim().to_string(),
                _ => guid.clone(),
            }
        };
        // Active plan ends with " *" (after stripping trailing whitespace)
        let is_active = line.ends_with('*');
        plans.push(PowerPlanInfo {
            guid,
            name,
            is_active,
        });
    }
    plans
}

#[tauri::command]
pub fn list_power_plans() -> Result<Vec<PowerPlanInfo>, String> {
    use std::os::windows::process::CommandExt;
    let output = crate::win_cmd!("powercfg")
        .args(["/list"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("powercfg /list の実行に失敗しました: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let plans = parse_power_plan_list(&stdout);
    Ok(plans)
}

#[tauri::command]
pub fn set_power_plan_by_guid(guid: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let guid = guid.trim().to_string();
    // Validate GUID format
    let valid = guid.len() == 36
        && guid.chars().filter(|&c| c == '-').count() == 4
        && guid.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !valid {
        return Err(format!("無効な GUID 形式です: {}", guid));
    }

    let out = crate::win_cmd!("powercfg")
        .args(["/setactive", &guid])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("powercfg /setactive の実行に失敗しました: {}", e))?;

    if out.status.success() {
        super::log_observation(
            "set_power_plan_by_guid",
            serde_json::json!({ "guid": guid }),
        );
        Ok(())
    } else {
        Err(format!(
            "電源プランの設定に失敗しました: {}",
            String::from_utf8_lossy(&out.stderr)
        ))
    }
}

/// Lightweight power plan accessor used by frontend (returns "balanced"|"high_performance"|"ultimate"|"unknown")
#[tauri::command]
pub fn get_power_plan() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    let out = crate::win_cmd!("powercfg")
        .args(["/getactivescheme"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("powercfg error: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
    if stdout.contains("e9a42b02") || stdout.contains("ultimate") {
        Ok("ultimate".to_string())
    } else if stdout.contains("8c5e7fda")
        || stdout.contains("high performance")
        || stdout.contains("高パフォーマンス")
    {
        Ok("high_performance".to_string())
    } else if stdout.contains("381b4222")
        || stdout.contains("balanced")
        || stdout.contains("バランス")
    {
        Ok("balanced".to_string())
    } else {
        Ok("unknown".to_string())
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::runner::MockRunner;
    use super::*;

    // ── parse_active_guid ─────────────────────────────────────────────────────

    #[test]
    fn parse_active_guid_extracts_guid_from_real_output() {
        let output = "Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)";
        let guid = parse_active_guid(output).unwrap();
        assert_eq!(guid, "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
    }

    #[test]
    fn parse_active_guid_returns_none_for_empty_string() {
        assert!(parse_active_guid("").is_none());
    }

    #[test]
    fn parse_active_guid_returns_none_when_no_guid_present() {
        assert!(parse_active_guid("Error: no active scheme found").is_none());
    }

    // ── current_power_plan_inner (MockRunner) ─────────────────────────────────

    #[test]
    fn current_power_plan_inner_returns_trimmed_stdout_on_success() {
        let mock_output = "Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c\r\n";
        let runner = MockRunner::success(mock_output);
        let result = current_power_plan_inner(&runner).unwrap();
        assert_eq!(
            result,
            "Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
        );
    }

    #[test]
    fn current_power_plan_inner_returns_err_on_nonzero_exit() {
        let runner = MockRunner::failure("Access denied");
        let err = current_power_plan_inner(&runner).unwrap_err();
        assert!(err.contains("powercfg failed"), "err={}", err);
    }
}
