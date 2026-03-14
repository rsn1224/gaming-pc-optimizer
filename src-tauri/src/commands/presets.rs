use super::rollback::{self, ChangeRecord, RiskLevel, SessionMode};
use serde::{Deserialize, Serialize};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PresetKind {
    Esports,
    Streaming,
    Quiet,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PresetInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub risk_level: RiskLevel,
    pub steps: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PresetResult {
    pub preset: String,
    pub process_killed: usize,
    pub process_freed_mb: f64,
    pub power_plan_set: bool,
    pub windows_applied: bool,
    pub network_applied: bool,
    pub errors: Vec<String>,
}

// ── Preset definitions ────────────────────────────────────────────────────────

/// Processes kept alive for Streaming preset (voice / overlay tools).
const STREAMING_KEEP: &[&str] = &["Discord.exe", "Slack.exe"];

pub fn get_preset_infos() -> Vec<PresetInfo> {
    vec![
        PresetInfo {
            id: "esports".to_string(),
            name: "eスポーツ".to_string(),
            description: "最高FPS・最低遅延を追求。全ブロートウェア停止・Ultimate Performance・ネットワーク最適化を完全適用します。".to_string(),
            tags: vec!["FPS".to_string(), "バトルロイヤル".to_string(), "低遅延".to_string()],
            risk_level: RiskLevel::Advanced,
            steps: vec![
                "全ブロートウェア停止".to_string(),
                "Ultimate Performance 電源プラン".to_string(),
                "Windows 視覚効果・Game DVR 無効化".to_string(),
                "Nagle無効化・NetworkThrottling無効（管理者権限）".to_string(),
            ],
        },
        PresetInfo {
            id: "streaming".to_string(),
            name: "配信".to_string(),
            description: "ゲームと配信を両立。Discord等の配信ツールは維持しつつ不要プロセスを停止。High Performance で安定エンコード。".to_string(),
            tags: vec!["配信".to_string(), "OBS".to_string(), "バランス".to_string()],
            risk_level: RiskLevel::Caution,
            steps: vec![
                "配信ツール以外のブロートウェア停止".to_string(),
                "High Performance 電源プラン".to_string(),
                "Game DVR・メニュー遅延のみ最適化（アニメーション維持）".to_string(),
            ],
        },
        PresetInfo {
            id: "quiet".to_string(),
            name: "省電力・静音".to_string(),
            description: "発熱・騒音を最小化。バックグラウンド更新サービスのみ停止し Balanced プランで静かに動作。".to_string(),
            tags: vec!["省電力".to_string(), "静音".to_string(), "安全".to_string()],
            risk_level: RiskLevel::Safe,
            steps: vec![
                "バックグラウンド更新プロセスのみ停止".to_string(),
                "Balanced 電源プラン".to_string(),
            ],
        },
    ]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn set_power_plan_by_guid(guid: &str) -> Result<(), String> {
    let out = crate::win_cmd!("powercfg")
        .args(["/setactive", guid])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_presets() -> Vec<PresetInfo> {
    get_preset_infos()
}

#[tauri::command]
pub async fn apply_preset(preset: String) -> Result<PresetResult, String> {
    let kind = match preset.as_str() {
        "esports" => PresetKind::Esports,
        "streaming" => PresetKind::Streaming,
        "quiet" => PresetKind::Quiet,
        _ => return Err(format!("不明なプリセット: {}", preset)),
    };

    let mut result = PresetResult {
        preset: preset.clone(),
        process_killed: 0,
        process_freed_mb: 0.0,
        power_plan_set: false,
        windows_applied: false,
        network_applied: false,
        errors: Vec::new(),
    };

    // ── Rollback session ──────────────────────────────────────────────────
    let session_id: Option<String> = if rollback::ROLLBACK_CONFIG.enabled {
        tokio::task::spawn_blocking(|| rollback::begin_session(SessionMode::Real, None))
            .await
            .ok()
            .map(|s| s.id)
    } else {
        None
    };

    // ── Step 1: Kill processes ────────────────────────────────────────────
    let keep: std::collections::HashSet<&'static str> = match kind {
        PresetKind::Esports => std::collections::HashSet::new(),
        PresetKind::Streaming => STREAMING_KEEP.iter().cloned().collect(),
        PresetKind::Quiet => super::process::BLOATWARE_PROCESSES
            .iter()
            .cloned()
            .collect(), // keep all — we provide our own list below
    };

    let targets_opt: Option<Vec<String>> = match kind {
        PresetKind::Esports => None, // kill everything in the list
        PresetKind::Streaming => {
            let targets = super::process::BLOATWARE_PROCESSES
                .iter()
                .filter(|&&name| !keep.contains(name))
                .map(|s| s.to_string())
                .collect();
            Some(targets)
        }
        PresetKind::Quiet => Some(vec![
            // Only background updaters — not communication or media apps
            "MicrosoftEdgeUpdate.exe".to_string(),
            "GoogleUpdate.exe".to_string(),
            "AdobeUpdateService.exe".to_string(),
            "AdobeARM.exe".to_string(),
            "CCXProcess.exe".to_string(),
            "jusched.exe".to_string(),
            "iTunesHelper.exe".to_string(),
            "HPTouchpointAnalyticsService.exe".to_string(),
        ]),
    };

    match super::process::kill_bloatware(targets_opt).await {
        Ok(r) => {
            result.process_killed = r.killed.len();
            result.process_freed_mb = r.freed_memory_mb;
        }
        Err(e) => result.errors.push(format!("プロセス停止: {}", e)),
    }

    // ── Step 2: Power plan ────────────────────────────────────────────────
    match kind {
        PresetKind::Esports => match super::power::set_ultimate_performance().await {
            Ok(_) => result.power_plan_set = true,
            Err(e) => result.errors.push(format!("電源プラン: {}", e)),
        },
        PresetKind::Streaming => {
            // High Performance: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
            match tokio::task::spawn_blocking(|| {
                set_power_plan_by_guid("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c")
            })
            .await
            {
                Ok(Ok(_)) => result.power_plan_set = true,
                Ok(Err(e)) => result.errors.push(format!("電源プラン: {}", e)),
                Err(e) => result.errors.push(format!("電源プラン(spawn): {}", e)),
            }
        }
        PresetKind::Quiet => {
            // Balanced: 381b4222-f694-41f0-9685-ff5bb260df2e
            match tokio::task::spawn_blocking(|| {
                set_power_plan_by_guid("381b4222-f694-41f0-9685-ff5bb260df2e")
            })
            .await
            {
                Ok(Ok(_)) => result.power_plan_set = true,
                Ok(Err(e)) => result.errors.push(format!("電源プラン: {}", e)),
                Err(e) => result.errors.push(format!("電源プラン(spawn): {}", e)),
            }
        }
    }

    // ── Step 3: Windows settings ─────────────────────────────────────────
    match kind {
        PresetKind::Esports => {
            match tokio::task::spawn_blocking(
                super::windows_settings::apply_gaming_windows_settings,
            )
            .await
            {
                Ok(Ok(_)) => result.windows_applied = true,
                Ok(Err(e)) => result.errors.push(format!("Windows設定: {}", e)),
                Err(e) => result.errors.push(format!("Windows設定(spawn): {}", e)),
            }
        }
        PresetKind::Streaming => {
            // Partial: disable Game DVR + zero menu delay, keep transparency + animations
            let streaming_ws = super::windows_settings::WindowsSettings {
                visual_fx: 0,          // auto
                transparency: false,   // minor tweak, no distractions
                game_dvr: false,       // always worth disabling
                menu_show_delay: 0,    // instant
                animate_windows: true, // keep for visual quality on stream
            };
            match tokio::task::spawn_blocking(move || {
                super::windows_settings::apply_windows_preset(streaming_ws)
            })
            .await
            {
                Ok(Ok(_)) => result.windows_applied = true,
                Ok(Err(e)) => result.errors.push(format!("Windows設定: {}", e)),
                Err(e) => result.errors.push(format!("Windows設定(spawn): {}", e)),
            }
        }
        PresetKind::Quiet => {
            // No Windows setting changes for quiet mode
        }
    }

    // ── Step 4: Network ───────────────────────────────────────────────────
    match kind {
        PresetKind::Esports => {
            match tokio::task::spawn_blocking(super::network::apply_network_gaming).await {
                Ok(Ok(_)) => result.network_applied = true,
                Ok(Err(e)) => result.errors.push(format!("ネットワーク: {}", e)),
                Err(e) => result.errors.push(format!("ネットワーク(spawn): {}", e)),
            }
        }
        // Nagle disable can hurt streaming upload stability; skip for both
        PresetKind::Streaming | PresetKind::Quiet => {}
    }

    // ── Finalize rollback session ─────────────────────────────────────────
    if let Some(ref sid) = session_id {
        if let Ok(mut session) = rollback::load_session(sid) {
            let snapshot = &session.snapshot;
            let power_after = match kind {
                PresetKind::Esports => "ultimate_performance",
                PresetKind::Streaming => "high_performance",
                PresetKind::Quiet => "balanced",
            };

            let mut changes = vec![
                ChangeRecord {
                    category: "process".to_string(),
                    target: format!("{} プロセス停止", preset),
                    before: serde_json::Value::Null,
                    after: serde_json::json!({
                        "killed": result.process_killed,
                        "freed_mb": result.process_freed_mb
                    }),
                    risk_level: RiskLevel::Safe,
                    applied: result.process_killed > 0,
                },
                ChangeRecord {
                    category: "power".to_string(),
                    target: "電源プラン".to_string(),
                    before: snapshot
                        .power_plan_guid
                        .as_deref()
                        .map(serde_json::Value::from)
                        .unwrap_or(serde_json::Value::Null),
                    after: serde_json::json!(power_after),
                    risk_level: RiskLevel::Caution,
                    applied: result.power_plan_set,
                },
            ];

            if matches!(kind, PresetKind::Esports | PresetKind::Streaming) {
                changes.push(ChangeRecord {
                    category: "windows".to_string(),
                    target: "Windows設定".to_string(),
                    before: snapshot
                        .windows_settings
                        .clone()
                        .unwrap_or(serde_json::Value::Null),
                    after: serde_json::json!({ "preset": preset }),
                    risk_level: RiskLevel::Caution,
                    applied: result.windows_applied,
                });
            }
            if matches!(kind, PresetKind::Esports) {
                changes.push(ChangeRecord {
                    category: "network".to_string(),
                    target: "ネットワーク最適化".to_string(),
                    before: snapshot
                        .network_settings
                        .clone()
                        .unwrap_or(serde_json::Value::Null),
                    after: serde_json::json!({ "preset": "gaming" }),
                    risk_level: RiskLevel::Advanced,
                    applied: result.network_applied,
                });
            }

            let summary = serde_json::to_value(&result).unwrap_or(serde_json::Value::Null);
            let success = result.errors.is_empty();
            rollback::complete_session(&mut session, changes, summary, success);
            rollback::save_session(&session).ok();
        }

        let sid_clone = sid.clone();
        tokio::task::spawn_blocking(move || {
            let after = super::metrics::capture_metrics();
            rollback::update_metrics_after(&sid_clone, after);
        })
        .await
        .ok();
    }

    super::log_observation(
        "apply_preset",
        serde_json::to_value(&result).unwrap_or(serde_json::Value::Null),
    );
    Ok(result)
}
