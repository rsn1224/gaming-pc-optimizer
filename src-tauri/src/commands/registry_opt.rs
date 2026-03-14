use serde::{Deserialize, Serialize};
use winreg::{enums::*, RegKey};

#[derive(Serialize, Deserialize, Clone)]
pub struct RegTweak {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub risk_level: String,
    pub current_value: String,
    pub recommended_value: String,
    pub is_applied: bool,
    pub hive: String,
    pub key_path: String,
    pub value_name: String,
    pub value_type: String,
    pub value_data: String,
}

#[derive(Serialize, Deserialize)]
pub struct RegTweakResult {
    pub applied: Vec<String>,
    pub failed: Vec<String>,
}

struct TweakDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    category: &'static str,
    risk_level: &'static str,
    recommended_value: &'static str,
    hive: &'static str,
    key_path: &'static str,
    value_name: &'static str,
    value_type: &'static str,
    value_data: &'static str,
}

static TWEAKS: &[TweakDef] = &[
    TweakDef {
        id: "game_dvr_disable",
        name: "Game DVR 無効化",
        description: "Windowsのゲームキャプチャ機能を無効化してパフォーマンスを向上させます",
        category: "gaming",
        risk_level: "safe",
        recommended_value: "0 (無効)",
        hive: "HKCU",
        key_path: "System\\GameConfigStore",
        value_name: "GameDVR_Enabled",
        value_type: "DWORD",
        value_data: "0",
    },
    TweakDef {
        id: "network_throttling_disable",
        name: "ネットワークスロットリング無効化",
        description: "マルチメディアアプリのネットワーク帯域制限を解除してレイテンシを改善します",
        category: "network",
        risk_level: "safe",
        recommended_value: "4294967295 (無効)",
        hive: "HKLM",
        key_path: "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile",
        value_name: "NetworkThrottlingIndex",
        value_type: "DWORD",
        value_data: "4294967295",
    },
    TweakDef {
        id: "system_responsiveness",
        name: "システム応答性最大化",
        description: "システムリソースをゲームに優先配分してフレームレートを安定させます",
        category: "gaming",
        risk_level: "safe",
        recommended_value: "0 (ゲーム優先)",
        hive: "HKLM",
        key_path: "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile",
        value_name: "SystemResponsiveness",
        value_type: "DWORD",
        value_data: "0",
    },
    TweakDef {
        id: "gpu_priority",
        name: "GPUスケジューリング優先度",
        description: "ゲームのGPUスケジューリング優先度を最高に設定します",
        category: "gaming",
        risk_level: "safe",
        recommended_value: "8 (最高)",
        hive: "HKLM",
        key_path: "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games",
        value_name: "GPU Priority",
        value_type: "DWORD",
        value_data: "8",
    },
    TweakDef {
        id: "cpu_priority_games",
        name: "ゲームCPU優先度設定",
        description: "ゲームのCPU優先度を高に設定してフレームタイムを改善します",
        category: "gaming",
        risk_level: "safe",
        recommended_value: "6 (高)",
        hive: "HKLM",
        key_path: "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games",
        value_name: "Priority",
        value_type: "DWORD",
        value_data: "6",
    },
    TweakDef {
        id: "sfx_disable",
        name: "システムサウンド効果無効化",
        description: "Windowsのシステムサウンドを無効化してCPU負荷を軽減します",
        category: "system",
        risk_level: "safe",
        recommended_value: ".None (無効)",
        hive: "HKCU",
        key_path: "AppEvents\\Schemes",
        value_name: "(Default)",
        value_type: "STRING",
        value_data: ".None",
    },
    TweakDef {
        id: "menu_delay_zero",
        name: "メニュー表示遅延ゼロ化",
        description: "右クリックメニューなどの表示遅延を0msにして操作感を向上させます",
        category: "visual",
        risk_level: "safe",
        recommended_value: "0ms",
        hive: "HKCU",
        key_path: "Control Panel\\Desktop",
        value_name: "MenuShowDelay",
        value_type: "STRING",
        value_data: "0",
    },
    TweakDef {
        id: "nagle_disable",
        name: "Nagleアルゴリズム無効化",
        description: "TCP送信の遅延を排除してオンラインゲームのping値を改善します（注意：一部環境に影響あり）",
        category: "network",
        risk_level: "caution",
        recommended_value: "1 (無効)",
        hive: "HKLM",
        key_path: "SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces",
        value_name: "TcpAckFrequency",
        value_type: "DWORD",
        value_data: "1",
    },
    TweakDef {
        id: "large_system_cache",
        name: "大容量システムキャッシュ無効化",
        description: "システムキャッシュよりもアプリに多くのRAMを割り当てます",
        category: "system",
        risk_level: "safe",
        recommended_value: "0",
        hive: "HKLM",
        key_path: "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management",
        value_name: "LargeSystemCache",
        value_type: "DWORD",
        value_data: "0",
    },
    TweakDef {
        id: "disable_prefetch",
        name: "SSDプリフェッチ最適化",
        description: "SSD環境でのプリフェッチを無効化してディスク書き込みを削減します",
        category: "system",
        risk_level: "caution",
        recommended_value: "0 (SSD向け無効化)",
        hive: "HKLM",
        key_path: "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters",
        value_name: "EnablePrefetcher",
        value_type: "DWORD",
        value_data: "0",
    },
];

