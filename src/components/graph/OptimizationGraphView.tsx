/**
 * OptimizationGraphView — Sprint 5 / S5-02
 *
 * Optimization Graph DAG の可視化ページ。
 * - ノードをカテゴリ別カラムに配置（position: absolute + SVG エッジオーバーレイ）
 * - REQUIRES / CONFLICTS / SUGGESTS エッジを色分けして描画
 * - ApplyPlan パネルで適用順を確認
 * - ノードクリックで詳細パネルを表示
 */
import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitGraph, ShieldAlert, ShieldCheck, Zap, Info } from "lucide-react";
import type { OptimizationGraph, OptimizationNode, ApplyPlan, OptimizationCategory, EdgeType } from "@/types";

// ── Layout constants ──────────────────────────────────────────────────────────

const COL_WIDTH = 192;
const ROW_HEIGHT = 108;
const NODE_W = 170;
const NODE_H = 78;
const PAD_X = 11;   // (COL_WIDTH - NODE_W) / 2 to horizontally center within column
const PAD_Y = 52;   // space for category header labels

const CATEGORY_ORDER: OptimizationCategory[] = [
  "process", "power", "windows", "network", "storage", "registry",
];

const CATEGORY_STYLE: Record<
  OptimizationCategory,
  { label: string; color: string; border: string; bg: string; dot: string; headerBg: string }
> = {
  process:  { label: "プロセス",       color: "text-red-400",    border: "border-red-500/35",    bg: "bg-red-500/8",    dot: "#f87171", headerBg: "bg-red-500/8"    },
  power:    { label: "電源",           color: "text-amber-400",  border: "border-amber-500/35",  bg: "bg-amber-500/8",  dot: "#fbbf24", headerBg: "bg-amber-500/8"  },
  windows:  { label: "Windows",        color: "text-cyan-400",   border: "border-cyan-500/35",   bg: "bg-cyan-500/8",   dot: "#22d3ee", headerBg: "bg-cyan-500/8"   },
  network:  { label: "ネットワーク",   color: "text-blue-400",   border: "border-blue-500/35",   bg: "bg-blue-500/8",   dot: "#60a5fa", headerBg: "bg-blue-500/8"   },
  storage:  { label: "ストレージ",     color: "text-violet-400", border: "border-violet-500/35", bg: "bg-violet-500/8", dot: "#a78bfa", headerBg: "bg-violet-500/8" },
  registry: { label: "レジストリ",     color: "text-zinc-400",   border: "border-zinc-500/35",   bg: "bg-zinc-500/8",   dot: "#a1a1aa", headerBg: "bg-zinc-500/8"   },
};

const EDGE_CONFIG: Record<EdgeType, { stroke: string; dash: string; label: string; markerColor: string }> = {
  requires:  { stroke: "#60a5fa", dash: "",      label: "必須依存", markerColor: "#60a5fa" },
  conflicts: { stroke: "#f87171", dash: "5,3",   label: "競合",     markerColor: "#f87171" },
  suggests:  { stroke: "#34d399", dash: "4,4",   label: "提案",     markerColor: "#34d399" },
};

// Default nodes to compute apply plan for
const PLAN_NODES = ["kill_bloatware", "ultimate_power", "gaming_windows", "network_gaming"];

// ── Position helpers ──────────────────────────────────────────────────────────

interface NodePos { left: number; top: number; cx: number; cy: number }

function computePositions(graph: OptimizationGraph): Map<string, NodePos> {
  const colRow = new Map<OptimizationCategory, number>();
  const positions = new Map<string, NodePos>();
  for (const node of graph.nodes) {
    const col = CATEGORY_ORDER.indexOf(node.category);
    const row = colRow.get(node.category) ?? 0;
    colRow.set(node.category, row + 1);
    const left = col * COL_WIDTH + PAD_X;
    const top  = PAD_Y + row * ROW_HEIGHT;
    positions.set(node.id, { left, top, cx: left + NODE_W / 2, cy: top + NODE_H / 2 });
  }
  return positions;
}

