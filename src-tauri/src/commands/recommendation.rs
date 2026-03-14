/// recommendation.rs — 本番推奨エンジン V2 エントリーポイント
///
/// Tauri コマンド:
///   - generate_recommendation(payload): RecommendationResult
///   - get_recommendation_metrics(range_hours): MetricsSummary
///
/// Feature flag: ENABLE_RECOMMENDATION_V2 = false (デフォルト OFF)
use crate::commands::{
    ai_metrics::MetricsSummary,
    ai_router,
    ai_safety::{guard_result, SafetyPolicy},
    ai_schema::{RecommendationInput, RecommendationResult},
};

// ── Feature flag ──────────────────────────────────────────────────────────────

pub const ENABLE_RECOMMENDATION_V2: bool = false;

// ── generate_recommendation ───────────────────────────────────────────────────

/// システムスナップショット・ユーザー意図・プロファイル・制約を受け取り、
/// 最適化推奨事項のリストを返す。
///
/// フロー:
///   1. ENABLE_RECOMMENDATION_V2 ガード
///   2. API キー取得 → なければ即フォールバック
///   3. モデル選択 → プロンプト構築 → AI 呼び出し
///   4. レスポンスをパース → Schema Guard → Safety Policy フィルタ
///   5. 失敗時は rule_based フォールバック
///   6. メトリクス記録
#[tauri::command]
pub async fn generate_recommendation(
    payload: RecommendationInput,
) -> Result<RecommendationResult, String> {
    if !ENABLE_RECOMMENDATION_V2 {
        return Err("ENABLE_RECOMMENDATION_V2 is disabled. Set it to true in recommendation.rs to enable the V2 engine.".to_string());
    }

    let start = std::time::Instant::now();

    // API key — no key → immediate rule-based fallback (not an error)
    let api_key = match super::ai::load_api_key() {
        Ok(k) => k,
        Err(_) => {
            let result = ai_router::fallback_rule_based(&payload);
            let latency = start.elapsed().as_millis() as u64;
            super::ai_metrics::record("rule_based_v1", true, latency, true).ok();
            return Ok(result);
        }
    };

    let model = ai_router::select_model(&payload);
    let prompt = ai_router::build_prompt(&payload, model);

    let (result, fallback_used) = match ai_router::call_api(&api_key, model, &prompt, 800).await {
        Ok(text) => match ai_router::parse_response(&text, model) {
            Ok(mut res) => {
                // Schema guard
                if let Err(e) = guard_result(&res) {
                    eprintln!("[recommendation] schema guard failed: {}", e);
                    (ai_router::fallback_rule_based(&payload), true)
                } else {
                    // Safety policy filter
                    let policy = SafetyPolicy::from_constraints(&payload.constraints);
                    res.items = policy.filter(res.items);
                    (res, false)
                }
            }
            Err(e) => {
                eprintln!("[recommendation] parse error: {}", e);
                (ai_router::fallback_rule_based(&payload), true)
            }
        },
        Err(e) => {
            eprintln!("[recommendation] API error: {}", e);
            (ai_router::fallback_rule_based(&payload), true)
        }
    };

    let latency = start.elapsed().as_millis() as u64;
    let recorded_model = result.model.clone();
    super::ai_metrics::record(&recorded_model, true, latency, fallback_used).ok();

    Ok(result)
}

// ── get_recommendation_metrics ────────────────────────────────────────────────

/// モデル別の成功率・失敗率・レイテンシ・フォールバック率を返す。
#[tauri::command]
pub async fn get_recommendation_metrics(
    range_hours: Option<u32>,
) -> Result<MetricsSummary, String> {
    let hours = range_hours.unwrap_or(24);
    tokio::task::spawn_blocking(move || super::ai_metrics::get_summary(hours))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::ai_schema::{Intent, SystemSnapshot};

    fn make_input(intent: Intent) -> RecommendationInput {
        RecommendationInput {
            intent,
            system: SystemSnapshot {
                os_version: "Windows 11".to_string(),
                cpu: Some("Intel i9".to_string()),
                gpu: None,
                memory_gb: Some(16.0),
                is_laptop: Some(false),
                power_plan: None,
            },
            profile: None,
            constraints: None,
        }
    }

    #[test]
    fn flag_is_off_by_default() {
        assert!(
            !ENABLE_RECOMMENDATION_V2,
            "default must be false for safe rollout"
        );
    }

    #[test]
    fn fallback_result_is_valid() {
        // Verify the fallback path produces schema-valid output
        use crate::commands::ai_router::fallback_rule_based;
        use crate::commands::ai_safety::guard_result;

        for intent in [
            Intent::Fps,
            Intent::Stability,
            Intent::Silence,
            Intent::Balanced,
        ] {
            let input = make_input(intent);
            let result = fallback_rule_based(&input);
            assert!(
                guard_result(&result).is_ok(),
                "fallback result failed schema guard for intent {:?}",
                result.model
            );
        }
    }

    #[test]
    fn fallback_result_has_required_fields() {
        use crate::commands::ai_router::fallback_rule_based;
        let input = make_input(Intent::Fps);
        let result = fallback_rule_based(&input);
        assert!(!result.summary.is_empty());
        assert!(!result.model.is_empty());
        assert!(!result.generated_at.is_empty());
        assert!(result.fallback_used);
    }
}
