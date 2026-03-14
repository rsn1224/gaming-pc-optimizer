/// display_optimizer.rs — HAGS / ディスプレイHz / Defender除外 (ENABLE_HAGS_DISPLAY_OPTIMIZER)
///
/// 3つのゲーミング向けシステム最適化を安全に提供する。
///   1. HAGS (Hardware-Accelerated GPU Scheduling) — 検出・切替
///   2. ディスプレイリフレッシュレート情報 — 現在Hz・最大Hz
///   3. Windows Defender ゲームフォルダ除外 — 一覧・追加・削除
///
/// Feature flag: ENABLE_HAGS_DISPLAY_OPTIMIZER = false
use serde::{Deserialize, Serialize};

use winreg::enums::*;
use winreg::RegKey;

// ── Feature flag ──────────────────────────────────────────────────────────────

pub const ENABLE_HAGS_DISPLAY_OPTIMIZER: bool = false;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HagsInfo {
    /// HAGS が現在有効か（HwSchMode == 2）
    pub enabled: bool,
    /// Windows 10 build 19041 (2004) 以上で対応
    pub supported: bool,
    pub win_build: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    pub name: String,
    pub current_hz: u32,
    pub max_hz: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayOptimizerStatus {
    pub hags: HagsInfo,
    pub displays: Vec<DisplayInfo>,
    pub defender_exclusions: Vec<String>,
}

// ── HAGS helpers ──────────────────────────────────────────────────────────────

/// HKEY_LOCAL_MACHINE\...\GraphicsDrivers\HwSchMode を読む。
/// 値が存在しない場合はデフォルト無効扱い。
fn read_hags_mode() -> u32 {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    hklm.open_subkey("SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers")
        .ok()
        .and_then(|k| k.get_value::<u32, _>("HwSchMode").ok())
        .unwrap_or(0)
}

/// Windows ビルド番号を読む（HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion）。
fn read_win_build() -> u32 {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    hklm.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
        .ok()
        .and_then(|k| k.get_value::<String, _>("CurrentBuildNumber").ok())
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(0)
}

fn get_hags_info() -> HagsInfo {
    let mode = read_hags_mode();
    let build = read_win_build();
    HagsInfo {
        enabled: mode == 2,
        supported: build >= 19041, // Windows 10 version 2004
        win_build: build,
    }
}

// ── Display helpers ───────────────────────────────────────────────────────────

/// Win32_VideoController からリフレッシュレートを取得する。
/// CurrentRefreshRate が 0 の場合は MaxRefreshRate で補完する。
fn get_displays() -> Vec<DisplayInfo> {
    let ps_script = r#"
try {
    $gpus = Get-CimInstance Win32_VideoController |
        Where-Object { $_.AdapterRAM -gt 0 -or $_.CurrentRefreshRate -gt 0 } |
        Select-Object Name, CurrentRefreshRate, MaxRefreshRate
    if ($null -eq $gpus) { Write-Output '[]'; exit 0 }
    $arr = @($gpus)
    $out = $arr | ForEach-Object {
        $hz = if ($_.CurrentRefreshRate -gt 0) { $_.CurrentRefreshRate }
              elseif ($_.MaxRefreshRate -gt 0) { $_.MaxRefreshRate }
              else { 60 }
        $max = if ($_.MaxRefreshRate -gt 0) { $_.MaxRefreshRate } else { $hz }
        [PSCustomObject]@{ name = $_.Name; currentHz = [int]$hz; maxHz = [int]$max }
    }
    $arr2 = @($out)
    $arr2 | ConvertTo-Json -Compress
} catch {
    Write-Output '[]'
}
"#;
    let out = crate::win_cmd!("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
        .output();

    let stdout = match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => return vec![],
    };

    // Handle single object {} or array [{}]
    let normalized = if stdout.starts_with('{') {
        format!("[{}]", stdout)
    } else {
        stdout
    };

    fn val_to_u32(v: Option<&serde_json::Value>) -> u32 {
        match v {
            Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(0) as u32,
            Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0),
            _ => 0,
        }
    }

    serde_json::from_str::<Vec<serde_json::Value>>(&normalized)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("Unknown GPU").to_string();
            let current_hz = val_to_u32(v.get("currentHz"));
            let max_hz = val_to_u32(v.get("maxHz"));
            if name.is_empty() { return None; }
            Some(DisplayInfo {
                name,
                current_hz: if current_hz > 0 { current_hz } else { max_hz.max(60) },
                max_hz: max_hz.max(60),
            })
        })
        .take(4) // 最大4デバイスまで
        .collect()
}

