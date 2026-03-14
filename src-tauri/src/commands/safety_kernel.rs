use super::{audit_log, optimizer};
/// safety_kernel.rs — Safety Kernel 基盤 (Sprint 1 / S1-04 + S1-05)
///
/// precheck → apply → verify → auto-rollback の 4 フェーズフローを実装する。
/// Sprint 1 では型定義と safe_apply_optimizations の骨格のみ。
/// 実際の verify ロジックは Sprint 2 で実装する。
///
/// Feature flag: ENABLE_SAFETY_KERNEL = false
///   false の場合 safe_apply_optimizations は既存の apply_all_optimizations に
///   フォールスルーし、監査ログのみ追加する。
use serde::{Deserialize, Serialize};

// ── Feature flag ──────────────────────────────────────────────────────────────
pub const ENABLE_SAFETY_KERNEL: bool = true;

// ── Phase enum ────────────────────────────────────────────────────────────────

/// Safety Kernel が遷移するフェーズ（フロントエンド側の SafeApplyPhase と対応）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum SafeApplyPhase {
    Idle,
    Prechecking,
    Applying,
    Verifying,
    Done,
    RolledBack,
}

// ── PreCheck ──────────────────────────────────────────────────────────────────

/// 適用前チェック結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreCheckResult {
    /// チェックが全て通過したか
    pub passed: bool,
    /// 適用をブロックすべき理由のリスト（空なら ok）
    pub blockers: Vec<String>,
    /// 警告（適用は可能だが注意が必要）
    pub warnings: Vec<String>,
    /// バッテリー駆動中か（電源プラン変更時の警告）
    pub on_battery: bool,
    /// 管理者権限があるか（ネットワーク tweaks に必要）
    pub is_admin: bool,
    /// 空きディスク容量 MB（rollback セッション保存に必要）
    pub free_disk_mb: f64,
}

/// 適用前チェックを実行する
pub fn run_prechecks() -> PreCheckResult {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    // ── 管理者権限チェック ──────────────────────────────────────────────────
    let is_admin = is_elevated();
    if !is_admin {
        warnings
            .push("管理者権限がありません。ネットワーク最適化は一部スキップされます。".to_string());
    }

    // ── バッテリー駆動チェック ──────────────────────────────────────────────
    let on_battery = is_on_battery();
    if on_battery {
        warnings.push(
            "バッテリー駆動中です。Ultimate Performance プランへの切替は消費電力が増加します。"
                .to_string(),
        );
    }

    // ── ディスク空き容量チェック (最低 50 MB) ────────────────────────────────
    let free_disk_mb = get_free_disk_mb();
    if free_disk_mb < 50.0 {
        blockers.push(format!(
            "ディスク空き容量が不足しています ({:.0} MB)。最低 50 MB 必要です。",
            free_disk_mb
        ));
    }

    PreCheckResult {
        passed: blockers.is_empty(),
        blockers,
        warnings,
        on_battery,
        is_admin,
        free_disk_mb,
    }
}

// ── Verify ────────────────────────────────────────────────────────────────────

/// 適用後検証結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResult {
    /// 検証が通過したか
    pub passed: bool,
    /// 適用後のスコア (0–100)
    pub score_after: u8,
    /// スコアの変化 (正 = 改善)
    pub score_delta: i16,
    /// 実際に変化が確認できた項目
    pub confirmed_changes: Vec<String>,
    /// 期待した変化が確認できなかった項目
    pub unconfirmed_changes: Vec<String>,
    /// ロールバックを推奨するか
    pub recommend_rollback: bool,
}

/// 適用後の状態を検証する
pub fn run_verify(score_before: u8) -> VerifyResult {
    let score = super::optimizer::compute_optimization_score();
    let score_after = score.overall;
    let score_delta = score_after as i16 - score_before as i16;

    // Sprint 1: 簡易検証のみ — スコアが大幅に下がった場合はロールバック推奨
    let recommend_rollback = score_delta < -20;

    VerifyResult {
        passed: !recommend_rollback,
        score_after,
        score_delta,
        confirmed_changes: Vec::new(),
        unconfirmed_changes: Vec::new(),
        recommend_rollback,
    }
}

// ── safe_apply_optimizations ──────────────────────────────────────────────────

