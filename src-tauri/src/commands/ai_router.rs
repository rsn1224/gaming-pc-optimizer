/// ai_router.rs — LLM Router + ルールベースフォールバック
///
/// 責務:
///   - intent / system 情報からモデルを選択する
///   - プロンプトを構築して Claude API を呼び出す
///   - AI 失敗時にルールベース推奨へ自動フォールバックする
use crate::commands::ai_schema::{
    ExpectedImpact, Intent, RecommendationInput, RecommendationItem, RecommendationResult,
    RiskLevel,
};

// ── Model constants ───────────────────────────────────────────────────────────

pub const MODEL_HAIKU: &str = "claude-haiku-4-5-20251001";
pub const MODEL_SONNET: &str = "claude-sonnet-4-6";

// ── Model selection ───────────────────────────────────────────────────────────

/// intent と system 情報からモデルを選択する。
/// ラップトップ / 静音モードは Sonnet（より丁寧な推論）を使用する。
pub fn select_model(input: &RecommendationInput) -> &'static str {
    let is_laptop = input.system.is_laptop.unwrap_or(false);
    let is_silence = matches!(input.intent, Intent::Silence);
    if is_laptop || is_silence {
        MODEL_SONNET
    } else {
        MODEL_HAIKU
    }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

pub fn build_prompt(input: &RecommendationInput, model: &str) -> String {
    let intent_str = match &input.intent {
        Intent::Fps => "FPS最大化（ゲーム中の最高フレームレート優先）",
        Intent::Stability => "安定性優先（クラッシュ・フリーズを防ぐ）",
        Intent::Silence => "静音・省電力（ファンノイズと消費電力を抑える）",
        Intent::Balanced => "バランス（パフォーマンスと安定性のバランス）",
    };

    let constraints = input.constraints.as_ref();
    let allow_registry = constraints.and_then(|c| c.allow_registry).unwrap_or(true);
    let allow_network = constraints
        .and_then(|c| c.allow_network_change)
        .unwrap_or(true);
    let allow_power = constraints
        .and_then(|c| c.allow_power_plan_change)
        .unwrap_or(true);

    let game_info = input
        .profile
        .as_ref()
        .and_then(|p| p.game_title.as_deref())
        .map(|g| format!("\n対象ゲーム: {}", g))
        .unwrap_or_default();

    format!(
        r#"あなたはWindows PCゲーミング最適化の専門AIです。以下の情報を基に最適化推奨事項を3〜5件生成してください。

## システム情報
OS: {os}
CPU: {cpu}
GPU: {gpu}
RAM: {ram}GB
ラップトップ: {laptop}
電源プラン: {power}{game}

## 最適化目標
{intent}

## 制約
- レジストリ変更: {reg}
- ネットワーク設定: {net}
- 電源プラン変更: {pwr}

## 出力（JSONのみ、マークダウン不要）
{{
  "items": [
    {{
      "id": "snake_case_id",
      "title": "推奨タイトル（20文字以内）",
      "reason": "技術的根拠（50文字以内）",
      "confidence": 0.0〜1.0の数値,
      "expectedImpact": {{
        "fps": null または期待FPS向上の整数,
        "latencyMs": null または期待レイテンシ改善の整数,
        "stability": null または-1.0〜1.0の安定性変化
      }},
      "riskLevel": "safe" または "caution" または "advanced"
    }}
  ],
  "summary": "全体サマリー（100文字以内）",
  "model": "{model}"
}}"#,
        os = input.system.os_version,
        cpu = input.system.cpu.as_deref().unwrap_or("不明"),
        gpu = input.system.gpu.as_deref().unwrap_or("不明"),
        ram = input
            .system
            .memory_gb
            .map(|v| format!("{:.0}", v))
            .unwrap_or_else(|| "不明".to_string()),
        laptop = if input.system.is_laptop.unwrap_or(false) {
            "はい"
        } else {
            "いいえ"
        },
        power = input.system.power_plan.as_deref().unwrap_or("不明"),
        game = game_info,
        intent = intent_str,
        reg = if allow_registry { "許可" } else { "禁止" },
        net = if allow_network { "許可" } else { "禁止" },
        pwr = if allow_power { "許可" } else { "禁止" },
        model = model,
    )
}

// ── API call (model-parameterized) ────────────────────────────────────────────

/// 指定モデルで Claude API を呼び出す。
pub async fn call_api(
    api_key: &str,
    model: &str,
    prompt: &str,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API request error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Response parse error: {}", e))?;

    let text = json["content"][0]["text"]
        .as_str()
        .ok_or("Invalid response format: missing content[0].text")?
        .to_string();

    Ok(text)
}

