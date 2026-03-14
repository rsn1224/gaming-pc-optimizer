/// optimizer_graph.rs — Optimization Graph (Sprint 2 / S2-01)
///
/// 最適化アクションを DAG（有向非巡回グラフ）で管理する。
/// 各ノードは最適化の1ステップを表し、エッジは依存関係・競合・提案を表す。
///
/// 主要操作:
///   - topological_sort(): REQUIRES エッジを考慮した安全な適用順を返す
///   - is_cyclic(): 循環依存を検出する
///   - get_apply_order(requested): 要求されたノードとその REQUIRES 依存を解決して順番を返す
///   - check_conflicts(requested): 要求されたノード間の CONFLICTS を検出する
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum OptimizationCategory {
    Process,
    Power,
    Windows,
    Network,
    Storage,
    Registry,
}

/// DAG のノード: 1つの最適化アクション
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationNode {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: OptimizationCategory,
    /// 推定されるスコア改善量 (0–100 の相対値)
    pub estimated_impact: u8,
    /// 管理者権限が必要か
    pub requires_admin: bool,
    /// ロールバック可能か
    pub reversible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EdgeType {
    /// B を適用するには A が先に適用されている必要がある
    Requires,
    /// A と B は同時に適用できない
    Conflicts,
    /// A を適用したなら B も適用を検討すべき
    Suggests,
}

/// DAG のエッジ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationEdge {
    pub from: String,
    pub to: String,
    pub edge_type: EdgeType,
}

/// グラフ全体
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OptimizationGraph {
    pub nodes: Vec<OptimizationNode>,
    pub edges: Vec<OptimizationEdge>,
}

/// get_apply_order の結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyPlan {
    /// 適用順 (依存解決済み)
    pub order: Vec<String>,
    /// 競合のため除外されたノード
    pub conflicts: Vec<ConflictInfo>,
    /// SUGGESTS で追加推奨されたノード (要求外)
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub node_a: String,
    pub node_b: String,
    pub reason: String,
}

// ── Built-in graph definition ─────────────────────────────────────────────────

/// アプリ標準の最適化グラフを返す。
/// 将来的には JSON ファイルや DB から読み込む想定。
pub fn default_graph() -> OptimizationGraph {
    let nodes = vec![
        OptimizationNode {
            id: "kill_bloatware".to_string(),
            name: "ブロートウェア停止".to_string(),
            description: "既知の不要プロセスを停止してメモリを解放する".to_string(),
            category: OptimizationCategory::Process,
            estimated_impact: 30,
            requires_admin: false,
            reversible: false,
        },
        OptimizationNode {
            id: "ultimate_power".to_string(),
            name: "Ultimate Performance".to_string(),
            description: "電源プランを Ultimate Performance に切り替える".to_string(),
            category: OptimizationCategory::Power,
            estimated_impact: 20,
            requires_admin: true,
            reversible: true,
        },
        OptimizationNode {
            id: "gaming_windows".to_string(),
            name: "Windows ゲーミング設定".to_string(),
            description: "視覚効果を最小化し Game DVR を無効化する".to_string(),
            category: OptimizationCategory::Windows,
            estimated_impact: 25,
            requires_admin: false,
            reversible: true,
        },
        OptimizationNode {
            id: "network_gaming".to_string(),
            name: "ネットワーク最適化".to_string(),
            description: "NetworkThrottling / Nagle アルゴリズムを無効化する".to_string(),
            category: OptimizationCategory::Network,
            estimated_impact: 25,
            requires_admin: true,
            reversible: true,
        },
        OptimizationNode {
            id: "dns_gaming".to_string(),
            name: "DNS 最適化".to_string(),
            description: "低レイテンシ DNS サーバーに切り替える".to_string(),
            category: OptimizationCategory::Network,
            estimated_impact: 10,
            requires_admin: true,
            reversible: true,
        },
        OptimizationNode {
            id: "registry_gaming".to_string(),
            name: "レジストリ最適化".to_string(),
            description: "ゲームパフォーマンスに関するレジストリ tweaks を適用する".to_string(),
            category: OptimizationCategory::Registry,
            estimated_impact: 15,
            requires_admin: true,
            reversible: true,
        },
        OptimizationNode {
            id: "storage_light".to_string(),
            name: "ストレージ軽量クリーン".to_string(),
            description: "一時ファイルと不要キャッシュを削除する".to_string(),
            category: OptimizationCategory::Storage,
            estimated_impact: 5,
            requires_admin: false,
            reversible: false,
        },
    ];

    let edges = vec![
        // network_gaming は ultimate_power に SUGGESTS (電源が最適化されているとネット効果が増す)
        OptimizationEdge {
            from: "ultimate_power".to_string(),
            to: "network_gaming".to_string(),
            edge_type: EdgeType::Suggests,
        },
        // dns_gaming は network_gaming が先に適用されている必要はないが SUGGESTS
        OptimizationEdge {
            from: "network_gaming".to_string(),
            to: "dns_gaming".to_string(),
            edge_type: EdgeType::Suggests,
        },
        // registry_gaming は gaming_windows の後に適用するとより効果的
        OptimizationEdge {
            from: "gaming_windows".to_string(),
            to: "registry_gaming".to_string(),
            edge_type: EdgeType::Suggests,
        },
        // storage_light は kill_bloatware の前に実行しても意味が薄い (Suggests: 後で)
        OptimizationEdge {
            from: "kill_bloatware".to_string(),
            to: "storage_light".to_string(),
            edge_type: EdgeType::Suggests,
        },
    ];

    OptimizationGraph { nodes, edges }
}

