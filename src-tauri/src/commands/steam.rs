use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::profiles::{load_profiles, save_profiles, GameProfile};

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DiscoveredGame {
    pub app_id: String,
    pub name: String,
    pub install_dir: String,
    pub exe_path: Option<String>,
}

// ── Steam root detection ──────────────────────────────────────────────────────

fn find_steam_root() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    // Most common on 64-bit Windows
    if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
    {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            let p = PathBuf::from(&path);
            if p.exists() {
                return Some(p);
            }
        }
    }

    // Per-user install
    if let Ok(key) =
        RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam")
    {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            let p = PathBuf::from(&path);
            if p.exists() {
                return Some(p);
            }
        }
    }

    // Fallback to default install location
    let default = PathBuf::from("C:\\Program Files (x86)\\Steam");
    if default.exists() {
        return Some(default);
    }

    None
}

// ── VDF helpers ───────────────────────────────────────────────────────────────

/// Extract the string value for `key` from VDF-formatted text.
/// Handles lines like: `    "name"    "Dota 2"`
fn vdf_value(content: &str, key: &str) -> Option<String> {
    let search = format!("\"{}\"", key);
    for line in content.lines() {
        let t = line.trim();
        if !t.starts_with(&search) {
            continue;
        }
        let after = t[search.len()..].trim_start();
        if after.starts_with('"') {
            let inner = &after[1..];
            if let Some(end) = inner.find('"') {
                return Some(inner[..end].to_string());
            }
        }
    }
    None
}

/// Collect the `steamapps` directories across all Steam library folders.
fn library_steamapps_dirs(steam_root: &Path) -> Vec<PathBuf> {
    let mut result = vec![steam_root.join("steamapps")];

    let vdf_path = steam_root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(content) = std::fs::read_to_string(&vdf_path) {
        for line in content.lines() {
            let t = line.trim();
            if !t.starts_with("\"path\"") {
                continue;
            }
            if let Some(val) = vdf_value(t, "path") {
                // unescape double backslashes written by Steam
                let p = PathBuf::from(val.replace("\\\\", "\\"));
                let sa = p.join("steamapps");
                if sa.exists() && !result.contains(&sa) {
                    result.push(sa);
                }
            }
        }
    }

    result
}

// ── Exe detection ─────────────────────────────────────────────────────────────

/// Substrings that indicate a helper/redistributable exe — not the main game.
const SKIP_PATTERNS: &[&str] = &[
    "unins", "uninst", "uninstall",
    "vcredist", "dxsetup", "dxwebsetup", "directx",
    "dotnet", "physx", "openal",
    "crashhandler", "crashreport", "bugreport",
    "setup", "install", "redist",
    "upc", "uplay_r1_loader",
];

/// Try to identify the main game executable inside `dir`.
/// Returns the path of the largest `.exe` after filtering out helpers.
fn find_main_exe(dir: &Path) -> Option<String> {
    let mut candidates: Vec<(PathBuf, u64)> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            name.ends_with(".exe")
                && !SKIP_PATTERNS.iter().any(|pat| name.contains(pat))
        })
        .filter_map(|e| {
            let size = e.metadata().ok()?.len();
            Some((e.path(), size))
        })
        .collect();

    if candidates.is_empty() {
        return None;
    }

    // Largest exe is usually the game binary
    candidates.sort_by(|a, b| b.1.cmp(&a.1));
    Some(candidates[0].0.to_string_lossy().to_string())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Scan all Steam library folders and return the list of installed games.
#[tauri::command]
pub fn discover_steam_games() -> Result<Vec<DiscoveredGame>, String> {
    let steam_root =
        find_steam_root().ok_or("Steam がインストールされていません")?;
    let steamapps_dirs = library_steamapps_dirs(&steam_root);

    let mut games: Vec<DiscoveredGame> = Vec::new();

    for steamapps in &steamapps_dirs {
        let entries = match std::fs::read_dir(steamapps) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.starts_with("appmanifest_") || !fname.ends_with(".acf") {
                continue;
            }

            let content = match std::fs::read_to_string(entry.path()) {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Only include fully installed games (StateFlags bit 2 = installed)
            let flags = vdf_value(&content, "StateFlags")
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or(0);
            if flags & 4 == 0 {
                continue;
            }

            let app_id = match vdf_value(&content, "appid") {
                Some(v) => v,
                None => continue,
            };
            let name = match vdf_value(&content, "name") {
                Some(v) => v,
                None => continue,
            };

            // Skip non-game entries (redistributables, runtimes, SDKs, dedicated servers)
            {
                let lname = name.to_lowercase();
                if lname.contains("redistributable")
                    || lname.contains("runtime")
                    || lname.contains("dedicated server")
                    || lname.contains("sdk")
                    || lname.contains("steamworks")
                    || lname.contains("directx")
                    || lname.contains("vcredist")
                {
                    continue;
                }
            }
            let installdir = match vdf_value(&content, "installdir") {
                Some(v) => v,
                None => continue,
            };

            let install_path = steamapps.join("common").join(&installdir);
            let exe_path = find_main_exe(&install_path);

            games.push(DiscoveredGame {
                app_id,
                name,
                install_dir: install_path.to_string_lossy().to_string(),
                exe_path,
            });
        }
    }

    games.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(games)
}

/// Scan Steam, create draft `GameProfile`s for games not yet in the library,
/// and return the full (updated) profile list.
#[tauri::command]
pub fn discover_and_create_steam_drafts() -> Result<Vec<GameProfile>, String> {
    let discovered = discover_steam_games()?;
    let mut profiles = load_profiles();
    let mut added = 0usize;

    for game in discovered {
        // Find a matching existing profile (by exe_path or by name+launcher)
        let existing_idx = if let Some(ref exe) = game.exe_path {
            profiles.iter().position(|p| !p.exe_path.is_empty() && p.exe_path == *exe)
        } else {
            profiles.iter().position(|p| {
                p.name.to_lowercase() == game.name.to_lowercase()
                    && p.launcher.as_deref() == Some("steam")
            })
        };

        if let Some(idx) = existing_idx {
            // Backfill steam_app_id into existing profiles that are missing it
            if profiles[idx].steam_app_id.is_none() {
                profiles[idx].steam_app_id = Some(game.app_id);
                added += 1;
            }
            continue;
        }

        profiles.push(GameProfile {
            id: uuid::Uuid::new_v4().to_string(),
            name: game.name,
            exe_path: game.exe_path.unwrap_or_default(),
            tags: vec![],
            kill_bloatware: false,
            power_plan: "none".to_string(),
            windows_preset: "none".to_string(),
            storage_mode: "none".to_string(),
            network_mode: "none".to_string(),
            dns_preset: "none".to_string(),
            recommended_mode: None,
            recommended_reason: None,
            launcher: Some("steam".to_string()),
            steam_app_id: Some(game.app_id),
        });

        added += 1;
    }

    if added > 0 {
        save_profiles(&profiles)?;
    }

    Ok(profiles)
}