fn open_hive(hive: &str) -> Result<RegKey, String> {
    match hive {
        "HKCU" => Ok(RegKey::predef(HKEY_CURRENT_USER)),
        "HKLM" => Ok(RegKey::predef(HKEY_LOCAL_MACHINE)),
        _ => Err(format!("Unknown hive: {}", hive)),
    }
}

fn read_current_value(def: &TweakDef) -> (String, bool) {
    // Special handling for Nagle: iterate interface subkeys
    if def.id == "nagle_disable" {
        let hive = match open_hive(def.hive) {
            Ok(h) => h,
            Err(_) => return ("アクセス拒否".to_string(), false),
        };
        let interfaces = match hive.open_subkey(def.key_path) {
            Ok(k) => k,
            Err(_) => return ("未設定".to_string(), false),
        };
        for subkey_name in interfaces.enum_keys().flatten() {
            if let Ok(subkey) = interfaces.open_subkey(&subkey_name) {
                if let Ok(val) = subkey.get_value::<u32, _>(def.value_name) {
                    let current_str = val.to_string();
                    let is_applied = current_str == def.value_data;
                    return (current_str, is_applied);
                }
            }
        }
        return ("未設定".to_string(), false);
    }

    let hive = match open_hive(def.hive) {
        Ok(h) => h,
        Err(_) => return ("アクセス拒否".to_string(), false),
    };

    let key = match hive.open_subkey(def.key_path) {
        Ok(k) => k,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                return ("アクセス拒否".to_string(), false);
            }
            return ("未設定".to_string(), false);
        }
    };

    match def.value_type {
        "DWORD" => match key.get_value::<u32, _>(def.value_name) {
            Ok(v) => {
                let current_str = v.to_string();
                let is_applied = current_str == def.value_data;
                (current_str, is_applied)
            }
            Err(_) => ("未設定".to_string(), false),
        },
        "STRING" => match key.get_value::<String, _>(def.value_name) {
            Ok(v) => {
                let is_applied = v == def.value_data;
                (v, is_applied)
            }
            Err(_) => ("未設定".to_string(), false),
        },
        _ => ("未設定".to_string(), false),
    }
}

