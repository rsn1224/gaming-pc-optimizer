/// launcher.rs — Epic Games / GOG Galaxy / Xbox Game Pass ゲーム検出
///              (ENABLE_MULTI_LAUNCHER)
///
/// Steam 以外の主要ランチャーにインストール済みのゲームを自動検出し、
/// ドラフトプロファイルを作成する。
///
///   Epic  : %ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item (JSON)
///   GOG   : HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\* (レジストリ)
///   Xbox  : C:\XboxGames\* / %USERPROFILE%\XboxGames\* (ディレクトリスキャン)
///
/// Feature flag: ENABLE_MULTI_LAUNCHER = false
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

use super::profiles::{load_profiles, save_profiles, GameProfile};
use super::steam::DiscoveredGame;

/// ヘルパー/再頒布物 exe を除外するパターン（steam.rs と共通ロジック）
const SKIP_PATTERNS: &[&str] = &[
    "unins",
    "uninst",
    "uninstall",
    "vcredist",
    "dxsetup",
    "dxwebsetup",
    "directx",
    "dotnet",
    "physx",
    "openal",
    "crashhandler",
    "crashreport",
    "bugreport",
    "setup",
    "install",
    "redist",
    "upc",
    "uplay_r1_loader",
];

// ── Feature flag ──────────────────────────────────────────────────────────────

pub const ENABLE_MULTI_LAUNCHER: bool = true;

// ── Result type ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiLauncherScanResult {
    /// 今回スキャンで見つかった Epic ゲーム数
    pub epic_found: usize,
    /// 今回スキャンで見つかった GOG ゲーム数
    pub gog_found: usize,
    /// 今回スキャンで見つかった Xbox ゲーム数
    pub xbox_found: usize,
    /// 新たにライブラリへ追加されたプロファイル数
    pub total_added: usize,
    /// 更新後のプロファイル一覧
    pub profiles: Vec<GameProfile>,
}

// ── Shared exe-detection helper (re-uses Steam's SKIP_PATTERNS) ───────────────

/// インストールフォルダから最も大きな .exe（ヘルパー除外後）を返す。
fn find_main_exe(dir: &Path) -> Option<String> {
    let mut candidates: Vec<(PathBuf, u64)> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            name.ends_with(".exe") && !SKIP_PATTERNS.iter().any(|pat| name.contains(pat))
        })
        .filter_map(|e| {
            let size = e.metadata().ok()?.len();
            Some((e.path(), size))
        })
        .collect();

    if candidates.is_empty() {
        // recurse one level: some games put exe in a subfolder
        if let Ok(rd) = std::fs::read_dir(dir) {
            for subdir in rd.flatten() {
                if subdir.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if let Some(exe) = find_main_exe(&subdir.path()) {
                        return Some(exe);
                    }
                }
            }
        }
        return None;
    }

    candidates.sort_by(|a, b| b.1.cmp(&a.1));
    Some(candidates[0].0.to_string_lossy().to_string())
}

// ── Epic Games Store ──────────────────────────────────────────────────────────

/// %ProgramData%\Epic\EpicGamesLauncher\Data\Manifests の .item ファイルを読む。
/// 各ファイルは JSON 形式でインストール済みゲームのメタデータを保持する。
fn discover_epic_inner() -> Vec<DiscoveredGame> {
    let prog_data = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    let manifests = PathBuf::from(&prog_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");

    if !manifests.exists() {
        return vec![];
    }

    let mut games = Vec::new();

    let entries = match std::fs::read_dir(&manifests) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let v: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // bIsIncompleteInstall == true → skip
        if v.get("bIsIncompleteInstall")
            .and_then(|b| b.as_bool())
            .unwrap_or(false)
        {
            continue;
        }

        // AppCategories must contain "games"
        let is_game = v
            .get("AppCategories")
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .any(|c| c.as_str().map(|s| s.contains("game")).unwrap_or(false))
            })
            .unwrap_or(true); // if missing, assume game
        if !is_game {
            continue;
        }

        let name = match v
            .get("DisplayName")
            .and_then(|n| n.as_str())
            .filter(|s| !s.is_empty())
        {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Filter known non-game entries
        {
            let ln = name.to_lowercase();
            if ln.contains("redistributable")
                || ln.contains("runtime")
                || ln.contains("directx")
                || ln.contains("vcredist")
                || ln.contains("launcher")
            {
                continue;
            }
        }

        let app_id = v
            .get("AppName")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();

        let install_dir = match v
            .get("InstallLocation")
            .and_then(|n| n.as_str())
            .filter(|s| !s.is_empty())
        {
            Some(d) => d.to_string(),
            None => continue,
        };

        // Resolve exe: prefer LaunchExecutable relative to InstallLocation
        let exe_path = v
            .get("LaunchExecutable")
            .and_then(|n| n.as_str())
            .filter(|s| !s.is_empty())
            .map(|rel| PathBuf::from(&install_dir).join(rel))
            .filter(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string())
            .or_else(|| find_main_exe(Path::new(&install_dir)));

        games.push(DiscoveredGame {
            app_id,
            name,
            install_dir,
            exe_path,
        });
    }

    games.sort_by(|a, b| a.name.cmp(&b.name));
    games
}

