use serde::{Deserialize, Serialize};
use std::process::Command;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdate {
    pub id: String,
    pub name: String,
    pub current_version: String,
    pub available_version: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverInfo {
    pub device_name: String,
    pub provider: String,
    pub driver_version: String,
    pub driver_date: String,
    pub device_class: String,
}

// ── Winget helpers ────────────────────────────────────────────────────────────

fn find_col_start(header: &str, names: &[&str]) -> Option<usize> {
    for name in names {
        if let Some(pos) = header.find(name) {
            return Some(pos);
        }
    }
    None
}

fn extract_col(line: &str, start: usize, end: usize) -> &str {
    if start >= line.len() {
        return "";
    }
    let end = end.min(line.len());
    &line[start..end]
}

fn parse_winget_output(output: &str) -> Vec<AppUpdate> {
    let mut updates = Vec::new();
    let lines: Vec<&str> = output.lines().collect();

    // Find the header line
    let header_idx = match lines.iter().position(|line| {
        let lower = line.to_lowercase();
        (lower.contains("name") || lower.contains("名前"))
            && (lower.contains("id") || lower.contains("version") || lower.contains("バージョン"))
    }) {
        Some(i) => i,
        None => return updates,
    };

    // Find separator line (all dashes/underscores after header)
    let sep_idx = lines[header_idx + 1..]
        .iter()
        .position(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && trimmed.chars().all(|c| c == '-' || c == '─' || c == ' ')
        })
        .map(|i| i + header_idx + 1);

    let data_start = sep_idx.map(|i| i + 1).unwrap_or(header_idx + 1);
    let header = lines[header_idx];

    // Determine column offsets
    let id_start = find_col_start(header, &["Id", "ID"]).unwrap_or(40);
    let version_start =
        find_col_start(header, &["Version", "バージョン", "現在のバージョン"]).unwrap_or(60);
    let available_start = find_col_start(header, &["Available", "利用可能"]).unwrap_or(75);
    let source_start = find_col_start(header, &["Source", "ソース"]).unwrap_or(90);

    for line in &lines[data_start..] {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        // Stop at summary lines
        if line.contains("件") && (line.contains("アップグレード") || line.contains("upgrade")) {
            break;
        }
        if line.len() < available_start {
            continue;
        }

        let name = extract_col(line, 0, id_start).trim().to_string();
        let id = extract_col(line, id_start, version_start).trim().to_string();
        let current_version = extract_col(line, version_start, available_start).trim().to_string();
        let available_version = extract_col(line, available_start, source_start).trim().to_string();
        let source = if line.len() > source_start {
            line[source_start..].trim().to_string()
        } else {
            "winget".to_string()
        };

        if id.is_empty() || available_version.is_empty() || name.is_empty() {
            continue;
        }
        // Skip lines that look like junk
        if name.chars().all(|c| c == '-' || c == '─' || c == ' ') {
            continue;
        }

        updates.push(AppUpdate {
            id,
            name,
            current_version,
            available_version,
            source,
        });
    }

    updates
}

// ── WMI date helper ───────────────────────────────────────────────────────────

fn parse_wmi_date(raw: &str) -> String {
    // WMI date: "20230315000000.000000+000" → "2023-03-15"
    if raw.len() >= 8 {
        format!("{}-{}-{}", &raw[0..4], &raw[4..6], &raw[6..8])
    } else {
        raw.to_string()
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_app_updates() -> Result<Vec<AppUpdate>, String> {
    tokio::task::spawn_blocking(|| {
        let output = Command::new("winget")
            .args([
                "upgrade",
                "--include-unknown",
                "--accept-source-agreements",
                "--disable-interactivity",
            ])
            .output()
            .map_err(|e| {
                eprintln!("[check_app_updates] winget spawn error: {}", e);
                format!("wingetの実行に失敗しました: {}", e)
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(parse_winget_output(&stdout))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upgrade_apps(ids: Vec<String>) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        for id in &ids {
            let output = Command::new("winget")
                .args([
                    "upgrade",
                    "--id",
                    id,
                    "--silent",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                    "--disable-interactivity",
                ])
                .output();
            match output {
                Ok(o) if o.status.success() => results.push(format!("✓ {}", id)),
                Ok(o) => {
                    let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
                    eprintln!("[upgrade_apps] {} failed: {}", id, stderr);
                    results.push(format!("✗ {} - {}", id, stderr))
                }
                Err(e) => {
                    eprintln!("[upgrade_apps] {} spawn error: {}", id, e);
                    results.push(format!("✗ {} - {}", id, e))
                }
            }
        }
        results
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_driver_info() -> Result<Vec<DriverInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"Get-WmiObject Win32_PnPSignedDriver | Where-Object { $_.DeviceName -ne $null -and $_.DriverVersion -ne $null -and ($_.DeviceClass -match 'Display|Net|Media|USB|SCSIAdapter|HDC') } | Select-Object DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass | ConvertTo-Json -Compress"#;

        let output = Command::new("powershell")
            .args(["-NonInteractive", "-NoProfile", "-Command", script])
            .output()
            .map_err(|e| format!("PowerShellの実行に失敗しました: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let trimmed = stdout.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: serde_json::Value =
            serde_json::from_str(trimmed).unwrap_or(serde_json::Value::Array(vec![]));

        let items = match parsed {
            serde_json::Value::Array(arr) => arr,
            obj @ serde_json::Value::Object(_) => vec![obj],
            _ => vec![],
        };

        let drivers = items
            .iter()
            .filter_map(|item| {
                let device_name = item["DeviceName"].as_str()?.to_string();
                let provider = item["Manufacturer"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string();
                let driver_version = item["DriverVersion"].as_str().unwrap_or("").to_string();
                let driver_date_raw = item["DriverDate"].as_str().unwrap_or("").to_string();
                let driver_date = parse_wmi_date(&driver_date_raw);
                let device_class = item["DeviceClass"].as_str().unwrap_or("").to_string();
                Some(DriverInfo {
                    device_name,
                    provider,
                    driver_version,
                    driver_date,
                    device_class,
                })
            })
            .collect();

        Ok(drivers)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Export context JSON for AI analysis (also callable as a Tauri command)
#[tauri::command]
pub async fn export_updates_context() -> Result<String, String> {
    let app_updates = check_app_updates().await?;
    let drivers = check_driver_info().await?;

    let context = serde_json::json!({
        "schema_version": "1.0",
        "app_updates": app_updates,
        "drivers": drivers,
    });

    serde_json::to_string_pretty(&context).map_err(|e| e.to_string())
}