fn apply_tweak_def(def: &TweakDef) -> Result<(), String> {
    if def.id == "nagle_disable" {
        let hive = open_hive(def.hive)?;
        let interfaces = hive
            .open_subkey(def.key_path)
            .map_err(|e| format!("キーを開けません: {}", e))?;
        let mut applied = false;
        for subkey_name in interfaces.enum_keys().flatten() {
            if let Ok(subkey) = interfaces.open_subkey_with_flags(&subkey_name, KEY_SET_VALUE) {
                let val: u32 = def
                    .value_data
                    .parse()
                    .map_err(|e| format!("値の解析失敗: {}", e))?;
                if subkey.set_value(def.value_name, &val).is_ok() {
                    applied = true;
                }
            }
        }
        if applied {
            return Ok(());
        } else {
            return Err("書き込み可能なインターフェースが見つかりません".to_string());
        }
    }

    let hive = open_hive(def.hive)?;
    let (key, _) = hive
        .create_subkey(def.key_path)
        .map_err(|e| format!("キーの作成/オープン失敗: {}", e))?;

    match def.value_type {
        "DWORD" => {
            let val: u32 = def
                .value_data
                .parse()
                .map_err(|e| format!("値の解析失敗: {}", e))?;
            key.set_value(def.value_name, &val)
                .map_err(|e| format!("値の書き込み失敗: {}", e))?;
        }
        "STRING" => {
            key.set_value(def.value_name, &def.value_data)
                .map_err(|e| format!("値の書き込み失敗: {}", e))?;
        }
        _ => return Err(format!("不明な値タイプ: {}", def.value_type)),
    }

    Ok(())
}

fn revert_tweak_def(def: &TweakDef) -> Result<(), String> {
    if def.id == "nagle_disable" {
        let hive = open_hive(def.hive)?;
        let interfaces = match hive.open_subkey(def.key_path) {
            Ok(k) => k,
            Err(_) => return Ok(()),
        };
        for subkey_name in interfaces.enum_keys().flatten() {
            if let Ok(subkey) = interfaces.open_subkey_with_flags(&subkey_name, KEY_SET_VALUE) {
                subkey.delete_value(def.value_name).ok();
            }
        }
        return Ok(());
    }

    let hive = open_hive(def.hive)?;
    let key = match hive.open_subkey_with_flags(def.key_path, KEY_SET_VALUE) {
        Ok(k) => k,
        Err(_) => return Ok(()), // key doesn't exist, nothing to revert
    };
    key.delete_value(def.value_name).ok(); // ignore "not found" errors
    Ok(())
}

#[tauri::command]
pub fn get_registry_tweaks() -> Result<Vec<RegTweak>, String> {
    let tweaks = TWEAKS
        .iter()
        .map(|def| {
            let (current_value, is_applied) = read_current_value(def);
            RegTweak {
                id: def.id.to_string(),
                name: def.name.to_string(),
                description: def.description.to_string(),
                category: def.category.to_string(),
                risk_level: def.risk_level.to_string(),
                current_value,
                recommended_value: def.recommended_value.to_string(),
                is_applied,
                hive: def.hive.to_string(),
                key_path: def.key_path.to_string(),
                value_name: def.value_name.to_string(),
                value_type: def.value_type.to_string(),
                value_data: def.value_data.to_string(),
            }
        })
        .collect();
    Ok(tweaks)
}

#[tauri::command]
pub fn apply_registry_tweak(id: String) -> Result<(), String> {
    let def = TWEAKS
        .iter()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("不明なtweak ID: {}", id))?;
    apply_tweak_def(def)
}

#[tauri::command]
pub fn revert_registry_tweak(id: String) -> Result<(), String> {
    let def = TWEAKS
        .iter()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("不明なtweak ID: {}", id))?;
    revert_tweak_def(def)
}

#[tauri::command]
pub fn apply_all_safe_tweaks() -> Result<RegTweakResult, String> {
    let mut applied = Vec::new();
    let mut failed = Vec::new();

    for def in TWEAKS.iter().filter(|d| d.risk_level == "safe") {
        match apply_tweak_def(def) {
            Ok(_) => applied.push(def.id.to_string()),
            Err(e) => failed.push(format!("{}: {}", def.id, e)),
        }
    }

    Ok(RegTweakResult { applied, failed })
}
