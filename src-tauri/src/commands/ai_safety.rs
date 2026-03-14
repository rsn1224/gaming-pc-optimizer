/// ai_safety.rs — Safety Policy + Schema Guard
///
/// SafetyPolicy: constraints に基づき RecommendationItem をフィルタリングする。
/// guard_result: AI レスポンスが仕様に準拠しているか検証する。
use crate::commands::ai_schema::{Constraints, RecommendationItem, RecommendationResult};

// ── Safety Policy ─────────────────────────────────────────────────────────────

pub struct SafetyPolicy {
    pub allow_registry: bool,
    pub allow_network_change: bool,
    pub allow_power_plan_change: bool,
}

impl SafetyPolicy {
    /// constraints から SafetyPolicy を構築する。None の場合は全許可。
    pub fn from_constraints(c: &Option<Constraints>) -> Self {
        match c {
            Some(c) => SafetyPolicy {
                allow_registry: c.allow_registry.unwrap_or(true),
                allow_network_change: c.allow_network_change.unwrap_or(true),
                allow_power_plan_change: c.allow_power_plan_change.unwrap_or(true),
            },
            None => SafetyPolicy {
                allow_registry: true,
                allow_network_change: true,
                allow_power_plan_change: true,
            },
        }
    }

    /// constraints に違反するアイテムを除外する。
    pub fn filter(&self, items: Vec<RecommendationItem>) -> Vec<RecommendationItem> {
        items
            .into_iter()
            .filter(|item| self.is_allowed(item))
            .collect()
    }

    fn is_allowed(&self, item: &RecommendationItem) -> bool {
        let id = item.id.as_str();
        let title = item.title.to_lowercase();

        if !self.allow_registry
            && (id.contains("registry")
                || title.contains("registry")
                || title.contains("レジストリ"))
        {
            return false;
        }
        if !self.allow_network_change
            && (id.contains("network")
                || id.contains("dns")
                || title.contains("ネットワーク")
                || title.contains("dns")
                || title.contains("network"))
        {
            return false;
        }
        if !self.allow_power_plan_change
            && (id.contains("power")
                || title.contains("電源")
                || title.contains("power plan")
                || title.contains("power_plan"))
        {
            return false;
        }
        true
    }
}

// ── Schema Guard ──────────────────────────────────────────────────────────────

/// AI レスポンスが仕様に準拠しているか検証する。
/// 違反がある場合は Err(reason) を返す。
pub fn guard_result(result: &RecommendationResult) -> Result<(), String> {
    if result.items.len() > 20 {
        return Err(format!(
            "items count {} exceeds maximum of 20",
            result.items.len()
        ));
    }
    for item in &result.items {
        if item.id.is_empty() {
            return Err("item id must not be empty".to_string());
        }
        if !(0.0..=1.0).contains(&item.confidence) {
            return Err(format!(
                "item '{}' confidence {} is out of range 0.0..1.0",
                item.id, item.confidence
            ));
        }
        if let Some(stability) = item.expected_impact.stability {
            if !(-1.0..=1.0).contains(&stability) {
                return Err(format!(
                    "item '{}' stability {} is out of range -1.0..1.0",
                    item.id, stability
                ));
            }
        }
    }
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::ai_schema::{ExpectedImpact, RiskLevel};

    fn make_item(id: &str, title: &str) -> RecommendationItem {
        RecommendationItem {
            id: id.to_string(),
            title: title.to_string(),
            reason: "test".to_string(),
            confidence: 0.8,
            expected_impact: ExpectedImpact::default(),
            risk_level: RiskLevel::Safe,
        }
    }

    fn make_result(items: Vec<RecommendationItem>) -> RecommendationResult {
        RecommendationResult {
            items,
            summary: "test".to_string(),
            model: "test".to_string(),
            fallback_used: false,
            generated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    // SafetyPolicy tests

    #[test]
    fn policy_allow_all_by_default() {
        let policy = SafetyPolicy::from_constraints(&None);
        assert!(policy.allow_registry);
        assert!(policy.allow_network_change);
        assert!(policy.allow_power_plan_change);
    }

    #[test]
    fn policy_filters_registry_item() {
        let constraints = Some(Constraints {
            allow_registry: Some(false),
            allow_network_change: Some(true),
            allow_power_plan_change: Some(true),
        });
        let policy = SafetyPolicy::from_constraints(&constraints);
        let items = vec![
            make_item("registry_tweak", "Registry Tweak"),
            make_item("power_plan", "電源プラン最適化"),
        ];
        let filtered = policy.filter(items);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "power_plan");
    }

    #[test]
    fn policy_filters_network_item_by_title() {
        let constraints = Some(Constraints {
            allow_registry: Some(true),
            allow_network_change: Some(false),
            allow_power_plan_change: Some(true),
        });
        let policy = SafetyPolicy::from_constraints(&constraints);
        let items = vec![
            make_item("opt_001", "ネットワーク設定を最適化"),
            make_item("opt_002", "プロセス優先度を設定"),
        ];
        let filtered = policy.filter(items);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "opt_002");
    }

    #[test]
    fn policy_filters_power_plan_item_by_id() {
        let constraints = Some(Constraints {
            allow_registry: Some(true),
            allow_network_change: Some(true),
            allow_power_plan_change: Some(false),
        });
        let policy = SafetyPolicy::from_constraints(&constraints);
        let items = vec![
            make_item("power_ultimate", "最高パフォーマンス"),
            make_item("bloatware_kill", "バックグラウンド停止"),
        ];
        let filtered = policy.filter(items);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "bloatware_kill");
    }

    // Schema Guard tests

    #[test]
    fn guard_passes_valid_result() {
        let item = RecommendationItem {
            id: "test_item".to_string(),
            title: "Test".to_string(),
            reason: "reason".to_string(),
            confidence: 0.75,
            expected_impact: ExpectedImpact {
                fps: Some(5),
                latency_ms: None,
                stability: Some(0.3),
            },
            risk_level: RiskLevel::Safe,
        };
        let result = make_result(vec![item]);
        assert!(guard_result(&result).is_ok());
    }

    #[test]
    fn guard_rejects_confidence_out_of_range() {
        let item = RecommendationItem {
            id: "bad".to_string(),
            title: "Bad Item".to_string(),
            reason: "x".to_string(),
            confidence: 1.5, // invalid
            expected_impact: ExpectedImpact::default(),
            risk_level: RiskLevel::Safe,
        };
        let result = make_result(vec![item]);
        assert!(guard_result(&result).is_err());
    }

    #[test]
    fn guard_rejects_stability_out_of_range() {
        let item = RecommendationItem {
            id: "bad2".to_string(),
            title: "Bad2".to_string(),
            reason: "x".to_string(),
            confidence: 0.5,
            expected_impact: ExpectedImpact {
                fps: None,
                latency_ms: None,
                stability: Some(2.0), // invalid
            },
            risk_level: RiskLevel::Safe,
        };
        let result = make_result(vec![item]);
        assert!(guard_result(&result).is_err());
    }

    #[test]
    fn guard_rejects_empty_item_id() {
        let item = make_item("", "Title");
        let result = make_result(vec![item]);
        assert!(guard_result(&result).is_err());
    }

    #[test]
    fn guard_rejects_too_many_items() {
        let items: Vec<RecommendationItem> = (0..21)
            .map(|i| make_item(&format!("item_{}", i), "T"))
            .collect();
        let result = make_result(items);
        assert!(guard_result(&result).is_err());
    }
}
