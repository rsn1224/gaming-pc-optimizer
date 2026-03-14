use std::process::Command;

/// Extract the associated icon from an EXE and return it as a PNG base64 string.
/// Uses PowerShell + System.Drawing to avoid the `windows` crate dependency.
#[tauri::command]
pub async fn get_exe_icon_base64(exe_path: String) -> Result<String, String> {
    if exe_path.is_empty() {
        return Err("empty exe_path".to_string());
    }
    // Reject paths containing control characters or newlines that could break
    // the PowerShell single-quoted string, even though exe_path comes from the OS.
    if exe_path.contains('\n') || exe_path.contains('\r') || exe_path.contains('\0') {
        return Err("invalid exe_path".to_string());
    }

    let script = format!(
        r#"
Add-Type -AssemblyName System.Drawing
try {{
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{exe}')
    if ($icon -eq $null) {{ exit 1 }}
    $bmp = $icon.ToBitmap()
    $ms  = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [Convert]::ToBase64String($ms.ToArray())
}} catch {{ exit 1 }}
"#,
        exe = exe_path.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("icon extraction failed".to_string());
    }

    let b64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if b64.is_empty() {
        return Err("empty base64 output".to_string());
    }
    Ok(b64)
}