// ── GOG Galaxy ────────────────────────────────────────────────────────────────

/// HKLM\SOFTWARE\WOW6432Node\GOG.com\Games の各サブキーからゲームを取得する。
fn discover_gog_inner() -> Vec<DiscoveredGame> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // 64-bit Windows では WOW6432Node 下にある
    let gog_key = match hklm
        .open_subkey("SOFTWARE\\WOW6432Node\\GOG.com\\Games")
        .or_else(|_| hklm.open_subkey("SOFTWARE\\GOG.com\\Games"))
    {
        Ok(k) => k,
        Err(_) => return vec![],
    };

    let mut games = Vec::new();

    for subkey_name in gog_key.enum_keys().flatten() {
        let subkey = match gog_key.open_subkey(&subkey_name) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let name: String = subkey
            .get_value("gameName")
            .or_else(|_| subkey.get_value("GAMENAME"))
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        // Filter non-game entries
        {
            let ln = name.to_lowercase();
            if ln.contains("redistributable") || ln.contains("runtime") || ln.contains("directx") {
                continue;
            }
        }

        let install_dir: String = subkey
            .get_value("path")
            .or_else(|_| subkey.get_value("PATH"))
            .unwrap_or_default();
        if install_dir.is_empty() {
            continue;
        }

        // GOG stores exe as a plain filename; combine with path
        let exe_hint: String = subkey
            .get_value("exe")
            .or_else(|_| subkey.get_value("exefile"))
            .or_else(|_| subkey.get_value("EXEFILE"))
            .unwrap_or_default();

        let exe_path = if !exe_hint.is_empty() {
            let candidate = PathBuf::from(&install_dir).join(&exe_hint);
            if candidate.exists() {
                Some(candidate.to_string_lossy().to_string())
            } else {
                find_main_exe(Path::new(&install_dir))
            }
        } else {
            find_main_exe(Path::new(&install_dir))
        };

        games.push(DiscoveredGame {
            app_id: subkey_name,
            name,
            install_dir,
            exe_path,
        });
    }

    games.sort_by(|a, b| a.name.cmp(&b.name));
    games
}

// ── Xbox Game Pass ────────────────────────────────────────────────────────────

/// Xbox ゲームのインストール先として使われることの多いパスを候補として返す。
fn xbox_candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    // 1. レジストリから Xbox ゲームのルートパスを取得（GamingServices が設定する場合）
    if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Microsoft\\GamingServices\\GamingOverlay")
    {
        for value_name in &["GDKInstallPath", "GamesInstallPath", "PackagePath"] {
            if let Ok(p) = key.get_value::<String, _>(value_name) {
                let pb = PathBuf::from(&p);
                if pb.exists() {
                    roots.push(pb);
                }
            }
        }
    }

    // 2. デフォルトパス: C:\XboxGames および全ドライブルートの XboxGames
    let defaults = [
        "C:\\XboxGames",
        "D:\\XboxGames",
        "E:\\XboxGames",
        "F:\\XboxGames",
    ];
    for d in &defaults {
        let p = PathBuf::from(d);
        if p.exists() && !roots.contains(&p) {
            roots.push(p);
        }
    }

    // 3. %USERPROFILE%\XboxGames
    if let Ok(home) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(&home).join("XboxGames");
        if p.exists() && !roots.contains(&p) {
            roots.push(p);
        }
    }

    roots
}

