use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;


const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const TASK_NAME: &str = "GamingPCOptimizer_AutoOptimize";

#[derive(Serialize, Deserialize, Clone)]
pub struct ScheduleConfig {
    pub enabled: bool,
    pub trigger: String, // "daily" | "weekly" | "onlogon" | "onboot"
    pub time: String,    // "HH:MM" format
    pub day_of_week: u8, // 0=Sun..6=Sat
    pub preset: String,  // "esports" | "streaming" | "quiet" | "all"
    pub run_as_admin: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ScheduledTask {
    pub name: String,
    pub next_run: String,
    pub last_run: String,
    pub status: String,
    pub enabled: bool,
}

fn dow_to_powershell(day: u8) -> &'static str {
    match day {
        0 => "Sunday",
        1 => "Monday",
        2 => "Tuesday",
        3 => "Wednesday",
        4 => "Thursday",
        5 => "Friday",
        6 => "Saturday",
        _ => "Monday",
    }
}

#[tauri::command]
pub fn create_schedule(config: ScheduleConfig) -> Result<(), String> {
    // Build the trigger snippet
    let trigger_snippet = match config.trigger.as_str() {
        "daily" => {
            let time = if config.time.is_empty() {
                "03:00".to_string()
            } else {
                config.time.clone()
            };
            format!("$trigger = New-ScheduledTaskTrigger -Daily -At '{}'", time)
        }
        "weekly" => {
            let time = if config.time.is_empty() {
                "03:00".to_string()
            } else {
                config.time.clone()
            };
            let dow = dow_to_powershell(config.day_of_week);
            format!(
                "$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek {} -At '{}'",
                dow, time
            )
        }
        "onlogon" => "$trigger = New-ScheduledTaskTrigger -AtLogOn".to_string(),
        "onboot" => "$trigger = New-ScheduledTaskTrigger -AtStartup".to_string(),
        _ => {
            return Err(format!("不明なトリガー種別: {}", config.trigger));
        }
    };

    // Resolve our own exe path; fall back to a placeholder
    let exe_path = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "gaming-pc-optimizer.exe".to_string());

    let preset_arg = format!("--optimize --preset {}", config.preset);

    let script = format!(
        r#"
{trigger}
$action = New-ScheduledTaskAction -Execute '{exe}' -Argument '{arg}'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName '{name}' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
"#,
        trigger = trigger_snippet,
        exe = exe_path.replace('\'', "''"),
        arg = preset_arg,
        name = TASK_NAME,
    );

    let output = crate::win_cmd!("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell実行エラー: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(format!(
            "スケジュールの作成に失敗しました（管理者権限が必要な場合があります）: {} {}",
            stderr, stdout
        ))
    }
}

#[tauri::command]
pub fn delete_schedule() -> Result<(), String> {
    let output = crate::win_cmd!("schtasks")
        .args(["/delete", "/tn", TASK_NAME, "/f"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("schtasks実行エラー: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // If the task doesn't exist, treat as success
        if stderr.to_lowercase().contains("does not exist")
            || stderr.to_lowercase().contains("存在しません")
        {
            return Ok(());
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(format!(
            "スケジュールの削除に失敗しました: {} {}",
            stderr, stdout
        ))
    }
}

#[tauri::command]
pub fn get_schedule() -> Result<Option<ScheduledTask>, String> {
    let output = crate::win_cmd!("schtasks")
        .args(["/query", "/tn", TASK_NAME, "/fo", "CSV", "/v"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("schtasks実行エラー: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // If task not found, return None
    if !output.status.success() || stdout.trim().is_empty() {
        return Ok(None);
    }

    // Parse CSV: header is first line, data is second
    let lines: Vec<&str> = stdout.lines().collect();
    if lines.len() < 2 {
        return Ok(None);
    }

    let headers: Vec<&str> = lines[0].split(',').map(|s| s.trim_matches('"')).collect();
    let values: Vec<&str> = lines[1].split(',').map(|s| s.trim_matches('"')).collect();

    let get = |col: &str| -> String {
        headers
            .iter()
            .position(|h| h.eq_ignore_ascii_case(col))
            .and_then(|i| values.get(i))
            .map(|v| v.to_string())
            .unwrap_or_default()
    };

    let status_raw = get("Status");
    let enabled = !status_raw.eq_ignore_ascii_case("Disabled");

    Ok(Some(ScheduledTask {
        name: TASK_NAME.to_string(),
        next_run: get("Next Run Time"),
        last_run: get("Last Run Time"),
        status: status_raw,
        enabled,
    }))
}
