use super::runner::{CommandRunner, SystemRunner};
use serde::{Deserialize, Serialize};
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

    let s = get_network_settings();
    super::log_observation(
        "apply_network_gaming",
        serde_json::json!({ "applied": true }),
    );
    Ok(s)
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

/// Restore network settings to an exact previous state captured in a snapshot.
/// Called by the Rollback Center to undo gaming tweaks precisely.
pub(crate) fn restore_network_to(settings: &NetworkSettings) -> Result<(), String> {
    let throttle_val = if settings.throttling_disabled {
        0xFFFF_FFFFu32
    } else {
        10u32
    };
    write_mm_dword("NetworkThrottlingIndex", throttle_val)?;
    write_mm_dword("SystemResponsiveness", settings.system_responsiveness)?;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok((key, _)) = hkcu.create_subkey(MSMQ_PATH) {
        key.set_value(
            "TCPNoDelay",
            &(if settings.nagle_disabled { 1u32 } else { 0u32 }),
        )
        .ok();
    }
    Ok(())
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
    if let Ok(ifaces) =
        hklm.open_subkey("SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces")
    {
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

            let mut parts = dns_str.split([',', ' ']).filter(|s| !s.is_empty());

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
pub(crate) fn validate_adapter_name(name: &str) -> Result<(), String> {
    const FORBIDDEN: &[char] = &['"', '\'', ';', '&', '|', '>', '<', '`', '\n', '\r', '\0'];
    if name.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err("アダプター名に使用できない文字が含まれています".to_string());
    }
    if name.is_empty() || name.len() > 256 {
        return Err("アダプター名が無効です".to_string());
    }
    Ok(())
}

/// Inner DNS-set logic injectable with any CommandRunner.
pub(crate) fn set_adapter_dns_inner(
    runner: &impl CommandRunner,
    adapter_name: &str,
    preset: &str,
) -> Result<(), String> {
    validate_adapter_name(adapter_name)?;

    let (primary, secondary) = match preset {
        "google" => ("8.8.8.8", "8.8.4.4"),
        "cloudflare" => ("1.1.1.1", "1.0.0.1"),
        "opendns" => ("208.67.222.222", "208.67.220.220"),
        "dhcp" => {
            let (code, _, stderr) = runner.run(
                "netsh",
                &[
                    "interface",
                    "ip",
                    "set",
                    "dns",
                    "name",
                    adapter_name,
                    "source=dhcp",
                ],
            )?;
            return if code == 0 {
                Ok(())
            } else {
                Err(format!("管理者権限が必要です: {}", stderr.trim()))
            };
        }
        other => return Err(format!("不明なプリセット: {}", other)),
    };

    // Set primary
    let (code, _, stderr) = runner.run(
        "netsh",
        &[
            "interface",
            "ip",
            "set",
            "dns",
            "name",
            adapter_name,
            "source=static",
            "address",
            primary,
        ],
    )?;
    if code != 0 {
        return Err(format!("管理者権限が必要です: {}", stderr.trim()));
    }

    // Add secondary (errors ignored, same as original)
    runner
        .run(
            "netsh",
            &[
                "interface",
                "ip",
                "add",
                "dns",
                "name",
                adapter_name,
                "address",
                secondary,
                "index=2",
            ],
        )
        .ok();

    Ok(())
}

/// Set DNS servers for the given adapter.
/// `preset` is one of "google" | "cloudflare" | "opendns" | "dhcp"
#[tauri::command]
pub fn set_adapter_dns(adapter_name: String, preset: String) -> Result<(), String> {
    set_adapter_dns_inner(&SystemRunner, &adapter_name, &preset)?;
    super::log_observation(
        "set_adapter_dns",
        serde_json::json!({ "adapter": adapter_name, "preset": preset }),
    );
    Ok(())
}

// ── Ping ───────────────────────────────────────────────────────────────────

fn ping_failure(host: String, packet_loss: u32) -> PingResult {
    PingResult {
        host,
        times_ms: vec![],
        avg_ms: 0.0,
        min_ms: 0.0,
        max_ms: 0.0,
        packet_loss,
        success: false,
    }
}

/// Inner ping logic injectable with any CommandRunner.
pub(crate) fn ping_host_inner(runner: &impl CommandRunner, host: &str) -> PingResult {
    let stdout = match runner.run("ping", &["-n", "4", host]) {
        Ok((_, stdout, _)) => stdout,
        Err(_) => return ping_failure(host.to_string(), 100),
    };

    // Parse individual reply times: match `time=Xms` or `time<Xms`
    let times_ms: Vec<f64> = stdout
        .lines()
        .filter_map(|line| {
            let lower = line.to_lowercase();
            let pos = lower.find("time").or_else(|| lower.find("時間"))?;
            let after = &line[pos..];
            let digit_start = after.find(|c: char| c.is_ascii_digit())?;
            let digits: String = after[digit_start..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            digits.parse::<f64>().ok()
        })
        .collect();

    let packet_loss = parse_packet_loss(&stdout);

    if times_ms.is_empty() {
        return ping_failure(host.to_string(), packet_loss);
    }

    let min_ms = times_ms.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_ms = times_ms.iter().cloned().fold(0.0_f64, f64::max);
    let avg_ms = times_ms.iter().sum::<f64>() / times_ms.len() as f64;

    PingResult {
        host: host.to_string(),
        times_ms,
        avg_ms,
        min_ms,
        max_ms,
        packet_loss,
        success: true,
    }
}

/// Run 4 ICMP pings to `host` and return timing statistics.
/// Works on any Windows locale by matching `time=Xms` or `時間=Xms`.
#[tauri::command]
pub fn ping_host(host: String) -> PingResult {
    ping_host_inner(&SystemRunner, &host)
}

// ── DNS Auto-test ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DnsPingSummary {
    pub preset: String,  // "google" | "cloudflare" | "opendns" | "current"
    pub primary: String, // e.g. "8.8.8.8"
    pub secondary: Option<String>,
    pub ping: PingResult,
}

#[derive(Debug, Serialize)]
pub struct NetworkAdvisorContext {
    pub adapter: AdapterInfo,
    pub settings: NetworkSettings,
    pub dns_tests: Vec<DnsPingSummary>,
}

const DNS_TEST_PRESETS: &[(&str, &str, &str)] = &[
    ("google", "8.8.8.8", "8.8.4.4"),
    ("cloudflare", "1.1.1.1", "1.0.0.1"),
    ("opendns", "208.67.222.222", "208.67.220.220"),
];

#[tauri::command]
pub fn auto_test_dns(adapter_name: String) -> Result<Vec<DnsPingSummary>, String> {
    let adapters = get_network_adapters();
    let current = adapters.into_iter().find(|a| a.name == adapter_name);

    let mut summaries: Vec<DnsPingSummary> = Vec::new();

    // Test known presets
    for (preset, primary, secondary) in DNS_TEST_PRESETS {
        let ping = ping_host(primary.to_string());
        summaries.push(DnsPingSummary {
            preset: preset.to_string(),
            primary: primary.to_string(),
            secondary: Some(secondary.to_string()),
            ping,
        });
    }

    // Test current adapter DNS if set and not already covered by a preset
    if let Some(adapter) = current {
        if !adapter.primary_dns.is_empty() {
            let already_tested = DNS_TEST_PRESETS
                .iter()
                .any(|(_, p, _)| *p == adapter.primary_dns);
            if !already_tested {
                let ping = ping_host(adapter.primary_dns.clone());
                summaries.push(DnsPingSummary {
                    preset: "current".to_string(),
                    primary: adapter.primary_dns.clone(),
                    secondary: if adapter.secondary_dns.is_empty() {
                        None
                    } else {
                        Some(adapter.secondary_dns.clone())
                    },
                    ping,
                });
            }
        }
    }

    Ok(summaries)
}

#[tauri::command]
pub fn export_network_advisor_context(adapter_name: String) -> Result<String, String> {
    let adapters = get_network_adapters();
    let adapter = adapters
        .into_iter()
        .find(|a| a.name == adapter_name)
        .ok_or_else(|| format!("アダプター '{}' が見つかりません", adapter_name))?;

    let settings = get_network_settings();
    let dns_tests = auto_test_dns(adapter_name)?;

    let context = NetworkAdvisorContext {
        adapter,
        settings,
        dns_tests,
    };

    serde_json::to_string_pretty(&context).map_err(|e| format!("JSONシリアライズ失敗: {}", e))
}

pub(crate) fn parse_packet_loss(output: &str) -> u32 {
    // Match "X% loss" or "X% ロス" or "(X% )"
    for line in output.lines() {
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

pub(crate) fn extract_percent(s: &str) -> Option<u32> {
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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::runner::MockRunner;
    use super::*;

    // ── validate_adapter_name ─────────────────────────────────────────────────

    #[test]
    fn validate_adapter_name_accepts_normal_name() {
        assert!(validate_adapter_name("イーサネット").is_ok());
        assert!(validate_adapter_name("Wi-Fi").is_ok());
        assert!(validate_adapter_name("Local Area Connection").is_ok());
    }

    #[test]
    fn validate_adapter_name_rejects_semicolon() {
        assert!(validate_adapter_name("eth0; rm -rf /").is_err());
    }

    #[test]
    fn validate_adapter_name_rejects_empty_string() {
        assert!(validate_adapter_name("").is_err());
    }

    #[test]
    fn validate_adapter_name_rejects_pipe_character() {
        assert!(validate_adapter_name("eth|evil").is_err());
    }

    // ── extract_percent ───────────────────────────────────────────────────────

    #[test]
    fn extract_percent_finds_value_before_percent_sign() {
        assert_eq!(
            extract_percent("Packets: Sent=4, Lost=0 (0% loss)"),
            Some(0)
        );
        assert_eq!(extract_percent("(25% loss)"), Some(25));
        assert_eq!(extract_percent("100% loss"), Some(100));
    }

    #[test]
    fn extract_percent_returns_none_for_no_percent() {
        assert!(extract_percent("no percentage here").is_none());
    }

    // ── parse_packet_loss ─────────────────────────────────────────────────────

    #[test]
    fn parse_packet_loss_from_english_output() {
        let output = "Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),";
        assert_eq!(parse_packet_loss(output), 0);
    }

    #[test]
    fn parse_packet_loss_from_100_percent_loss() {
        let output = "Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),";
        assert_eq!(parse_packet_loss(output), 100);
    }

    // ── ping_host_inner (MockRunner) ──────────────────────────────────────────

    #[test]
    fn ping_host_inner_returns_failure_on_runner_error() {
        let runner = MockRunner::new(vec![Err("spawn failed".to_string())]);
        let result = ping_host_inner(&runner, "8.8.8.8");
        assert!(!result.success);
        assert_eq!(result.packet_loss, 100);
    }

    #[test]
    fn ping_host_inner_parses_successful_ping_output() {
        let stdout = "Reply from 8.8.8.8: bytes=32 time=15ms TTL=117\n\
                      Reply from 8.8.8.8: bytes=32 time=14ms TTL=117\n\
                      Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),\n";
        let runner = MockRunner::success(stdout);
        let result = ping_host_inner(&runner, "8.8.8.8");
        assert!(result.success);
        assert_eq!(result.times_ms.len(), 2);
        assert_eq!(result.packet_loss, 0);
        assert_eq!(result.min_ms, 14.0);
        assert_eq!(result.max_ms, 15.0);
    }

    // ── set_adapter_dns_inner (MockRunner) ────────────────────────────────────

    #[test]
    fn set_adapter_dns_inner_sends_dhcp_netsh_command() {
        let runner = MockRunner::success(""); // netsh returns 0
        let result = set_adapter_dns_inner(&runner, "Wi-Fi", "dhcp");
        assert!(result.is_ok());
    }

    #[test]
    fn set_adapter_dns_inner_rejects_unknown_preset() {
        let runner = MockRunner::success("");
        let result = set_adapter_dns_inner(&runner, "Wi-Fi", "unknown_preset");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不明なプリセット"));
    }

    #[test]
    fn set_adapter_dns_inner_rejects_injected_adapter_name() {
        let runner = MockRunner::success("");
        let result = set_adapter_dns_inner(&runner, "Wi-Fi; evil", "google");
        assert!(result.is_err());
    }
}