// ── Graph operations ──────────────────────────────────────────────────────────

impl OptimizationGraph {
    /// ノード ID → ノード の Map を返す
    #[expect(dead_code, reason = "used in tests and reserved for graph inspection API")]
    pub fn node_map(&self) -> HashMap<&str, &OptimizationNode> {
        self.nodes.iter().map(|n| (n.id.as_str(), n)).collect()
    }

    /// REQUIRES エッジのみで隣接リストを構築 (from → Vec<to>)
    fn requires_adj(&self) -> HashMap<&str, Vec<&str>> {
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
        for n in &self.nodes {
            adj.entry(n.id.as_str()).or_default();
        }
        for e in &self.edges {
            if e.edge_type == EdgeType::Requires {
                adj.entry(e.from.as_str()).or_default().push(e.to.as_str());
            }
        }
        adj
    }

    /// Kahn's algorithm によるトポロジカルソート (REQUIRES のみ)
    /// 循環がある場合は Err を返す。
    pub fn topological_sort(&self) -> Result<Vec<String>, String> {
        let adj = self.requires_adj();
        // in-degree を計算
        let mut in_degree: HashMap<&str, usize> =
            self.nodes.iter().map(|n| (n.id.as_str(), 0)).collect();
        for targets in adj.values() {
            for &t in targets {
                *in_degree.entry(t).or_insert(0) += 1;
            }
        }

        let mut queue: VecDeque<&str> = in_degree
            .iter()
            .filter(|(_, &d)| d == 0)
            .map(|(&id, _)| id)
            .collect();
        let mut sorted = Vec::new();

        while let Some(id) = queue.pop_front() {
            sorted.push(id.to_string());
            if let Some(neighbors) = adj.get(id) {
                for &n in neighbors {
                    let deg = in_degree.entry(n).or_default();
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(n);
                    }
                }
            }
        }