// ── Response parser ───────────────────────────────────────────────────────────

pub fn parse_response(text: &str, model: &str) -> Result<RecommendationResult, String> {
    // extract the outermost JSON object
    let trimmed = text.trim();
    let json_str = match (trimmed.find('{'), trimmed.rfind('}')) {
        (Some(start), Some(end)) if end > start => &trimmed[start..=end],
        _ => trimmed,
    };

    let val: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("JSON parse error: {}", e))?;

    let items_arr = val["items"]
        .as_array()
        .ok_or("missing or invalid 'items' array")?;

    let mut items = Vec::new();
    for (i, item) in items_arr.iter().enumerate() {
        let id = item["id"]
            .as_str()
            .unwrap_or(&format!("item_{}", i))
            .to_string();
        let title = item["title"].as_str().unwrap_or("最適化推奨").to_string();
        let reason = item["reason"].as_str().unwrap_or("").to_string();
        let confidence = item["confidence"].as_f64().unwrap_or(0.7).clamp(0.0, 1.0) as f32;
        let risk_level = match item["riskLevel"].as_str().unwrap_or("safe") {
            "caution" => RiskLevel::Caution,
            "advanced" => RiskLevel::Advanced,
            _ => RiskLevel::Safe,
        };
        let impact = &item["expectedImpact"];
        let expected_impact = ExpectedImpact {
            fps: impact["fps"].as_i64().map(|v| v as i32),
            latency_ms: impact["latencyMs"].as_i64().map(|v| v as i32),
            stability: impact["stability"]
                .as_f64()
                .map(|v| (v as f32).clamp(-1.0, 1.0)),
        };
        items.push(RecommendationItem {
            id,
            title,
            reason,
            confidence,
            expected_impact,
            risk_level,
        });
    }

    let summary = val["summary"]
        .as_str()
        .unwrap_or("AI推奨事項を生成しました")
        .to_string();

    Ok(RecommendationResult {
        items,
        summary,
        model: model.to_string(),
        fallback_used: false,
        generated_at: super::now_iso8601(),
    })
}

// ── Rule-based fallback ───────────────────────────────────────────────────────