/// Safety Kernel でラップした最適化コマンド。
///
/// ENABLE_SAFETY_KERNEL = false の間は既存の apply_all_optimizations に
/// フォールスルーし、監査ログのみ追記する。
#[tauri::command]
pub async fn safe_apply_optimizations() -> Result<optimizer::AllOptimizationResult, String> {
    if !ENABLE_SAFETY_KERNEL {
        // ── Fallthrough: 既存コマンドを呼び出し、監査ログを追記 ──────────────
        let result = optimizer::apply_all_optimizations().await?;

        // 監査ログに記録
        let result_str = if result.errors.is_empty() {
            "success"
        } else {
            "failure"
        };
        audit_log::add_audit_entry(
            audit_log::AuditActor::User,
            "safe_apply_optimizations",
            result_str,
            serde_json::json!({
                "process_killed": result.process_killed,
                "process_freed_mb": result.process_freed_mb,
                "power_plan_set": result.power_plan_set,
                "windows_applied": result.windows_applied,
                "network_applied": result.network_applied,
                "errors": result.errors,
                "safety_kernel": false,
            }),
            None,
        );

        return Ok(result);
    }

    // ── Full Safety Kernel flow (Sprint 2 で完全実装) ────────────────────────
    // Phase 1: Precheck
    let precheck = tokio::task::spawn_blocking(run_prechecks)
        .await
        .map_err(|e| e.to_string())?;

    if !precheck.passed {
        let msg = precheck.blockers.join("; ");
        audit_log::add_audit_entry(
            audit_log::AuditActor::SafetyKernel,
            "safe_apply_optimizations",
            "skipped",
            serde_json::json!({ "reason": "precheck_failed", "blockers": precheck.blockers }),
            None,
        );
        return Err(format!("プリチェック失敗: {}", msg));
    }

    // Phase 2: Capture score before
    let score_before =
        tokio::task::spawn_blocking(|| optimizer::compute_optimization_score().overall)
            .await
            .map_err(|e| e.to_string())?;

    // Phase 3: Apply
    let result = optimizer::apply_all_optimizations().await?;

    // Phase 4: Verify
    let verify = tokio::task::spawn_blocking(move || run_verify(score_before))
        .await
        .map_err(|e| e.to_string())?;

    let result_str = if result.errors.is_empty() && verify.passed {
        "success"
    } else if verify.recommend_rollback {
        "failure"
    } else {
        "success"
    };

    audit_log::add_audit_entry(
        audit_log::AuditActor::SafetyKernel,
        "safe_apply_optimizations",
        result_str,
        serde_json::json!({
            "process_killed": result.process_killed,
            "power_plan_set": result.power_plan_set,
            "windows_applied": result.windows_applied,
            "network_applied": result.network_applied,
            "errors": result.errors,
            "verify_passed": verify.passed,
            "score_before": score_before,
            "score_after": verify.score_after,
            "score_delta": verify.score_delta,
            "safety_kernel": true,
        }),
        None,
    );

    Ok(result)
}

#[tauri::command]
pub fn run_safety_prechecks() -> PreCheckResult {
    run_prechecks()
}

// ── OS helpers ────────────────────────────────────────────────────────────────

fn is_elevated() -> bool {
    // Windows: `net session` が成功すれば管理者
    crate::win_cmd!("net")
        .args(["session"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn is_on_battery() -> bool {
    // WMIC で BatteryStatus を確認 (AC = 2)
    let out = crate::win_cmd!("wmic")
        .args(["path", "win32_battery", "get", "BatteryStatus"])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            // BatteryStatus: 2 = AC power. 1 = discharging.
            !s.contains('2')
        }
        Err(_) => false, // WMI 失敗 = バッテリーなし (デスクトップ等)
    }
}

fn get_free_disk_mb() -> f64 {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| "C:\\".to_string());
    let drive = appdata.chars().take(3).collect::<String>(); // "C:\"
    let out = crate::win_cmd!("wmic")
        .args([
            "LogicalDisk",
            "where",
            &format!("DeviceID='{}'", &drive[..2]),
            "get",
            "FreeSpace",
        ])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            s.lines()
                .find_map(|l| l.trim().parse::<u64>().ok())
                .map(|b| b as f64 / 1024.0 / 1024.0)
                .unwrap_or(1024.0)
        }
        Err(_) => 1024.0, // デフォルト: 十分あると見なす
    }
}
