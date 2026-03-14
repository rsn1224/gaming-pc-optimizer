use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn show_osd_window(app: AppHandle) -> Result<(), String> {
    // Close existing if open
    if let Some(w) = app.get_webview_window("osd") {
        w.close().ok();
    }

    WebviewWindowBuilder::new(&app, "osd", WebviewUrl::App("index.html#/osd".into()))
        .title("OSD")
        .inner_size(220.0, 140.0)
        .position(20.0, 20.0)
        .always_on_top(true)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn hide_osd_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("osd") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn is_osd_visible(app: AppHandle) -> bool {
    app.get_webview_window("osd").is_some()
}
