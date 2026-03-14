/// system_utils.rs — システムユーティリティコマンド
///
/// 管理者権限での再起動 (relaunch_as_admin) を提供する。
/// PowerShell の Start-Process -Verb RunAs を使用するため追加依存なし。

/// 現在のプロセスを管理者権限で再起動する。
/// UAC プロンプトが表示され、ユーザーが承認すると現在のプロセスは終了する。
#[tauri::command]
pub async fn relaunch_as_admin() -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("実行ファイルパスの取得に失敗: {}", e))?;

    let exe_path = exe.to_string_lossy().to_string();

    // PowerShell で Start-Process -Verb RunAs を実行して管理者昇格
    let status = crate::win_cmd!("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!("Start-Process -FilePath '{}' -Verb RunAs", exe_path),
        ])
        .status()
        .map_err(|e| format!("PowerShell の実行に失敗: {}", e))?;

    if !status.success() {
        return Err("管理者として再起動できませんでした（UAC がキャンセルされた可能性があります）".to_string());
    }

    // 昇格プロセスが起動したので現在のプロセスを終了
    std::process::exit(0);
}
