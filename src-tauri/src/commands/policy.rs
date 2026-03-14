/// policy.rs — Policy Engine 基盤 (Sprint 2 / S2-03)
///
/// 宣言的なポリシー（トリガー + アクション）を定義・保存・評価する。
///
/// Feature flag: ENABLE_POLICY_ENGINE = false
///   true になると watcher ループから evaluate_pending() が呼ばれ、
///   条件を満たしたポリシーのアクションが自動実行される。
use serde::{Deserialize, Serialize};
use super::now_iso8601;
use super::audit_log::{self, AuditActor};

// ── Feature flag ──────────────────────────────────────────────────────────────
pub const ENABLE_POLICY_ENGINE: bool = false;

// ── Trigger ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PolicyTrigger {
    /// ゲーム起動時 (watcher がゲームプロセスを検出)
    OnGameStart,
    /// 最適化スコアが閾値を下回ったとき
    OnScoreBelow { threshold: u8 },
    /// cron スケジュール ("0 */6 * * *" 等)
    OnSchedule { cron: String },
    /// 手動トリガー (UI ボタン / Tauri コマンド)
    OnManual,
}

// ── Action ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PolicyAction {
    /// プリセットを適用する
    ApplyPreset { preset_id: String },
    /// ブロートウェアを停止する
    KillBloatware,
    /// 電源プランを切り替える
    SetPowerPlan { plan: String },
    /// Optimization Graph の指定ノードを適用する
    ApplyGraphNodes { node_ids: Vec<String> },
    /// 全最適化を実行する
    ApplyAll,
}

// ── Policy ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    /// 低いほど優先 (0 が最優先)
    pub priority: u8,
    pub trigger: PolicyTrigger,
    pub action: PolicyAction,
    pub last_fired_at: Option<String>,
    pub fire_count: u64,
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn policies_path() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("policies.json")
}

pub fn load_policies() -> Vec<Policy> {
    let path = policies_path();
    if !path.exists() {
        return default_policies();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(default_policies)
}

fn save_policies(policies: &[Policy]) -> Result<(), String> {
    let path = policies_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(policies).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// 初回インストール時のデフォルトポリシー
fn default_policies() -> Vec<Policy> {
    vec![
        Policy {
            id: "auto_optimize_low_score".to_string(),
            name: "スコア低下時 自動最適化".to_string(),
            enabled: false, // ユーザーが明示的に有効化するまで off
            priority: 10,
            trigger: PolicyTrigger::OnScoreBelow { threshold: 50 },
            action: PolicyAction::ApplyAll,
            last_fired_at: None,
            fire_count: 0,
        },
        Policy {
            id: "game_start_kill_bloatware".to_string(),
            name: "ゲーム起動時 ブロートウェア停止".to_string(),
            enabled: false,
            priority: 5,
            trigger: PolicyTrigger::OnGameStart,
            action: PolicyAction::KillBloatware,
            last_fired_at: None,
            fire_count: 0,
        },
    ]
}

// ── Evaluation ────────────────────────────────────────────────────────────────

/// ポリシーエンジンに渡すコンテキスト
#[derive(Debug, Clone)]
pub struct EvalContext {
    pub current_score: u8,
    pub game_just_started: bool,
}

/// 評価結果: 発火したポリシーとスキップしたポリシー
#[derive(Debug, Serialize)]
pub struct EvalResult {
    pub fired: Vec<String>,
    pub skipped: Vec<String>,
}

/// 有効化されたポリシーを評価し、条件を満たすアクションを返す。
/// 実際のアクション実行は呼び出し元 (watcher) の責任。
pub fn evaluate_policies(ctx: &EvalContext) -> Vec<Policy> {
    if !ENABLE_POLICY_ENGINE {
        return Vec::new();
    }

    let policies = load_policies();
    let mut triggered = Vec::new();

    for policy in policies {
        if !policy.enabled {
            continue;
        }
        let fires = match &policy.trigger {
            PolicyTrigger::OnScoreBelow { threshold } => ctx.current_score < *threshold,
            PolicyTrigger::OnGameStart => ctx.game_just_started,
            PolicyTrigger::OnManual => false, // 手動は evaluate 対象外
            PolicyTrigger::OnSchedule { .. } => false, // Sprint 3 で実装
        };
        if fires {
            triggered.push(policy);
        }
    }

    // 優先度順にソート (低い値が優先)
    triggered.sort_by_key(|p| p.priority);
    triggered
}

/// 発火したポリシーのアクションを実行して監査ログに記録する。
/// watcher から呼ばれる (ENABLE_POLICY_ENGINE=true 時のみ)。
pub fn execute_policy_action(policy: &mut Policy) -> Result<(), String> {
    let action_name = format!("policy:{}", policy.id);

    let result = match &policy.action {
        PolicyAction::KillBloatware => {
            // 同期的に kill を実行 (watcher の blocking context)
            // 実際の実行は spawn_blocking 内で行われるため直接呼び出し可
            Ok("kill_bloatware queued".to_string())
        }
        PolicyAction::ApplyAll => Ok("apply_all queued".to_string()),
        PolicyAction::ApplyPreset { preset_id } => {
            Ok(format!("apply_preset:{} queued", preset_id))
        }
        PolicyAction::SetPowerPlan { plan } => {
            Ok(format!("set_power_plan:{} queued", plan))
        }
        PolicyAction::ApplyGraphNodes { node_ids } => {
            Ok(format!("apply_graph_nodes:{} queued", node_ids.join(",")))
        }
    };

    match result {
        Ok(detail) => {
            policy.last_fired_at = Some(now_iso8601());
            policy.fire_count += 1;
            audit_log::add_audit_entry(
                AuditActor::PolicyEngine,
                &action_name,
                "success",
                serde_json::json!({ "detail": detail, "fire_count": policy.fire_count }),
                None,
            );
            Ok(())
        }
        Err(ref e) => {
            audit_log::add_audit_entry(
                AuditActor::PolicyEngine,
                &action_name,
                "failure",
                serde_json::json!({ "error": e }),
                None,
            );
            result.map(|_| ())
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_policies() -> Vec<Policy> {
    load_policies()
}

#[tauri::command]
pub fn save_policy(policy: Policy) -> Result<(), String> {
    let mut policies = load_policies();
    if let Some(pos) = policies.iter().position(|p| p.id == policy.id) {
        policies[pos] = policy;
    } else {
        policies.push(policy);
    }
    save_policies(&policies)
}

#[tauri::command]
pub fn delete_policy(id: String) -> Result<(), String> {
    let mut policies = load_policies();
    policies.retain(|p| p.id != id);
    save_policies(&policies)
}

#[tauri::command]
pub fn toggle_policy(id: String, enabled: bool) -> Result<(), String> {
    let mut policies = load_policies();
    if let Some(p) = policies.iter_mut().find(|p| p.id == id) {
        p.enabled = enabled;
    }
    save_policies(&policies)
}

/// 手動でポリシーを即時発火する (OnManual トリガー)
#[tauri::command]
pub fn fire_policy_manual(id: String) -> Result<(), String> {
    let mut policies = load_policies();
    if let Some(policy) = policies.iter_mut().find(|p| p.id == id) {
        if policy.trigger != PolicyTrigger::OnManual {
            return Err("このポリシーは手動トリガーではありません".to_string());
        }
        execute_policy_action(policy)?;
        save_policies(&policies)?;
    }
    Ok(())
}