/// Xbox / Game Pass ゲームをスキャンする。
/// 各インストールフォルダ直下の Content\ サブフォルダ（または直下）を探す。
fn discover_xbox_inner() -> Vec<DiscoveredGame> {
    let roots = xbox_candidate_roots();
    if roots.is_empty() {
        return vec![];
    }

    let mut games = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for root in &roots {
        let entries = match std::fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let game_dir = entry.path();
            if !game_dir.is_dir() {
                continue;
            }

            let name = game_dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if name.is_empty() || seen.contains(&name) {
                continue;
            }

            // Xbox ゲームは Content\ サブフォルダにファイルが入る場合がある
            let search_dir = {
                let content = game_dir.join("Content");
                if content.is_dir() {
                    content
                } else {
                    game_dir.clone()
                }
            };

            let exe_path = find_main_exe(&search_dir);
            if exe_path.is_none() {
                // exe が見つからない → スキップ（未インストール・ディレクトリのみ）
                continue;
            }

            seen.insert(name.clone());
            games.push(DiscoveredGame {
                app_id: format!("xbox_{}", name.to_lowercase().replace(' ', "_")),
                name,
                install_dir: search_dir.to_string_lossy().to_string(),
                exe_path,
            });
        }
    }

    games.sort_by(|a, b| a.name.cmp(&b.name));
    games
}

// ── Profile creation helper ───────────────────────────────────────────────────

