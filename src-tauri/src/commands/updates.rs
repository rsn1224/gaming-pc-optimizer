use serde::{Deserialize, Serialize};
use super::runner::{CommandRunner, SystemRunner};

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

// ── Winget helpers (pure) ─────────────────────────────────────────────────────

pub(crate) fn find_col_start(header: &str, names: &[&str]) -> Option<usize> {
    for name in names {
        if let Some(pos) = header.find(name) {
            return Some(pos);
        }
    }
    None
}

pub(crate) fn extract_col(line: &str, start: usize, end: usize) -> &str {
    if start >= line.len() {
        return "";
    }
    let end = end.min(line.len());
    &line[start..end]
}

pub(crate) fn parse_winget_output(output: &str) -> Vec<AppUpdate> {
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

// ── WMI date helper (pure) ────────────────────────────────────────────────────

pub(crate) fn parse_wmi_date(raw: &str) -> String {
    // WMI date: "20230315000000.000000+000" → "2023-03-15"
    if raw.len() >= 8 {
        format!("{}-{}-{}", &raw[0..4], &raw[4..6], &raw[6..8])
    } else {
        raw.to_string()
    }
}

// ── Inner functions (runner-based, testable) ──────────────────────────────────

pub(crate) fn check_app_updates_inner(runner: &impl CommandRunner) -> Result<Vec<AppUpdate>, String> {
    let (code, stdout, stderr) = runner.run(
        "winget",
        &[
            "upgrade",
            "--include-unknown",
            "--accept-source-agreements",
            "--disable-interactivity",
        ],
    )?;
    if code != 0 {
        eprintln!("[check_app_updates] winget failed: {}", stderr.trim());
    }
    Ok(parse_winget_output(&stdout))
}

pub(crate) fn upgrade_app_inner(runner: &impl CommandRunner, id: &str) -> String {
    match runner.run(
        "winget",
        &[
            "upgrade",
            "--id",
            id,
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--disable-interactivity",
        ],
    ) {
        Ok((0, _, _)) => format!("✓ {}", id),
        Ok((_, _, stderr)) => {
            eprintln!("[upgrade_apps] {} failed: {}", id, stderr.trim());
            format!("✗ {} - {}", id, stderr.trim())
        }
        Err(e) => {
            eprintln!("[upgrade_apps] {} spawn error: {}", id, e);
            format!("✗ {} - {}", id, e)
        }
    }
}

const DRIVER_QUERY_SCRIPT: &str = r#"Get-WmiObject Win32_PnPSignedDriver | Where-Object { $_.DeviceName -ne $null -and $_.DriverVersion -ne $null -and ($_.DeviceClass -match 'Display|Net|Media|USB|SCSIAdapter|HDC') } | Select-Object DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass | ConvertTo-Json -Compress"#;

pub(crate) fn check_driver_info_inner(runner: &impl CommandRunner) -> Result<Vec<DriverInfo>, String> {
    let (_, stdout, _) = runner.run(
        "powershell",
        &["-NonInteractive", "-NoProfile", "-Command", DRIVER_QUERY_SCRIPT],
    )?;

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
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_app_updates() -> Result<Vec<AppUpdate>, String> {
    tokio::task::spawn_blocking(|| check_app_updates_inner(&SystemRunner))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upgrade_apps(ids: Vec<String>) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        ids.iter().map(|id| upgrade_app_inner(&SystemRunner, id)).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_driver_info() -> Result<Vec<DriverInfo>, String> {
    tokio::task::spawn_blocking(|| check_driver_info_inner(&SystemRunner))
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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::runner::MockRunner;

    // ── Pure helper tests ────────────────────────────────────────────────────

    #[test]
    fn find_col_start_returns_first_match() {
        let header = "Name                   Id                   Version  Available Source";
        assert_eq!(find_col_start(header, &["Id", "ID"]), Some(23));
    }

    #[test]
    fn find_col_start_returns_none_when_no_match() {
        let header = "Name  Version  Available";
        assert_eq!(find_col_start(header, &["Id", "ID"]), None);
    }

    #[test]
    fn extract_col_returns_slice_within_bounds() {
        let line = "Firefox   Mozilla.Firefox  120.0  121.0  winget";
        let result = extract_col(line, 10, 26);
        assert_eq!(result, "Mozilla.Firefox ");
    }

    #[test]
    fn extract_col_returns_empty_when_start_beyond_len() {
        let line = "short";
        assert_eq!(extract_col(line, 100, 200), "");
    }

    #[test]
    fn parse_wmi_date_formats_correctly() {
        assert_eq!(parse_wmi_date("20230315000000.000000+000"), "2023-03-15");
    }

    #[test]
    fn parse_wmi_date_passthrough_for_short_string() {
        assert_eq!(parse_wmi_date("N/A"), "N/A");
    }

    #[test]
    fn parse_winget_output_no_header_returns_empty() {
        let output = "Some random text\nNo header here\n";
        assert!(parse_winget_output(output).is_empty());
    }

    #[test]
    fn parse_winget_output_parses_valid_table() {
        // Simulate winget upgrade output with known column offsets
        let output = "\
Name                     Id                       Version    Available  Source\n\
-----------------------  -----------------------  ---------  ---------  ------\n\
Firefox                  Mozilla.Firefox          120.0      121.0      winget\n\
";
        let updates = parse_winget_output(output);
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].id.trim(), "Mozilla.Firefox");
        assert_eq!(updates[0].name.trim(), "Firefox");
    }

    // ── Runner-based tests ────────────────────────────────────────────────────

    #[test]
    fn check_app_updates_inner_returns_empty_on_blank_output() {
        let runner = MockRunner::success("");
        let result = check_app_updates_inner(&runner).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn upgrade_app_inner_success_returns_checkmark() {
        let runner = MockRunner::success("");
        let result = upgrade_app_inner(&runner, "SomeApp.Id");
        assert!(result.starts_with('✓'));
        assert!(result.contains("SomeApp.Id"));
    }

    #[test]
    fn upgrade_app_inner_failure_returns_cross() {
        let runner = MockRunner::failure("not found");
        let result = upgrade_app_inner(&runner, "Bad.App");
        assert!(result.starts_with('✗'));
        assert!(result.contains("Bad.App"));
    }

    #[test]
    fn check_driver_info_inner_returns_empty_on_blank_output() {
        let runner = MockRunner::success("");
        let result = check_driver_info_inner(&runner).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn check_driver_info_inner_parses_json_array() {
        let json = r#"[{"DeviceName":"GPU","Manufacturer":"NVIDIA","DriverVersion":"31.0","DriverDate":"20230315000000.000000+000","DeviceClass":"Display"}]"#;
        let runner = MockRunner::success(json);
        let result = check_driver_info_inner(&runner).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].device_name, "GPU");
        assert_eq!(result[0].driver_date, "2023-03-15");
    }
}
