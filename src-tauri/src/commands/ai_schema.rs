/// ai_schema.rs — 本番推奨エンジン V2 データ契約
///
/// RecommendationInput / RecommendationItem / RecommendationResult を定義する。
/// これらの型は ai_router / ai_safety / recommendation の全モジュールで共有される。
use serde::{Deserialize, Serialize};

// ── Intent ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Intent {
    Fps,
    Stability,
    Silence,
    #[default]
    Balanced,
}

// ── System snapshot ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub os_version: String,
    pub cpu: Option<String>,
    pub gpu: Option<String>,
    pub memory_gb: Option<f32>,
    pub is_laptop: Option<bool>,
    pub power_plan: Option<String>,
}

// ── Profile snapshot ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSnapshot {
    pub game_title: Option<String>,
    pub exe: Option<String>,
}

// ── Constraints ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Constraints {
    pub allow_registry: Option<bool>,
    pub allow_network_change: Option<bool>,
    pub allow_power_plan_change: Option<bool>,
}

// ── Input ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationInput {
    pub intent: Intent,
    pub system: SystemSnapshot,
    #[serde(default)]
    pub profile: Option<ProfileSnapshot>,
    #[serde(default)]
    pub constraints: Option<Constraints>,
}

// ── Risk level ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum RiskLevel {
    #[default]
    Safe,
    Caution,
    Advanced,
}

// ── Expected impact ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedImpact {
    pub fps: Option<i32>,
    pub latency_ms: Option<i32>,
    pub stability: Option<f32>, // -1.0..1.0
}

// ── Recommendation item ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationItem {
    pub id: String,
    pub title: String,
    pub reason: String,
    pub confidence: f32, // 0.0..1.0
    pub expected_impact: ExpectedImpact,
    pub risk_level: RiskLevel,
}

// ── Recommendation result ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationResult {
    pub items: Vec<RecommendationItem>,
    pub summary: String,
    pub model: String,
    pub fallback_used: bool,
    pub generated_at: String, // ISO8601
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_level_default_is_safe() {
        assert_eq!(RiskLevel::default(), RiskLevel::Safe);
    }

    #[test]
    fn intent_default_is_balanced() {
        assert_eq!(Intent::default(), Intent::Balanced);
    }

    #[test]
    fn expected_impact_default_all_none() {
        let e = ExpectedImpact::default();
        assert!(e.fps.is_none());
        assert!(e.latency_ms.is_none());
        assert!(e.stability.is_none());
    }

    #[test]
    fn recommendation_input_deserializes_camel_case() {
        let json = r#"{
            "intent": "fps",
            "system": {
                "osVersion": "Windows 11",
                "cpu": "Intel i7",
                "memoryGb": 16.0
            }
        }"#;
        let input: RecommendationInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.intent, Intent::Fps);
        assert_eq!(input.system.os_version, "Windows 11");
        assert_eq!(input.system.memory_gb, Some(16.0));
    }

    #[test]
    fn recommendation_result_serializes_camel_case() {
        let result = RecommendationResult {
            items: vec![],
            summary: "test".to_string(),
            model: "test-model".to_string(),
            fallback_used: true,
            generated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("fallbackUsed").is_some());
        assert!(json.get("generatedAt").is_some());
        assert_eq!(json["fallbackUsed"], true);
    }

    #[test]
    fn risk_level_serializes_camel_case() {
        let r = RiskLevel::Advanced;
        let s = serde_json::to_string(&r).unwrap();
        assert_eq!(s, "\"advanced\"");
    }
}
