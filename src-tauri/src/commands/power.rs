use std::path::PathBuf;
use std::process::Command;

/// Extract the active power scheme GUID from `powercfg /getactivescheme` output.
/// Returns the raw GUID string (e.g. "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c").
fn parse_active_guid(output: &str) -> Option<String> {
    output
        .lines()
        .find(|l| l.to_lowercase().contains("power scheme guid"))
        .and_then(|l| {
            l.split_whitespace()
                .find(|part| part.len() == 36 && part.contains('-'))
                .map(|s| s.to_string())
        })
}

#[tauri::command]
pub async fn get_current_power_plan() -> Result<String, String> {
    let output = Command::new("powercfg")
        .args(["/getactivescheme"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout.trim().to_string())
}

#[tauri::command]
pub async fn set_ultimate_performance() -> Result<String, String> {
    // Ultimate Performance プランを有効化 (GUID: e9a42b02-d5df-448d-aa00-03f14749eb61)
    let duplicate = Command::new("powercfg")
        .args([
            "-duplicatescheme",
            "e9a42b02-d5df-448d-aa00-03f14749eb61",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    // 利用可能なプランを一覧取得してUltimate PerformanceのGUIDを探す
    let list_output = Command::new("powercfg")
        .args(["/list"])
        .output()
        .map_err(|e| e.to_string())?;

    let list_str = String::from_utf8_lossy(&list_output.stdout).to_string();

    // Ultimate PerformanceのGUIDを抽出
    let ultimate_guid = list_str
        .lines()
        .find(|line| {
            line.to_lowercase().contains("ultimate")
                || line.contains("e9a42b02-d5df-448d-aa00-03f14749eb61")
        })
        .and_then(|line| {
            // "Power Scheme GUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" の形式からGUIDを抽出
            line.split_whitespace()
                .find(|part| part.len() == 36 && part.contains('-'))
                .map(|s| s.to_string())
        });

    let guid = match ultimate_guid {
        Some(g) => g,
        None => {
            // フォールバック: 高パフォーマンスプランを使用
            "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c".to_string()
        }
    };

    // プランをアクティブに設定
    let set_output = Command::new("powercfg")
        .args(["/setactive", &guid])
        .output()
        .map_err(|e| e.to_string())?;

    // 切り替え前の GUID を取得して呼び出し元に返す (フロントエンドで保存→復元に使用)
    let previous_guid = {
        let prev_out = Command::new("powercfg")
            .args(["/getactivescheme"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        parse_active_guid(&prev_out)
    };

    if set_output.status.success() {
        // USB Selective Suspend 無効化
        Command::new("powercfg")
            .args([
                "/SETACVALUEINDEX",
                "SCHEME_CURRENT",
                "2a737441-1930-4402-8d77-b2bebba308a3",
                "48e6b7a6-50f5-4782-a5d4-53bb8f07e226",
                "0",
            ])
            .output()
            .ok();

        // CPU最小パフォーマンス 100%
        Command::new("powercfg")
            .args([
                "/SETACVALUEINDEX",
                "SCHEME_CURRENT",
                "54533251-82be-4824-96c1-47b60b740d00",
                "893dee8e-2bef-41e0-89c6-b55d0929964c",
                "100",
            ])
            .output()
            .ok();

        Command::new("powercfg")
            .args(["/SETACTIVE", "SCHEME_CURRENT"])
            .output()
            .ok();

        super::log_observation(
            "set_ultimate_performance",
            serde_json::json!({ "guid": guid, "previous_guid": previous_guid }),
        );
        Ok(format!(
            "{}|{}",
            guid,
            previous_guid.unwrap_or_default()
        ))
    } else {
        let stderr = String::from_utf8_lossy(&set_output.stderr).to_string();
        let _ = duplicate; // suppress unused warning
        Err(format!("電源プラン変更に失敗しました: {}", stderr))
    }
}

/// 指定した GUID の電源プランをアクティブに設定する (ゲーム終了後の復元用)。
/// フロントエンドが `set_ultimate_performance` の戻り値から前の GUID を保存しておき、
/// ゲーム終了時にこのコマンドを呼ぶ。
#[tauri::command]
pub async fn restore_power_plan(previous_guid: String) -> Result<(), String> {
    // GUID 形式の簡易バリデーション (36文字 + ハイフン4個)
    let guid = previous_guid.trim();
    let is_valid = guid.len() == 36
        && guid.chars().filter(|&c| c == '-').count() == 4
        && guid.chars().all(|c| c.is_ascii_hexdigit() || c == '-');

    if !is_valid {
        return Err(format!("無効な GUID 形式です: {}", guid));
    }

    let out = Command::new("powercfg")
        .args(["/setactive", guid])
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
    let out = Command::new("powercfg")
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
    let out = Command::new("powercfg")
        .args(["/setactive", guid])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}