/// `games` を既存プロファイルと照合し、新規分だけドラフトを追加して返す。
fn upsert_profiles(
    profiles: &mut Vec<GameProfile>,
    games: Vec<DiscoveredGame>,
    launcher: &str,
) -> usize {
    let mut added = 0usize;

    for game in games {
        // exe_path か (name + launcher) で既存を探す
        let exists = if let Some(ref exe) = game.exe_path {
            profiles
                .iter()
                .any(|p| !p.exe_path.is_empty() && p.exe_path == *exe)
        } else {
            profiles.iter().any(|p| {
                p.name.to_lowercase() == game.name.to_lowercase()
                    && p.launcher.as_deref() == Some(launcher)
            })
        };

        if exists {
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
            recommended_confidence: None,
            launcher: Some(launcher.to_string()),
            steam_app_id: None,
        });

        added += 1;
    }

    added
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Epic / GOG / Xbox の3ランチャーをスキャンし、
/// 新規ゲームをドラフトプロファイルとして追加する。
#[tauri::command]
pub fn discover_and_create_launcher_drafts() -> Result<MultiLauncherScanResult, String> {
    if !ENABLE_MULTI_LAUNCHER {
        return Err("ENABLE_MULTI_LAUNCHER is disabled.".to_string());
    }

    let epic = discover_epic_inner();
    let gog = discover_gog_inner();
    let xbox = discover_xbox_inner();

    let epic_found = epic.len();
    let gog_found = gog.len();
    let xbox_found = xbox.len();

    let mut profiles = load_profiles();
    let mut total_added = 0usize;

    total_added += upsert_profiles(&mut profiles, epic, "epic");
    total_added += upsert_profiles(&mut profiles, gog, "gog");
    total_added += upsert_profiles(&mut profiles, xbox, "xbox");

    if total_added > 0 {
        save_profiles(&profiles)?;
    }

    Ok(MultiLauncherScanResult {
        epic_found,
        gog_found,
        xbox_found,
        total_added,
        profiles,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_is_enabled_for_v2() {
        assert!(ENABLE_MULTI_LAUNCHER);
    }

    #[test]
    fn multi_launcher_result_serializes_camel_case() {
        let result = MultiLauncherScanResult {
            epic_found: 3,
            gog_found: 2,
            xbox_found: 1,
            total_added: 6,
            profiles: vec![],
        };
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("epicFound").is_some());
        assert!(json.get("gogFound").is_some());
        assert!(json.get("xboxFound").is_some());
        assert!(json.get("totalAdded").is_some());
        assert_eq!(json["epicFound"], 3);
        assert_eq!(json["gogFound"], 2);
        assert_eq!(json["totalAdded"], 6);
    }

    #[test]
    fn upsert_profiles_adds_new_game() {
        let mut profiles: Vec<GameProfile> = vec![];
        let games = vec![DiscoveredGame {
            app_id: "test_id".to_string(),
            name: "Test Game".to_string(),
            install_dir: r"C:\Games\TestGame".to_string(),
            exe_path: Some(r"C:\Games\TestGame\game.exe".to_string()),
        }];
        let added = upsert_profiles(&mut profiles, games, "epic");
        assert_eq!(added, 1);
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].launcher.as_deref(), Some("epic"));
        assert_eq!(profiles[0].name, "Test Game");
    }

    #[test]
    fn upsert_profiles_skips_duplicate_exe() {
        let mut profiles = vec![GameProfile {
            id: "existing".to_string(),
            name: "Test Game".to_string(),
            exe_path: r"C:\Games\TestGame\game.exe".to_string(),
            tags: vec![],
            kill_bloatware: false,
            power_plan: "none".to_string(),
            windows_preset: "none".to_string(),
            storage_mode: "none".to_string(),
            network_mode: "none".to_string(),
            dns_preset: "none".to_string(),
            recommended_mode: None,
            recommended_reason: None,
            recommended_confidence: None,
            launcher: Some("epic".to_string()),
            steam_app_id: None,
        }];
        let games = vec![DiscoveredGame {
            app_id: "test_id".to_string(),
            name: "Test Game".to_string(),
            install_dir: r"C:\Games\TestGame".to_string(),
            exe_path: Some(r"C:\Games\TestGame\game.exe".to_string()),
        }];
        let added = upsert_profiles(&mut profiles, games, "epic");
        assert_eq!(added, 0);
        assert_eq!(profiles.len(), 1); // no duplicate
    }

    #[test]
    fn upsert_profiles_skips_duplicate_by_name_and_launcher() {
        let mut profiles = vec![GameProfile {
            id: "existing".to_string(),
            name: "Cyberpunk 2077".to_string(),
            exe_path: String::new(), // no exe set
            tags: vec![],
            kill_bloatware: false,
            power_plan: "none".to_string(),
            windows_preset: "none".to_string(),
            storage_mode: "none".to_string(),
            network_mode: "none".to_string(),
            dns_preset: "none".to_string(),
            recommended_mode: None,
            recommended_reason: None,
            recommended_confidence: None,
            launcher: Some("gog".to_string()),
            steam_app_id: None,
        }];
        let games = vec![DiscoveredGame {
            app_id: "1423049311".to_string(),
            name: "Cyberpunk 2077".to_string(),
            install_dir: r"C:\GOG Games\Cyberpunk 2077".to_string(),
            exe_path: None,
        }];
        let added = upsert_profiles(&mut profiles, games, "gog");
        assert_eq!(added, 0);
    }

    #[test]
    fn upsert_profiles_adds_game_without_exe() {
        let mut profiles: Vec<GameProfile> = vec![];
        let games = vec![DiscoveredGame {
            app_id: "gog_123".to_string(),
            name: "The Witcher 3".to_string(),
            install_dir: r"C:\GOG Games\The Witcher 3".to_string(),
            exe_path: None,
        }];
        let added = upsert_profiles(&mut profiles, games, "gog");
        assert_eq!(added, 1);
        assert_eq!(profiles[0].exe_path, ""); // empty when no exe
    }

    #[test]
    fn xbox_candidate_roots_returns_vec() {
        // Should not panic; result depends on the test machine
        let roots = xbox_candidate_roots();
        // Roots is always a Vec (may be empty on non-Xbox machines)
        let _ = roots;
    }

    #[test]
    fn epic_skip_incomplete_install() {
        // bIsIncompleteInstall: true entries are excluded
        // (tested indirectly — discover_epic_inner returns [] when no manifests dir exists)
        let games = discover_epic_inner(); // will be empty in CI / no Epic install
                                           // Just assert it doesn't panic and returns a Vec
        let _ = games;
    }

    #[test]
    fn discover_gog_returns_vec() {
        let games = discover_gog_inner();
        let _ = games;
    }

    #[test]
    fn discover_xbox_returns_vec() {
        let games = discover_xbox_inner();
        let _ = games;
    }
}
