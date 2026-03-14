use std::path::PathBuf;

fn screenshots_dir() -> PathBuf {
    std::env::temp_dir().join("gpo_screenshots")
}

fn downloads_dir() -> PathBuf {
    std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Downloads"))
        .unwrap_or_else(|_| std::env::temp_dir())
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

/// Write a .ps1 file and run it. Avoids all inline argument quoting issues.
fn run_ps1(script_content: &str) -> Result<String, String> {
    let ps1_path = std::env::temp_dir().join("gpo_cmd.ps1");
    std::fs::write(&ps1_path, script_content)
        .map_err(|e| format!("スクリプト書き込み失敗: {}", e))?;

    let output = crate::win_cmd!("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            ps1_path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| format!("PowerShell起動失敗: {}", e))?;

    std::fs::remove_file(&ps1_path).ok();

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if err.is_empty() { out } else { err });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Capture the primary screen and save as PNG.
#[tauri::command]
pub async fn take_screenshot(name: String) -> Result<(), String> {
    let dir = screenshots_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(format!("{}.png", sanitize(&name)));
    let path_str = path.to_string_lossy().to_string();

    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save("{path}")
$g.Dispose()
$bmp.Dispose()
Write-Output "saved"
"#,
        path = path_str
    );

    let result = tokio::task::spawn_blocking(move || run_ps1(&script))
        .await
        .map_err(|e| format!("スレッドエラー: {}", e))?
        .map_err(|e| format!("スクリーンショット失敗: {}", e))?;

    // Verify the file was actually created
    if !path.exists() {
        return Err(format!("ファイルが作成されませんでした (PS出力: {})", result));
    }

    Ok(())
}

/// Zip all captured PNGs into ~/Downloads/gpo_screenshots.zip.
/// Returns the absolute path of the ZIP.
#[tauri::command]
pub async fn zip_screenshots() -> Result<String, String> {
    let dir = screenshots_dir();
    let zip_path = downloads_dir().join("gpo_screenshots.zip");

    if zip_path.exists() {
        std::fs::remove_file(&zip_path).ok();
    }

    // Verify there are PNGs to zip
    let png_count = std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("png"))
                .count()
        })
        .unwrap_or(0);

    if png_count == 0 {
        return Err("スクリーンショットが0件です。撮影が正常に完了しませんでした。".to_string());
    }

    let dir_str = dir.to_string_lossy().to_string();
    let zip_str = zip_path.to_string_lossy().to_string();

    let script = format!(
        r#"
$pngs = Get-ChildItem -Path "{dir}" -Filter "*.png" | Sort-Object Name
if ($pngs.Count -eq 0) {{ Write-Error "No PNGs found"; exit 1 }}
Compress-Archive -Path $pngs.FullName -DestinationPath "{zip}"
Write-Output "zipped $($pngs.Count) files"
"#,
        dir = dir_str,
        zip = zip_str
    );

    tokio::task::spawn_blocking(move || run_ps1(&script))
        .await
        .map_err(|e| format!("スレッドエラー: {}", e))?
        .map_err(|e| format!("ZIP作成失敗: {}", e))?;

    if !zip_path.exists() {
        return Err("ZIPファイルが作成されませんでした".to_string());
    }

    // Clean up temp PNGs
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("png") {
                std::fs::remove_file(p).ok();
            }
        }
    }

    Ok(zip_path.to_string_lossy().to_string())
}

/// Delete leftover temp screenshots before starting a new tour.
#[tauri::command]
pub fn clear_screenshots() -> Result<(), String> {
    let dir = screenshots_dir();
    if dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) == Some("png") {
                    std::fs::remove_file(p).ok();
                }
            }
        }
    }
    Ok(())
}