function edgePath(src: NodePos, dst: NodePos): string {
  const dx = dst.cx - src.cx;
  const ctrl = Math.max(Math.abs(dx) * 0.45, 40);
  return `M ${src.cx} ${src.cy} C ${src.cx + ctrl} ${src.cy}, ${dst.cx - ctrl} ${dst.cy}, ${dst.cx} ${dst.cy}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ImpactBar({ value }: { value: number }) {
  const color = value >= 25 ? "bg-emerald-400" : value >= 15 ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 bg-white/[0.07] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground/50 tabular-nums">{value}</span>
    </div>
  );
}

function NodeCard({
  node,
  selected,
  orderIndex,
}: {
  node: OptimizationNode;
  selected: boolean;
  orderIndex: number | null;
}) {
  const sty = CATEGORY_STYLE[node.category];
  return (
    <div
      className={`
        w-full h-full rounded-xl border flex flex-col justify-between p-2.5 cursor-pointer transition-all
        ${sty.bg} ${sty.border}
        ${selected ? "ring-2 ring-white/30 shadow-lg scale-[1.03]" : "hover:brightness-125"}
      `}
    >
      {/* Top row: order badge + name */}
      <div className="flex items-start gap-2">
        {orderIndex !== null && (
          <span className="shrink-0 w-4 h-4 rounded-full bg-white/15 text-[10px] font-bold flex items-center justify-center text-white/80 mt-0.5">
            {orderIndex + 1}
          </span>
        )}
        <p className={`text-[11px] font-semibold leading-tight ${sty.color} flex-1 min-w-0`}>
          {node.name}
        </p>
      </div>
      {/* Description */}
      <p className="text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2">
        {node.description}
      </p>
      {/* Bottom: impact + icons */}
      <div className="flex items-center justify-between gap-1 mt-0.5">
        <ImpactBar value={node.estimated_impact} />
        <div className="flex items-center gap-1 text-muted-foreground/55">
          {node.requires_admin && <ShieldAlert size={9} aria-label="要管理者" />}
          {node.reversible && <ShieldCheck size={9} aria-label="ロールバック可" />}
        </div>
      </div>
    </div>
  );
}

function ApplyPlanPanel({ plan, graph }: { plan: ApplyPlan; graph: OptimizationGraph }) {
  const nodeById = useMemo(() => {
    const m = new Map<string, OptimizationNode>();
    graph.nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [graph]);

  return (
    <div className="bg-[#05080c] border border-white/[0.12] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={13} className="text-cyan-400" />
        <span className="text-xs font-semibold">GameMode 適用プラン</span>
        <span className="text-[10px] text-muted-foreground/55 ml-auto">KILL + POWER + WINDOWS + NETWORK</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {plan.order.map((id, i) => {
          const node = nodeById.get(id);
          if (!node) return null;
          const sty = CATEGORY_STYLE[node.category];
          return (
            <div key={id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${sty.border} ${sty.bg}`}>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums font-mono">{i + 1}.</span>
              <span className={`text-[11px] font-medium ${sty.color}`}>{node.name}</span>
            </div>
          );
        })}
      </div>
      {plan.suggestions.length > 0 && (
        <p className="text-[10px] text-emerald-400/60">
          提案ノード: {plan.suggestions.join(", ")}
        </p>
      )}
      {plan.conflicts.length > 0 && (
        <p className="text-[10px] text-red-400/60">
          競合スキップ: {plan.conflicts.map(c => `${c.node_a} ↔ ${c.node_b}`).join(", ")}
        </p>
      )}
    </div>
  );
}

