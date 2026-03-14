use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Deserialize, Clone)]
pub struct ClipboardStatus {
    pub has_content: bool,
    pub content_type: String, // "text" | "image" | "files" | "empty" | "unknown"
    pub size_estimate_kb: u64,
    pub temp_files_mb: f64,
    pub temp_file_count: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ClipboardCleanResult {
    pub clipboard_cleared: bool,
    pub temp_freed_mb: f64,
    pub files_removed: u32,
}

/// Get current clipboard status and temp file sizes
#[tauri::command]
pub fn get_clipboard_status() -> Result<ClipboardStatus, String> {
    // Query clipboard formats via PowerShell
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Add-Type -Assembly PresentationCore; \
             $d = [Windows.Clipboard]::GetDataObject(); \
             if ($d -eq $null) { '' } else { $d.GetFormats() -join ',' }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    let formats_str = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let formats_str = formats_str.trim();

    let has_content = !formats_str.is_empty();

    let content_type = if !has_content {
        "empty".to_string()
    } else if formats_str.contains("bitmap")
        || formats_str.contains("png")
        || formats_str.contains("jpg")
    {
        "image".to_string()
    } else if formats_str.contains("filedrop") || formats_str.contains("filename") {
        "files".to_string()
    } else if formats_str.contains("text")
        || formats_str.contains("unicodetext")
        || formats_str.contains("oemtext")
    {
        "text".to_string()
    } else if has_content {
        "unknown".to_string()
    } else {
        "empty".to_string()
    };

    // Rough size estimate based on content type
    let size_estimate_kb: u64 = match content_type.as_str() {
        "image" => 500,
        "files" => 10,
        "text" => 2,
        _ => 0,
    };

    // Scan temp dir for clipboard-related files
    let (temp_files_mb, temp_file_count) = scan_clipboard_temps_size();

    Ok(ClipboardStatus {
        has_content,
        content_type,
        size_estimate_kb,
        temp_files_mb,
        temp_file_count,
    })
}

fn scan_clipboard_temps_size() -> (f64, u32) {
    let temp_dir = match std::env::var("TEMP") {
        Ok(t) => t,
        Err(_) => return (0.0, 0),
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut total_bytes: u64 = 0;
    let mut count: u32 = 0;

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name_lower = path
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            // Match clipboard-related patterns
            let is_clipboard_temp = name_lower.starts_with("clipboard")
                || (name_lower.starts_with('~') && name_lower.ends_with(".tmp"))
                || name_lower.ends_with(".xlsb")
                || (name_lower.ends_with(".tmp") && {
                    // Only count .tmp files older than 1 hour
                    entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| now.saturating_sub(d.as_secs()) > 3600)
                        .unwrap_or(false)
                });

            if is_clipboard_temp {
                if let Ok(meta) = entry.metadata() {
                    total_bytes += meta.len();
                    count += 1;
                }
            }
        }
    }

    let mb = total_bytes as f64 / (1024.0 * 1024.0);
    (mb, count)
}

/// Clear the Windows clipboard using PowerShell
#[tauri::command]
pub fn clear_clipboard() -> Result<(), String> {
    Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Set-Clipboard -Value $null",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Clean clipboard-related temp files
#[tauri::command]
pub fn clean_clipboard_temps() -> Result<ClipboardCleanResult, String> {
    let temp_dir = std::env::var("TEMP")
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());

    let one_hour_ago = Duration::from_secs(3600);

    let mut total_freed_bytes: u64 = 0;
    let mut files_removed: u32 = 0;

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let name_lower = path
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let should_remove = if name_lower.starts_with("clipboard") {
                // Clipboard*.* — always remove
                true
            } else if name_lower.starts_with('~') && name_lower.ends_with(".tmp") {
                // ~*.tmp files — always remove
                true
            } else if name_lower.ends_with(".tmp") {
                // *.tmp — remove only if older than 1 hour
                entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|modified| modified.elapsed().ok().map(|age| age > one_hour_ago))
                    .unwrap_or(false)
            } else if name_lower.ends_with(".xlsb") || name_lower.ends_with(".docx") {
                // Office clipboard temps in %TEMP% — remove if older than 1 hour
                entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|modified| modified.elapsed().ok().map(|age| age > one_hour_ago))
                    .unwrap_or(false)
            } else {
                false
            };

            if should_remove {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if std::fs::remove_file(&path).is_ok() {
                    total_freed_bytes += size;
                    files_removed += 1;
                }
            }
        }
    }

    let temp_freed_mb = total_freed_bytes as f64 / (1024.0 * 1024.0);

    // Also clear the clipboard itself for convenience
    let clipboard_cleared = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Set-Clipboard -Value $null",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .is_ok();

    Ok(ClipboardCleanResult {
        clipboard_cleared,
        temp_freed_mb,
        files_removed,
    })
}