        if sorted.len() != self.nodes.len() {
            Err("グラフに循環依存が検出されました".to_string())
        } else {
            Ok(sorted)
        }
    }

    /// 循環依存チェック
    #[expect(dead_code, reason = "used in tests and reserved for graph validation API")]
    pub fn is_cyclic(&self) -> bool {
        self.topological_sort().is_err()
    }

    /// 要求されたノード ID リストに対して:
    ///   1. CONFLICTS を検出して競合ペアを除外
    ///   2. REQUIRES 依存を再帰的に解決して追加
    ///   3. 適用順 (トポロジカル順) を返す
    ///   4. SUGGESTS で追加推奨ノードをリストアップ
    pub fn get_apply_plan(&self, requested: &[&str]) -> ApplyPlan {
        let mut to_apply: HashSet<String> = requested.iter().map(|s| s.to_string()).collect();
        let mut conflicts = Vec::new();
        let mut suggestions = Vec::new();

        // 1. REQUIRES: 依存するノードを再帰追加
        let mut changed = true;
        while changed {
            changed = false;
            let snapshot: Vec<String> = to_apply.iter().cloned().collect();
            for e in &self.edges {
                if e.edge_type == EdgeType::Requires
                    && to_apply.contains(&e.from)
                    && to_apply.insert(e.to.clone())
                {
                    changed = true;
                }
            }
            let _ = snapshot; // suppress unused warning
        }

        // 2. CONFLICTS: 競合ペアを検出 → 後ろのノード (優先度が低い方) を除外
        let ordered: Vec<String> = to_apply.iter().cloned().collect();
        let mut removed: HashSet<String> = HashSet::new();
        for e in &self.edges {
            if e.edge_type == EdgeType::Conflicts {
                let has_a = to_apply.contains(&e.from) && !removed.contains(&e.from);
                let has_b = to_apply.contains(&e.to) && !removed.contains(&e.to);
                if has_a && has_b {
                    // 後ろ側 (to) を除外
                    removed.insert(e.to.clone());
                    conflicts.push(ConflictInfo {
                        node_a: e.from.clone(),
                        node_b: e.to.clone(),
                        reason: format!("{} と {} は同時に適用できません", e.from, e.to),
                    });
                }
            }
        }
        for r in &removed {
            to_apply.remove(r);
        }

        // 3. SUGGESTS: apply 対象から提案されるノードを収集 (apply 対象外のもの)
        for e in &self.edges {
            if e.edge_type == EdgeType::Suggests
                && to_apply.contains(&e.from)
                && !to_apply.contains(&e.to)
                && !suggestions.contains(&e.to)
            {
                suggestions.push(e.to.clone());
            }
        }

        // 4. トポロジカル順でソート
        let topo = self.topological_sort().unwrap_or(ordered);
        let order: Vec<String> = topo
            .into_iter()
            .filter(|id| to_apply.contains(id))
            .collect();

        ApplyPlan {
            order,
            conflicts,
            suggestions,
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_optimization_graph() -> OptimizationGraph {
    default_graph()
}

#[tauri::command]
pub fn get_apply_plan(requested: Vec<String>) -> ApplyPlan {
    let g = default_graph();
    let refs: Vec<&str> = requested.iter().map(|s| s.as_str()).collect();
    g.get_apply_plan(&refs)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_graph_is_not_cyclic() {
        assert!(!default_graph().is_cyclic());
    }

    #[test]
    fn topological_sort_returns_all_nodes() {
        let g = default_graph();
        let sorted = g.topological_sort().unwrap();
        assert_eq!(sorted.len(), g.nodes.len());
    }

    #[test]
    fn apply_plan_resolves_requests() {
        let g = default_graph();
        let plan = g.get_apply_plan(&["kill_bloatware", "ultimate_power"]);
        assert!(plan.order.contains(&"kill_bloatware".to_string()));
        assert!(plan.order.contains(&"ultimate_power".to_string()));
        assert!(plan.conflicts.is_empty());
    }

    #[test]
    fn node_map_contains_all_nodes() {
        let g = default_graph();
        let map = g.node_map();
        assert_eq!(map.len(), g.nodes.len());
        for node in &g.nodes {
            assert!(map.contains_key(node.id.as_str()));
        }
    }

    #[test]
    fn cyclic_graph_detected() {
        let mut g = default_graph();
        // A→B, B→A の循環を作る
        g.edges.push(OptimizationEdge {
            from: "kill_bloatware".to_string(),
            to: "ultimate_power".to_string(),
            edge_type: EdgeType::Requires,
        });
        g.edges.push(OptimizationEdge {
            from: "ultimate_power".to_string(),
            to: "kill_bloatware".to_string(),
            edge_type: EdgeType::Requires,
        });
        assert!(g.is_cyclic());
    }
}
