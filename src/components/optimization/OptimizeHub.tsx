/**
 * OptimizeHub — 最適化 + プリセット統合ページ
 * 統合効果: 現在スコアに基づくAIプリセット推奨 + プリセット選択の即時適用
 */
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { GameMode } from "./GameMode";
import { Presets } from "./Presets";
import type { OptimizationScore, PresetInfo } from "@/types";
import { Gauge, Sparkles, ArrowRight, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "optimize", label: "最適化" },
  { id: "presets", label: "プリセット" },
];

function scoreColor(v: number) {
  if (v >= 80) return "text-emerald-400";
  if (v >= 60) return "text-amber-400";
  return "text-red-400";
}

function recommendPreset(score: number, presets: PresetInfo[]): PresetInfo | null {
  if (score < 50) return presets.find((p) => p.id === "esports") ?? null;
  if (score < 75) return presets.find((p) => p.id === "esports") ?? null;
  return null;
}

export function OptimizeHub() {
  const [tab, setTab] = useState("optimize");
  const [score, setScore] = useState<OptimizationScore | null>(null);
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      invoke<OptimizationScore>("get_optimization_score").catch(() => null),
      invoke<PresetInfo[]>("list_presets").catch(() => []),
    ]).then(([s, p]) => {
      setScore(s);
      setPresets(p as PresetInfo[]);
      setLoading(false);
    });
  }, []);

  const recommended = score && presets.length > 0 ? recommendPreset(score.overall, presets) : null;
  const scoreVal = score?.overall ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Zap size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">最適化ハブ</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">プリセット · AI推奨</p>
        </div>
      </div>
      {/* ── Insight Panel ── */}
      <div className="shrink-0 mx-4 mb-1 bg-[#141414] border border-white/[0.10] rounded-xl px-4 py-3 flex items-center gap-4">
        {loading ? (
          <Loader2 size={14} className="text-muted-foreground/50 animate-spin" />
        ) : (
          <>
            {/* Score ring */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="relative w-10 h-10">
                <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke={scoreVal >= 80 ? "#34d399" : scoreVal >= 60 ? "#fbbf24" : "#f87171"}
                    strokeWidth="3"
                    strokeDasharray={`${(scoreVal / 100) * 87.96} 87.96`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-bold", scoreColor(scoreVal))}>
                  {Math.round(scoreVal)}
                </span>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">最適化スコア</p>
                <p className={cn("text-sm font-semibold", scoreColor(scoreVal))}>
                  {scoreVal >= 80 ? "最適化済み" : scoreVal >= 60 ? "改善の余地あり" : "要最適化"}
                </p>
              </div>
            </div>

            <div className="w-px h-8 bg-white/[0.06] shrink-0" />

            {/* Recommended preset */}
            {recommended ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Sparkles size={14} className="text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground/50">AI 推奨</p>
                  <p className="text-xs font-medium text-white truncate">{recommended.name}</p>
                  <p className="text-[10px] text-muted-foreground/50 truncate">{recommended.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("presets")}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  適用 <ArrowRight size={10} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <Gauge size={14} className="text-emerald-400" />
                <p className="text-xs text-emerald-400">現在のパフォーマンスは良好です</p>
              </div>
            )}
          </>
        )}
      </div>

      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "optimize" && <GameMode />}
        {tab === "presets" && <Presets />}
      </div>
    </div>
  );
}