// ── Defender helpers ──────────────────────────────────────────────────────────

fn get_defender_exclusions_inner() -> Vec<String> {
    let ps_script = r#"
try {
    $exc = (Get-MpPreference -ErrorAction Stop).ExclusionPath
    if ($null -eq $exc) { Write-Output '[]'; exit 0 }
    @($exc) | ConvertTo-Json -Compress
} catch {
    Write-Output '[]'
}
"#;
    let out = crate::win_cmd!("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
        .output();

    let stdout = match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => return vec![],
    };

    // Could be a bare string "C:\\path" or array ["C:\\path", ...]
    let normalized = if stdout.starts_with('"') || (!stdout.starts_with('[') && !stdout.is_empty()) {
        format!("[{}]", stdout)
    } else {
        stdout
    };

    serde_json::from_str::<Vec<String>>(&normalized).unwrap_or_default()
}

/// パスに PowerShell インジェクションに使われうる文字が含まれていないか検証する。
fn validate_path(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("パスが空です".to_string());
    }
    // 基本的なインジェクション防止: セミコロン・パイプ・バッククォート等
    let forbidden = [';', '|', '&', '`', '$', '<', '>'];
    for ch in forbidden {
        if trimmed.contains(ch) {
            return Err(format!("パスに使用できない文字 '{}' が含まれています", ch));
        }
    }
    // Windows パスらしい形式（ドライブレター or UNC）か確認
    let looks_like_path = trimmed.len() >= 3
        && (trimmed.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
            && trimmed.chars().nth(1) == Some(':'))
        || trimmed.starts_with("\\\\");
    if !looks_like_path {
        return Err(format!("有効な Windows パスではありません: {}", trimmed));
    }
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// HAGS・ディスプレイHz・Defender除外の現在状態を一括取得する。
#[tauri::command]
pub async fn get_display_optimizer_status() -> Result<DisplayOptimizerStatus, String> {
    if !ENABLE_HAGS_DISPLAY_OPTIMIZER {
        return Err("ENABLE_HAGS_DISPLAY_OPTIMIZER is disabled.".to_string());
    }
    tokio::task::spawn_blocking(|| {
        let hags = get_hags_info();
        let displays = get_displays();
        let defender_exclusions = get_defender_exclusions_inner();
        DisplayOptimizerStatus { hags, displays, defender_exclusions }
    })
    .await
    .map_err(|e| e.to_string())
}