/// API キーなし / AI 呼び出し失敗時のルールベース推奨。
pub fn fallback_rule_based(input: &RecommendationInput) -> RecommendationResult {
    let mut items: Vec<RecommendationItem> = Vec::new();
    let allow_power = input
        .constraints
        .as_ref()
        .and_then(|c| c.allow_power_plan_change)
        .unwrap_or(true);
    let allow_network = input
        .constraints
        .as_ref()
        .and_then(|c| c.allow_network_change)
        .unwrap_or(true);

    match &input.intent {
        Intent::Fps => {
            if allow_power {
                items.push(RecommendationItem {
                    id: "power_ultimate_perf".to_string(),
                    title: "電源プランを最高パフォーマンスに".to_string(),
                    reason: "CPUクロックを最大に維持してFPSを安定化させます".to_string(),
                    confidence: 0.90,
                    expected_impact: ExpectedImpact {
                        fps: Some(5),
                        latency_ms: Some(-10),
                        stability: None,
                    },
                    risk_level: RiskLevel::Safe,
                });
            }
            items.push(RecommendationItem {
                id: "process_high_priority".to_string(),
                title: "ゲームプロセス優先度を高に".to_string(),
                reason: "OSスケジューラがゲームに多くのCPU時間を割り当てます".to_string(),
                confidence: 0.80,
                expected_impact: ExpectedImpact {
                    fps: Some(3),
                    latency_ms: Some(-5),
                    stability: None,
                },
                risk_level: RiskLevel::Safe,
            });
            items.push(RecommendationItem {
                id: "bloatware_terminate".to_string(),
                title: "バックグラウンドプロセスを停止".to_string(),
                reason: "不要プロセスを終了してCPU/RAMをゲームに解放します".to_string(),
                confidence: 0.75,
                expected_impact: ExpectedImpact {
                    fps: Some(2),
                    latency_ms: None,
                    stability: Some(0.1),
                },
                risk_level: RiskLevel::Caution,
            });
        }
        Intent::Stability => {
            items.push(RecommendationItem {
                id: "memory_cleanup".to_string(),
                title: "メモリをクリーンアップ".to_string(),
                reason: "断片化メモリを解放してクラッシュリスクを低減します".to_string(),
                confidence: 0.85,
                expected_impact: ExpectedImpact {
                    fps: None,
                    latency_ms: None,
                    stability: Some(0.3),
                },
                risk_level: RiskLevel::Safe,
            });
            items.push(RecommendationItem {
                id: "thermal_monitor".to_string(),
                title: "温度モニタリングを強化".to_string(),
                reason: "過熱による強制シャットダウンや不安定動作を防ぎます".to_string(),
                confidence: 0.80,
                expected_impact: ExpectedImpact {
                    fps: None,
                    latency_ms: None,
                    stability: Some(0.4),
                },
                risk_level: RiskLevel::Safe,
            });
            items.push(RecommendationItem {
                id: "startup_optimize".to_string(),
                title: "スタートアップを最適化".to_string(),
                reason: "起動時の競合を減らしシステムの安定性を向上させます".to_string(),
                confidence: 0.70,
                expected_impact: ExpectedImpact {
                    fps: None,
                    latency_ms: None,
                    stability: Some(0.2),
                },
                risk_level: RiskLevel::Safe,
            });
        }
        Intent::Silence => {
            if allow_power {
                items.push(RecommendationItem {
                    id: "power_balanced".to_string(),
                    title: "電源プランをバランスに変更".to_string(),
                    reason: "CPU負荷を抑えてファン回転数と発熱を低減します".to_string(),
                    confidence: 0.88,
                    expected_impact: ExpectedImpact {
                        fps: Some(-3),
                        latency_ms: None,
                        stability: Some(0.1),
                    },
                    risk_level: RiskLevel::Safe,
                });
            }
            items.push(RecommendationItem {
                id: "gpu_power_limit".to_string(),
                title: "GPU電力制限を設定".to_string(),
                reason: "GPU発熱とファンノイズを低減します（性能は若干低下）".to_string(),
                confidence: 0.75,
                expected_impact: ExpectedImpact {
                    fps: Some(-5),
                    latency_ms: None,
                    stability: Some(0.2),
                },
                risk_level: RiskLevel::Caution,
            });
        }
        Intent::Balanced => {
            if allow_power {
                items.push(RecommendationItem {
                    id: "power_high_perf".to_string(),
                    title: "電源プランを高パフォーマンスに".to_string(),
                    reason: "パフォーマンスと消費電力のバランスを取ります".to_string(),
                    confidence: 0.85,
                    expected_impact: ExpectedImpact {
                        fps: Some(3),
                        latency_ms: Some(-5),
                        stability: Some(0.1),
                    },
                    risk_level: RiskLevel::Safe,
                });
            }
            items.push(RecommendationItem {
                id: "startup_disable_unused".to_string(),
                title: "不要スタートアップを無効化".to_string(),
                reason: "起動時間と常駐メモリを削減します".to_string(),
                confidence: 0.70,
                expected_impact: ExpectedImpact {
                    fps: Some(1),
                    latency_ms: None,
                    stability: Some(0.2),
                },
                risk_level: RiskLevel::Safe,
            });
            if allow_network {
                items.push(RecommendationItem {
                    id: "network_gaming_opt".to_string(),
                    title: "ネットワーク設定をゲーミング最適化".to_string(),
                    reason: "レイテンシを低減してオンライン対戦を改善します".to_string(),
                    confidence: 0.72,
                    expected_impact: ExpectedImpact {
                        fps: None,
                        latency_ms: Some(-15),
                        stability: None,
                    },
                    risk_level: RiskLevel::Caution,
                });
            }
        }
    }

    let intent_label = match &input.intent {
        Intent::Fps => "FPS最大化",
        Intent::Stability => "安定性優先",
        Intent::Silence => "静音・省電力",
        Intent::Balanced => "バランス",
    };

    RecommendationResult {
        items,
        summary: format!(
            "ルールベース推奨（{}モード）を生成しました。より精度の高い推奨にはAI APIキーを設定してください。",
            intent_label
        ),
        model: "rule_based_v1".to_string(),
        fallback_used: true,
        generated_at: super::now_iso8601(),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::ai_schema::{Constraints, SystemSnapshot};

    fn make_input(intent: Intent) -> RecommendationInput {
        RecommendationInput {
            intent,
            system: SystemSnapshot {
                os_version: "Windows 11".to_string(),
                cpu: Some("Intel i7-12700K".to_string()),
                gpu: Some("NVIDIA RTX 3080".to_string()),
                memory_gb: Some(32.0),
                is_laptop: Some(false),
                power_plan: Some("Balanced".to_string()),
            },
            profile: None,
            constraints: None,
        }
    }

    #[test]
    fn select_model_fps_returns_haiku() {
        let input = make_input(Intent::Fps);
        assert_eq!(select_model(&input), MODEL_HAIKU);
    }

    #[test]
    fn select_model_silence_returns_sonnet() {
        let input = make_input(Intent::Silence);
        assert_eq!(select_model(&input), MODEL_SONNET);
    }

    #[test]
    fn select_model_laptop_returns_sonnet() {
        let mut input = make_input(Intent::Fps);
        input.system.is_laptop = Some(true);
        assert_eq!(select_model(&input), MODEL_SONNET);
    }

    #[test]
    fn select_model_balanced_desktop_returns_haiku() {
        let input = make_input(Intent::Balanced);
        assert_eq!(select_model(&input), MODEL_HAIKU);
    }

    #[test]
    fn fallback_fps_generates_items() {
        let input = make_input(Intent::Fps);
        let result = fallback_rule_based(&input);
        assert!(!result.items.is_empty());
        assert!(result.fallback_used);
        assert_eq!(result.model, "rule_based_v1");
        // power plan item should be present (no constraints)
        assert!(result.items.iter().any(|i| i.id == "power_ultimate_perf"));
    }

    #[test]
    fn fallback_fps_no_power_plan_when_forbidden() {
        let mut input = make_input(Intent::Fps);
        input.constraints = Some(Constraints {
            allow_registry: None,
            allow_network_change: None,
            allow_power_plan_change: Some(false),
        });
        let result = fallback_rule_based(&input);
        assert!(result.items.iter().all(|i| i.id != "power_ultimate_perf"));
    }

    #[test]
    fn fallback_stability_generates_items() {
        let result = fallback_rule_based(&make_input(Intent::Stability));
        assert!(!result.items.is_empty());
        assert!(result.items.iter().any(|i| i.id == "memory_cleanup"));
    }

    #[test]
    fn fallback_silence_generates_items() {
        let result = fallback_rule_based(&make_input(Intent::Silence));
        assert!(!result.items.is_empty());
    }

    #[test]
    fn fallback_balanced_includes_network_when_allowed() {
        let result = fallback_rule_based(&make_input(Intent::Balanced));
        assert!(result.items.iter().any(|i| i.id == "network_gaming_opt"));
    }

    #[test]
    fn fallback_all_confidences_in_range() {
        for intent in [
            Intent::Fps,
            Intent::Stability,
            Intent::Silence,
            Intent::Balanced,
        ] {
            let result = fallback_rule_based(&make_input(intent));
            for item in &result.items {
                assert!(
                    (0.0..=1.0).contains(&item.confidence),
                    "confidence {} out of range for item {}",
                    item.confidence,
                    item.id
                );
            }
        }
    }

    #[test]
    fn parse_response_valid_json() {
        let json = r#"{
            "items": [
                {
                    "id": "test_opt",
                    "title": "Test",
                    "reason": "Because",
                    "confidence": 0.8,
                    "expectedImpact": {"fps": 5, "latencyMs": null, "stability": null},
                    "riskLevel": "safe"
                }
            ],
            "summary": "テストサマリー",
            "model": "claude-haiku-4-5-20251001"
        }"#;
        let result = parse_response(json, MODEL_HAIKU).unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].id, "test_opt");
        assert_eq!(result.items[0].expected_impact.fps, Some(5));
        assert_eq!(result.items[0].risk_level, RiskLevel::Safe);
    }

    #[test]
    fn parse_response_handles_caution_risk() {
        let json = r#"{
            "items": [{"id": "x", "title": "T", "reason": "R",
                "confidence": 0.6,
                "expectedImpact": {},
                "riskLevel": "caution"}],
            "summary": "s", "model": "m"
        }"#;
        let result = parse_response(json, "m").unwrap();
        assert_eq!(result.items[0].risk_level, RiskLevel::Caution);
    }

    #[test]
    fn parse_response_clamps_confidence_over_1() {
        let json = r#"{
            "items": [{"id": "x", "title": "T", "reason": "R",
                "confidence": 1.5,
                "expectedImpact": {},
                "riskLevel": "safe"}],
            "summary": "s", "model": "m"
        }"#;
        let result = parse_response(json, "m").unwrap();
        assert_eq!(result.items[0].confidence, 1.0);
    }

    #[test]
    fn build_prompt_contains_system_info() {
        let input = make_input(Intent::Fps);
        let prompt = build_prompt(&input, MODEL_HAIKU);
        assert!(prompt.contains("Windows 11"));
        assert!(prompt.contains("Intel i7-12700K"));
        assert!(prompt.contains("NVIDIA RTX 3080"));
        assert!(prompt.contains("FPS最大化"));
    }

    #[test]
    fn build_prompt_contains_model_name() {
        let input = make_input(Intent::Balanced);
        let prompt = build_prompt(&input, MODEL_HAIKU);
        assert!(prompt.contains(MODEL_HAIKU));
    }
}
