use super::runner::{CommandRunner, SystemRunner};

/// Inner function: run PowerShell icon-extraction script via `runner`.
pub(crate) fn get_exe_icon_base64_inner(
    runner: &impl CommandRunner,
    script: &str,
) -> Result<String, String> {
    let (code, stdout, _stderr) = runner.run(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
        ],
    )?;

    if code != 0 {
        return Err("icon extraction failed".to_string());
    }

    let b64 = stdout.trim().to_string();
    if b64.is_empty() {
        return Err("empty base64 output".to_string());
    }
    Ok(b64)
}

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

    tokio::task::spawn_blocking(move || get_exe_icon_base64_inner(&SystemRunner, &script))
        .await
        .map_err(|e| e.to_string())?
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::runner::MockRunner;

    #[test]
    fn get_exe_icon_base64_inner_returns_b64_on_success() {
        let runner = MockRunner::success("iVBORw0KGgo=");
        let result = get_exe_icon_base64_inner(&runner, "dummy script");
        assert_eq!(result.unwrap(), "iVBORw0KGgo=");
    }

    #[test]
    fn get_exe_icon_base64_inner_errors_on_nonzero_exit() {
        let runner = MockRunner::failure("extraction failed");
        let result = get_exe_icon_base64_inner(&runner, "dummy script");
        assert_eq!(result.unwrap_err(), "icon extraction failed");
    }

    #[test]
    fn get_exe_icon_base64_inner_errors_on_empty_output() {
        let runner = MockRunner::success("");
        let result = get_exe_icon_base64_inner(&runner, "dummy script");
        assert_eq!(result.unwrap_err(), "empty base64 output");
    }
}