function NodeDetailPanel({ nodeId, graph }: { nodeId: string; graph: OptimizationGraph }) {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const sty = CATEGORY_STYLE[node.category];

  const outEdges = graph.edges.filter(e => e.from === nodeId);
  const inEdges  = graph.edges.filter(e => e.to   === nodeId);
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  return (
    <div className={`bg-[#05080c] border ${sty.border} rounded-xl p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full`} style={{ background: sty.dot }} />
        <span className={`text-sm font-semibold ${sty.color}`}>{node.name}</span>
        <span className="text-[10px] text-muted-foreground/55 font-mono ml-auto">{node.id}</span>
      </div>
      <p className="text-xs text-muted-foreground/60">{node.description}</p>
      <div className="grid grid-cols-3 gap-3 text-[10px]">
        <div className="space-y-0.5">
          <p className="text-muted-foreground/55">カテゴリ</p>
          <p className={sty.color}>{sty.label}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground/55">推定効果</p>
          <p className="text-foreground font-semibold">{node.estimated_impact} pt</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground/55">権限</p>
          <p className={node.requires_admin ? "text-amber-400" : "text-emerald-400"}>
            {node.requires_admin ? "要管理者" : "不要"}
          </p>
        </div>
      </div>
      {(outEdges.length > 0 || inEdges.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground/55 uppercase tracking-wider">エッジ</p>
          {inEdges.map((e, i) => (
            <div key={`in-${i}`} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground/55">←</span>
              <span className="text-muted-foreground/60">{EDGE_CONFIG[e.edge_type].label}</span>
              <span className="text-slate-300">{nodeById.get(e.from)?.name ?? e.from}</span>
            </div>
          ))}
          {outEdges.map((e, i) => (
            <div key={`out-${i}`} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground/55">→</span>
              <span className="text-muted-foreground/60">{EDGE_CONFIG[e.edge_type].label}</span>
              <span className="text-slate-300">{nodeById.get(e.to)?.name ?? e.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OptimizationGraphView() {
  const [graph, setGraph]       = useState<OptimizationGraph | null>(null);
  const [applyPlan, setApplyPlan] = useState<ApplyPlan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.allSettled([
      invoke<OptimizationGraph>("get_optimization_graph"),
      invoke<ApplyPlan>("get_apply_plan", { requested: PLAN_NODES }),
    ]).then(([gr, pl]) => {
      if (gr.status === "fulfilled") setGraph(gr.value);
      if (pl.status === "fulfilled") setApplyPlan(pl.value);
      setLoading(false);
    });
  }, []);

  const positions = useMemo(() => (graph ? computePositions(graph) : new Map()), [graph]);

  const applyOrderSet = useMemo(() => new Set(applyPlan?.order ?? []), [applyPlan]);
  const applyOrderIdx = useMemo(() => {
    const m = new Map<string, number>();
    applyPlan?.order.forEach((id, i) => m.set(id, i));
    return m;
  }, [applyPlan]);

  // Canvas dimensions
  const totalWidth  = CATEGORY_ORDER.length * COL_WIDTH + PAD_X * 2;
  const maxRows = useMemo(() => {
    if (!graph) return 1;
    const counts = new Map<string, number>();
    graph.nodes.forEach(n => counts.set(n.category, (counts.get(n.category) ?? 0) + 1));
    return Math.max(...counts.values(), 1);
  }, [graph]);
  const totalHeight = PAD_Y + maxRows * ROW_HEIGHT + 28;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/55 gap-2">
        <Zap size={14} className="animate-pulse text-cyan-400" />
        <span className="text-sm">グラフ読み込み中…</span>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/55">
        <span className="text-sm">グラフデータを取得できませんでした</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-violet-500/20 to-cyan-500/10 border border-violet-500/30 rounded-xl">
          <GitGraph className="text-violet-400" size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">最適化グラフ</h1>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            {graph.nodes.length} ノード · {graph.edges.length} エッジ · DAG 依存解決
          </p>
        </div>
      </div>

      {/* Apply plan panel */}
      {applyPlan && <ApplyPlanPanel plan={applyPlan} graph={graph} />}

      {/* Legend */}
      <div className="flex items-center gap-5 px-1">
        <span className="text-[10px] text-muted-foreground/55 uppercase tracking-wider">凡例</span>
        {(Object.entries(EDGE_CONFIG) as [EdgeType, typeof EDGE_CONFIG[EdgeType]][]).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1.5">
            <svg width="24" height="10">
              <line
                x1="0" y1="5" x2="24" y2="5"
                stroke={cfg.stroke}
                strokeWidth="2"
                strokeDasharray={cfg.dash || undefined}
              />
            </svg>
            <span className="text-[10px] text-muted-foreground/60">{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4">
          <span className="w-4 h-4 rounded-full bg-white/15 text-[10px] font-bold flex items-center justify-center text-white/80">1</span>
          <span className="text-[10px] text-muted-foreground/60">適用順</span>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#05080c]">
        <div className="relative" style={{ width: totalWidth, height: totalHeight, minWidth: totalWidth }}>

          {/* Category column headers */}
          {CATEGORY_ORDER.map((cat, col) => {
            const sty = CATEGORY_STYLE[cat];
            const hasNodes = graph.nodes.some(n => n.category === cat);
            if (!hasNodes) return null;
            return (
              <div
                key={cat}
                className={`absolute flex items-center justify-center text-[10px] font-semibold rounded-t-md ${sty.color} ${sty.headerBg}`}
                style={{ left: col * COL_WIDTH + PAD_X, top: 8, width: NODE_W, height: 28 }}
              >
                {sty.label}
              </div>
            );
          })}

          {/* SVG edge layer */}
          <svg
            className="absolute inset-0 pointer-events-none overflow-visible"
            width={totalWidth}
            height={totalHeight}
          >
            <defs>
              {(Object.entries(EDGE_CONFIG) as [EdgeType, typeof EDGE_CONFIG[EdgeType]][]).map(([type, cfg]) => (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <path d="M 0 0 L 8 3 L 0 6 Z" fill={cfg.markerColor} opacity="0.8" />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge, i) => {
              const src = positions.get(edge.from);
              const dst = positions.get(edge.to);
              if (!src || !dst) return null;
              const cfg = EDGE_CONFIG[edge.edge_type];
              return (
                <path
                  key={i}
                  d={edgePath(src, dst)}
                  fill="none"
                  stroke={cfg.stroke}
                  strokeWidth="1.5"
                  strokeDasharray={cfg.dash || undefined}
                  strokeOpacity="0.6"
                  markerEnd={`url(#arrow-${edge.edge_type})`}
                />
              );
            })}
          </svg>

          {/* Node cards */}
          {graph.nodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const orderIdx = applyOrderIdx.get(node.id) ?? null;
            return (
              <div
                key={node.id}
                className="absolute"
                style={{ left: pos.left, top: pos.top, width: NODE_W, height: NODE_H }}
                onClick={() => setSelectedId(id => id === node.id ? null : node.id)}
              >
                <NodeCard
                  node={node}
                  selected={selectedId === node.id}
                  orderIndex={applyOrderSet.has(node.id) ? orderIdx : null}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected node detail */}
      {selectedId && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Info size={12} className="text-muted-foreground/50" />
            <span className="text-[11px] text-muted-foreground/50">ノード詳細</span>
          </div>
          <NodeDetailPanel nodeId={selectedId} graph={graph} />
        </div>
      )}
    </div>
  );
}
