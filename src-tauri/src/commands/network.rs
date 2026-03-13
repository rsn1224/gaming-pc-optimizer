use serde::{Deserialize, Serialize};
use std::process::Command;
use winreg::enums::*;
use winreg::RegKey;

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkSettings {
    /// NetworkThrottlingIndex == 0xFFFFFFFF means disabled
    pub throttling_disabled: bool,
    /// 0 = best performance, 20 = Windows default
    pub system_responsiveness: u32,
    /// TCPNoDelay in MSMQ (HKCU, no admin needed)
    pub nagle_disabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdapterInfo {
    pub name: String,
    pub primary_dns: String,
    pub secondary_dns: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub times_ms: Vec<f64>,
    pub avg_ms: f64,
    pub min_ms: f64,
    pub max_ms: f64,
    pub packet_loss: u32,
    pub success: bool,
}

// ── helpers ────────────────────────────────────────────────────────────────

const MM_PROFILE_PATH: &str =
    "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
const MSMQ_PATH: &str = "SOFTWARE\\Microsoft\\MSMQ\\Parameters";

fn read_mm_dword(name: &str, default: u32) -> u32 {
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(MM_PROFILE_PATH)
        .and_then(|k| k.get_value::<u32, _>(name))
        .unwrap_or(default)
}

fn write_mm_dword(name: &str, value: u32) -> Result<(), String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let (key, _) = hklm
        .create_subkey(MM_PROFILE_PATH)
        .map_err(|e| format!("管理者権限が必要です: {}", e))?;
    key.set_value(name, &value)
        .map_err(|e| format!("管理者権限が必要です: {}", e))
}

// ── Network Settings ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_network_settings() -> NetworkSettings {
    let throttling_index = read_mm_dword("NetworkThrottlingIndex", 10);
    let system_responsiveness = read_mm_dword("SystemResponsiveness", 20);

    let nagle_disabled = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(MSMQ_PATH)
        .and_then(|k| k.get_value::<u32, _>("TCPNoDelay"))
        .unwrap_or(0)
        == 1;

    NetworkSettings {
        throttling_disabled: throttling_index == 0xFFFFFFFF,
        system_responsiveness,
        nagle_disabled,
    }
}

#[tauri::command]
pub fn apply_network_gaming() -> Result<NetworkSettings, String> {
    // HKLM writes — require admin; return descriptive error if denied
    write_mm_dword("NetworkThrottlingIndex", 0xFFFFFFFF)?;
    write_mm_dword("SystemResponsiveness", 0)?;

    // HKCU — no admin needed
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok((key, _)) = hkcu.create_subkey(MSMQ_PATH) {
        key.set_value("TCPNoDelay", &1u32).ok();
    }

    Ok(get_network_settings())
}

#[tauri::command]
pub fn restore_network_settings() -> Result<NetworkSettings, String> {
    write_mm_dword("NetworkThrottlingIndex", 10)?;
    write_mm_dword("SystemResponsiveness", 20)?;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok((key, _)) = hkcu.create_subkey(MSMQ_PATH) {
        key.set_value("TCPNoDelay", &0u32).ok();
    }

    Ok(get_network_settings())
}

// ── Adapters / DNS ─────────────────────────────────────────────────────────

/// List active network adapters with their current DNS servers.
/// Reads from the registry to avoid locale-dependent netsh output.
#[tauri::command]
pub fn get_network_adapters() -> Vec<AdapterInfo> {
    let mut adapters: Vec<AdapterInfo> = Vec::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // Map GUID → friendly name
    let name_map: std::collections::HashMap<String, String> = hklm
        .open_subkey(
            "SYSTEM\\CurrentControlSet\\Control\\Network\\\
             {4D36E972-E325-11CE-BFC1-08002BE10318}",
        )
        .map(|net_key| {
            let mut map = std::collections::HashMap::new();
            for guid in net_key.enum_keys().flatten() {
                if let Ok(conn_key) = net_key.open_subkey(format!("{}\\Connection", guid)) {
                    if let Ok(name) = conn_key.get_value::<String, _>("Name") {
                        map.insert(guid, name);
                    }
                }
            }
            map
        })
        .unwrap_or_default();

    // Enumerate TCP/IP interface configs
    if let Ok(ifaces) = hklm.open_subkey(
        "SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces",
    ) {
        for guid in ifaces.enum_keys().flatten() {
            let friendly = match name_map.get(&guid) {
                Some(n) => n.clone(),
                None => continue, // skip interfaces without a friendly name
            };
            let Ok(iface_key) = ifaces.open_subkey(&guid) else {
                continue;
            };

            // NameServer = static DNS, DhcpNameServer = DHCP-assigned
            let dns_str: String = iface_key
                .get_value::<String, _>("NameServer")
                .or_else(|_| iface_key.get_value::<String, _>("DhcpNameServer"))
                .unwrap_or_default();

            let mut parts = dns_str
                .split(|c| c == ',' || c == ' ')
                .filter(|s| !s.is_empty());

            adapters.push(AdapterInfo {
                name: friendly,
                primary_dns: parts.next().unwrap_or("").to_string(),
                secondary_dns: parts.next().unwrap_or("").to_string(),
            });
        }
    }

    adapters
}

