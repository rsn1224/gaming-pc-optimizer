use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::Networks;

#[derive(Serialize, Deserialize, Clone)]
pub struct BandwidthSnapshot {
    pub timestamp: u64,
    pub download_kbps: f64,
    pub upload_kbps: f64,
    pub total_received_mb: f64,
    pub total_sent_mb: f64,
    pub active_interface: String,
}

/// (timestamp_secs, rx_bytes_total, tx_bytes_total)
static PREV_NET: OnceLock<Mutex<Option<(u64, u64, u64)>>> = OnceLock::new();

fn prev_net() -> &'static Mutex<Option<(u64, u64, u64)>> {
    PREV_NET.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub fn get_bandwidth_snapshot() -> Result<BandwidthSnapshot, String> {
    let networks = Networks::new_with_refreshed_list();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|e| e.to_string())?;

    // Sum all interfaces
    let mut total_rx: u64 = 0;
    let mut total_tx: u64 = 0;
    let mut primary_name = String::new();

    for (name, data) in &networks {
        total_rx = total_rx.saturating_add(data.total_received());
        total_tx = total_tx.saturating_add(data.total_transmitted());
        if primary_name.is_empty() {
            primary_name = name.clone();
        }
    }

    let mut prev_lock = prev_net().lock().unwrap_or_else(|p| p.into_inner());
    let (dl_kbps, ul_kbps) = if let Some((prev_ts, prev_rx, prev_tx)) = *prev_lock {
        let dt = (now.saturating_sub(prev_ts)).max(1) as f64;
        let dl = total_rx.saturating_sub(prev_rx) as f64 / 1024.0 / dt;
        let ul = total_tx.saturating_sub(prev_tx) as f64 / 1024.0 / dt;
        (dl, ul)
    } else {
        (0.0, 0.0)
    };
    *prev_lock = Some((now, total_rx, total_tx));

    Ok(BandwidthSnapshot {
        timestamp: now,
        download_kbps: dl_kbps,
        upload_kbps: ul_kbps,
        total_received_mb: total_rx as f64 / 1_048_576.0,
        total_sent_mb: total_tx as f64 / 1_048_576.0,
        active_interface: primary_name,
    })
}