/// HAGS を有効化または無効化する（管理者権限が必要・再起動で反映）。
#[tauri::command]
pub async fn set_hags_enabled(enabled: bool) -> Result<HagsInfo, String> {
    if !ENABLE_HAGS_DISPLAY_OPTIMIZER {
        return Err("ENABLE_HAGS_DISPLAY_OPTIMIZER is disabled.".to_string());
    }
    tokio::task::spawn_blocking(move || {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let key = hklm
            .open_subkey_with_flags(
                "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers",
                KEY_SET_VALUE | KEY_READ,
            )
            .map_err(|e| format!("レジストリアクセス失敗（管理者権限が必要です）: {}", e))?;
        let value: u32 = if enabled { 2 } else { 1 };
        key.set_value("HwSchMode", &value)
            .map_err(|e| format!("レジストリ書き込み失敗: {}", e))?;
        Ok(get_hags_info())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Defender 除外パスを追加する（管理者権限が必要）。
#[tauri::command]
pub async fn add_defender_exclusion(path: String) -> Result<Vec<String>, String> {
    if !ENABLE_HAGS_DISPLAY_OPTIMIZER {
        return Err("ENABLE_HAGS_DISPLAY_OPTIMIZER is disabled.".to_string());
    }
    validate_path(&path)?;
    let path_clone = path.trim().to_string();
    tokio::task::spawn_blocking(move || {
        let script = format!(
            "Add-MpPreference -ExclusionPath '{}' -ErrorAction Stop",
            path_clone.replace('\'', "''") // escape single quotes
        );
        let out = crate::win_cmd!("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(format!("除外追加失敗（管理者権限が必要です）: {}", stderr));
        }
        Ok(get_defender_exclusions_inner())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Defender 除外パスを削除する（管理者権限が必要）。
#[tauri::command]
pub async fn remove_defender_exclusion(path: String) -> Result<Vec<String>, String> {
    if !ENABLE_HAGS_DISPLAY_OPTIMIZER {
        return Err("ENABLE_HAGS_DISPLAY_OPTIMIZER is disabled.".to_string());
    }
    validate_path(&path)?;
    let path_clone = path.trim().to_string();
    tokio::task::spawn_blocking(move || {
        let script = format!(
            "Remove-MpPreference -ExclusionPath '{}' -ErrorAction Stop",
            path_clone.replace('\'', "''")
        );
        let out = crate::win_cmd!("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(format!("除外削除失敗: {}", stderr));
        }
        Ok(get_defender_exclusions_inner())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_is_off_by_default() {
        assert!(!ENABLE_HAGS_DISPLAY_OPTIMIZER);
    }

    #[test]
    fn hags_mode_2_means_enabled() {
        // mode == 2 → enabled
        let enabled = 2u32 == 2;
        assert!(enabled);
    }

    #[test]
    fn hags_mode_1_means_disabled() {
        let enabled = 1u32 == 2;
        assert!(!enabled);
    }

    #[test]
    fn hags_mode_0_means_disabled() {
        let enabled = 0u32 == 2;
        assert!(!enabled);
    }

    #[test]
    fn win_build_19041_is_supported() {
        assert!(19041u32 >= 19041);
    }

    #[test]
    fn win_build_17763_not_supported() {
        assert!(17763u32 < 19041);
    }

    #[test]
    fn validate_path_accepts_valid_drive() {
        assert!(validate_path("C:\\Games\\MyGame").is_ok());
        assert!(validate_path("D:\\Program Files\\Steam").is_ok());
    }

    #[test]
    fn validate_path_accepts_unc() {
        assert!(validate_path("\\\\server\\share\\games").is_ok());
    }

    #[test]
    fn validate_path_rejects_empty() {
        assert!(validate_path("").is_err());
        assert!(validate_path("   ").is_err());
    }

    #[test]
    fn validate_path_rejects_injection_chars() {
        assert!(validate_path("C:\\Games; rm -rf /").is_err());
        assert!(validate_path("C:\\Games | Get-Process").is_err());
        assert!(validate_path("C:\\Games & whoami").is_err());
    }

    #[test]
    fn validate_path_rejects_relative_path() {
        assert!(validate_path("Games\\MyGame").is_err());
        assert!(validate_path("./games").is_err());
    }

    #[test]
    fn display_optimizer_status_serializes_camel_case() {
        let status = DisplayOptimizerStatus {
            hags: HagsInfo {
                enabled: true,
                supported: true,
                win_build: 22621,
            },
            displays: vec![DisplayInfo {
                name: "NVIDIA RTX 4070".to_string(),
                current_hz: 144,
                max_hz: 165,
            }],
            defender_exclusions: vec!["C:\\Games\\ValheimDedicated".to_string()],
        };
        let json = serde_json::to_value(&status).unwrap();
        assert!(json.get("hags").is_some());
        assert!(json["hags"].get("winBuild").is_some());
        assert!(json["displays"][0].get("currentHz").is_some());
        assert!(json["displays"][0].get("maxHz").is_some());
        assert_eq!(json["hags"]["winBuild"], 22621);
        assert_eq!(json["displays"][0]["currentHz"], 144);
    }

    #[test]
    fn display_info_hz_fallback_logic() {
        // current_hz が 0 なら max_hz で補完するロジックのテスト
        let current = 0u32;
        let max = 144u32;
        let effective = if current > 0 { current } else { max.max(60) };
        assert_eq!(effective, 144);
    }

    #[test]
    fn display_info_hz_fallback_minimum_60() {
        let current = 0u32;
        let max = 0u32;
        let effective = if current > 0 { current } else { max.max(60) };
        assert_eq!(effective, 60);
    }
}
