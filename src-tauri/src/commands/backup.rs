use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn profiles_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("profiles.json")
}

#[derive(Serialize, Deserialize)]
struct BackupData {
    version: String,
    exported_at: String,
    profiles: serde_json::Value,
}

/// Reads profiles.json and returns it packaged as a JSON string.
#[tauri::command]
pub fn export_backup() -> Result<String, String> {
    let profiles_raw = if profiles_path().exists() {
        std::fs::read_to_string(profiles_path())
            .map_err(|e| format!("プロファイル読み込み失敗: {}", e))?
    } else {
        "[]".to_string()
    };

    let profiles: serde_json::Value = serde_json::from_str(&profiles_raw)
        .map_err(|e| format!("プロファイルのJSONパース失敗: {}", e))?;

    let backup = BackupData {
        version: "1".to_string(),
        exported_at: super::now_iso8601(),
        profiles,
    };

    serde_json::to_string_pretty(&backup).map_err(|e| format!("JSONシリアライズ失敗: {}", e))
}

/// Parses a BackupData JSON string and writes profiles back to disk.
#[tauri::command]
pub fn import_backup(json: String) -> Result<String, String> {
    let backup: BackupData =
        serde_json::from_str(&json).map_err(|e| format!("バックアップのJSONパース失敗: {}", e))?;

    if backup.version != "1" {
        return Err(format!(
            "未対応のバックアップバージョン: {}",
            backup.version
        ));
    }

    let profiles_count = backup.profiles.as_array().map(|a| a.len()).unwrap_or(0);

    let pretty = serde_json::to_string_pretty(&backup.profiles)
        .map_err(|e| format!("JSONシリアライズ失敗: {}", e))?;

    let path = profiles_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;
    }
    std::fs::write(&path, pretty).map_err(|e| format!("ファイル書き込み失敗: {}", e))?;

    Ok(format!(
        "インポートしました: {}個のプロファイル",
        profiles_count
    ))
}