/// Reject adapter names that contain shell meta-characters to prevent
/// command injection via `netsh interface ip set dns name=<adapter_name>`.
fn validate_adapter_name(name: &str) -> Result<(), String> {
    const FORBIDDEN: &[char] = &['"', '\'', ';', '&', '|', '>', '<', '`', '\n', '\r', '\0'];
    if name.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err("アダプター名に使用できない文字が含まれています".to_string());
    }
    if name.is_empty() || name.len() > 256 {
        return Err("アダプター名が無効です".to_string());
    }
    Ok(())
}

/// Set DNS servers for the given adapter.
/// `preset` is one of "google" | "cloudflare" | "opendns" | "dhcp"
#[tauri::command]
pub fn set_adapter_dns(adapter_name: String, preset: String) -> Result<(), String> {
    validate_adapter_name(&adapter_name)?;

    let (primary, secondary) = match preset.as_str() {
        "google" => ("8.8.8.8", "8.8.4.4"),
        "cloudflare" => ("1.1.1.1", "1.0.0.1"),
        "opendns" => ("208.67.222.222", "208.67.220.220"),
        "dhcp" => {
            // Restore to automatic (DHCP)
            let out = Command::new("netsh")
                .args([
                    "interface", "ip", "set", "dns",
                    "name", &adapter_name,
                    "source=dhcp",
                ])
                .output()
                .map_err(|e| e.to_string())?;
            return if out.status.success() {
                Ok(())
            } else {
                Err(format!(
                    "管理者権限が必要です: {}",
                    String::from_utf8_lossy(&out.stderr)
                ))
            };
        }
        other => return Err(format!("不明なプリセット: {}", other)),
    };

    // Set primary
    let out = Command::new("netsh")
        .args([
            "interface", "ip", "set", "dns",
            "name", &adapter_name,
            "source=static",
            "address", primary,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !out.status.success() {
        return Err(format!(
            "管理者権限が必要です: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    // Add secondary
    Command::new("netsh")
        .args([
            "interface", "ip", "add", "dns",
            "name", &adapter_name,
            "address", secondary,
            "index=2",
        ])
        .output()
        .ok();

    Ok(())
}

// ── Ping ───────────────────────────────────────────────────────────────────

/// Run 4 ICMP pings to `host` and return timing statistics.
/// Works on any Windows locale by matching `time=Xms` or `時間=Xms`.
#[tauri::command]
pub fn ping_host(host: String) -> PingResult {
    let output = Command::new("ping")
        .args(["-n", "4", &host])
        .output();

    let Ok(out) = output else {
        return PingResult {
            host,
            times_ms: vec![],
            avg_ms: 0.0,
            min_ms: 0.0,
            max_ms: 0.0,
            packet_loss: 100,
            success: false,
        };
    };

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();

    // Parse individual reply times: match `time=Xms` or `time<Xms`
    let times_ms: Vec<f64> = stdout
        .lines()
        .filter_map(|line| {
            let lower = line.to_lowercase();
            // match "time=Xms", "time<1ms", "時間=Xms", "時間 =Xms"
            let pos = lower.find("time").or_else(|| lower.find("時間"))?;
            let after = &line[pos..];
            // find first digit sequence after the keyword
            let digit_start = after.find(|c: char| c.is_ascii_digit())?;
            let digits: String = after[digit_start..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            digits.parse::<f64>().ok()
        })
        .collect();

    // Packet loss
    let packet_loss = parse_packet_loss(&stdout);

    if times_ms.is_empty() {
        return PingResult {
            host,
            times_ms,
            avg_ms: 0.0,
            min_ms: 0.0,
            max_ms: 0.0,
            packet_loss,
            success: false,
        };
    }

    let min_ms = times_ms.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_ms = times_ms.iter().cloned().fold(0.0_f64, f64::max);
    let avg_ms = times_ms.iter().sum::<f64>() / times_ms.len() as f64;

    PingResult {
        host,
        times_ms,
        avg_ms,
        min_ms,
        max_ms,
        packet_loss,
        success: true,
    }
}

fn parse_packet_loss(output: &str) -> u32 {
    // Match "X% loss" or "X% ロス" or "(X% )"
    for line in output.lines() {
        // Look for a % preceded by digits in lines mentioning loss/ロス
        let lower = line.to_lowercase();
        if lower.contains("loss") || lower.contains("ロス") || lower.contains("lost") {
            if let Some(pct) = extract_percent(line) {
                return pct;
            }
        }
    }
    // Fallback: look for any "X% " pattern
    for line in output.lines() {
        if let Some(pct) = extract_percent(line) {
            return pct;
        }
    }
    0
}

fn extract_percent(s: &str) -> Option<u32> {
    let idx = s.find('%')?;
    // Find digits immediately before '%'
    let before = &s[..idx];
    let digits: String = before
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    digits.parse().ok()
}
