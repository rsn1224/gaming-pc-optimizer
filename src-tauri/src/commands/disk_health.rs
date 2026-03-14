use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Deserialize, Clone)]
pub struct DiskInfo {
    pub caption: String,
    pub status: String,
    pub media_type: String,
    pub size_gb: f64,
    pub serial: String,
    pub health_score: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DiskHealthReport {
    pub disks: Vec<DiskInfo>,
    pub smart_available: bool,
    pub overall_health: String,
    pub recommendations: Vec<String>,
}

fn health_score_from_status(status: &str) -> u32 {
    let s = status.to_lowercase();
    if s.contains("healthy") || s.contains("ok") {
        100
    } else if s.contains("warning") || s.contains("degraded") || s.contains("pred") {
        50
    } else if s.contains("unhealthy") || s.contains("error") || s.contains("fail") {
        0
    } else {
        75 // unknown → assume mostly ok
    }
}

fn classify_media(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("nvme") || lower.contains("nvm") {
        "NVMe SSD".to_string()
    } else if lower.contains("ssd") || lower.contains("solid") {
        "SSD".to_string()
    } else if lower.contains("hdd") || lower.contains("fixed hard") || lower.contains("hard disk") {
        "HDD".to_string()
    } else if lower.contains("external") || lower.contains("removable") {
        "外付".to_string()
    } else if raw.trim().is_empty() {
        "不明".to_string()
    } else {
        raw.trim().to_string()
    }
}

/// Try PowerShell Get-PhysicalDisk first, fall back to WMIC.
fn fetch_disks_powershell() -> Result<Vec<DiskInfo>, String> {
    let script = r#"
$disks = Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, Size, SerialNumber
$disks | ConvertTo-Json -Compress
"#;

    let output = crate::win_cmd!("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell実行エラー: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Err("PowerShell出力が空です".to_string());
    }

    // Output may be a single object or an array
    let val: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("JSONパースエラー: {}", e))?;

    let arr = match val {
        serde_json::Value::Array(a) => a,
        obj @ serde_json::Value::Object(_) => vec![obj],
        _ => return Err("予期しないJSON形式".to_string()),
    };

    let mut disks = Vec::new();
    for item in arr {
        let name = item["FriendlyName"]
            .as_str()
            .unwrap_or("不明ディスク")
            .trim()
            .to_string();
        let media_raw = item["MediaType"].as_str().unwrap_or("").to_string();
        let health_raw = item["HealthStatus"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string();
        let size_bytes = item["Size"].as_f64().unwrap_or(0.0);
        let serial = item["SerialNumber"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();

        let size_gb = (size_bytes / 1_073_741_824.0 * 10.0).round() / 10.0;
        let score = health_score_from_status(&health_raw);

        disks.push(DiskInfo {
            caption: name,
            status: health_raw,
            media_type: classify_media(&media_raw),
            size_gb,
            serial,
            health_score: score,
        });
    }

    Ok(disks)
}

/// WMIC fallback
fn fetch_disks_wmic() -> Vec<DiskInfo> {
    let output = crate::win_cmd!("wmic")
        .args([
            "diskdrive",
            "get",
            "Caption,Status,MediaType,Size,SerialNumber",
            "/format:csv",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let Ok(out) = output else {
        return Vec::new();
    };

    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let mut disks = Vec::new();

    for line in text.lines().skip(2) {
        // skip blank header + first line
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split(',').collect();
        // CSV columns: Node,Caption,MediaType,SerialNumber,Size,Status
        if cols.len() < 6 {
            continue;
        }
        let caption = cols[1].trim().to_string();
        if caption.is_empty() {
            continue;
        }
        let media_raw = cols[2].trim().to_string();
        let serial = cols[3].trim().to_string();
        let size_bytes: f64 = cols[4].trim().parse().unwrap_or(0.0);
        let status = cols[5].trim().to_string();

        let size_gb = (size_bytes / 1_073_741_824.0 * 10.0).round() / 10.0;
        let score = health_score_from_status(&status);

        disks.push(DiskInfo {
            caption,
            status,
            media_type: classify_media(&media_raw),
            size_gb,
            serial,
            health_score: score,
        });
    }

    disks
}

fn generate_recommendations(disks: &[DiskInfo]) -> Vec<String> {
    let mut recs = Vec::new();
    for d in disks {
        if d.health_score < 50 {
            recs.push(format!(
                "「{}」の健全性が低下しています。早急にバックアップを取得してください。",
                d.caption
            ));
        } else if d.health_score < 100 {
            recs.push(format!(
                "「{}」のステータスが「{}」です。定期的な監視をお勧めします。",
                d.caption, d.status
            ));
        }
        if d.media_type == "HDD" {
            recs.push(format!(
                "「{}」はHDDです。SSDへの換装でパフォーマンスが大幅に向上します。",
                d.caption
            ));
        }
    }
    if recs.is_empty() {
        recs.push("すべてのディスクは正常な状態です。".to_string());
    }
    recs
}

#[tauri::command]
pub fn get_disk_health() -> Result<DiskHealthReport, String> {
    let disks = fetch_disks_powershell().unwrap_or_else(|_| fetch_disks_wmic());

    if disks.is_empty() {
        return Ok(DiskHealthReport {
            disks: Vec::new(),
            smart_available: false,
            overall_health: "不明".to_string(),
            recommendations: vec![
                "ディスク情報を取得できませんでした。管理者権限での実行をお試しください。"
                    .to_string(),
            ],
        });
    }

    let min_score = disks.iter().map(|d| d.health_score).min().unwrap_or(100);
    let overall_health = if min_score >= 80 {
        "健全".to_string()
    } else if min_score >= 50 {
        "注意".to_string()
    } else {
        "警告".to_string()
    };

    let recommendations = generate_recommendations(&disks);

    Ok(DiskHealthReport {
        disks,
        smart_available: false, // Basic status only; no raw SMART via WMI
        overall_health,
        recommendations,
    })
}
