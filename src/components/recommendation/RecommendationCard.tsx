/**
 * RecommendationCard — 推奨エンジン V2 ウィジェット
 *
 * ENABLE_RECOMMENDATION_V2 が true のときのみ HomeHub から呼び出される。
 *
 * 表示フロー:
 *   idle → intent 選択 + 「推奨を取得」ボタン
 *   loading → スピナー
 *   result → RecommendationItem カード一覧 + summary
 *   error → エラーメッセージ（ENABLE_RECOMMENDATION_V2 = false 時のガイドを含む）
 */
import { useState } from "react";
import {
  Sparkles, Loader2, AlertTriangle, ChevronRight,
  TrendingUp, Minus, TrendingDown, ShieldCheck, ShieldAlert, ShieldX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecommendationStore } from "@/stores/useRecommendationStore";
import type { RecommendationIntent, RecommendationItem, SystemInfo } from "@/types";

// ── Intent selector ───────────────────────────────────────────────────────────

const INTENTS: { value: RecommendationIntent; label: string; desc: string }[] = [
  { value: "fps",       label: "FPS最大化",   desc: "最高フレームレート優先" },
  { value: "stability", label: "安定性優先",   desc: "クラッシュ・フリーズを防ぐ" },
  { value: "silence",   label: "静音・省電力", desc: "ファンノイズと消費電力を抑える" },
  { value: "balanced",  label: "バランス",     desc: "パフォーマンスと安定性のバランス" },
];

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  if (level === "safe")
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-emerald-400">
        <ShieldCheck size={9} /> safe
      </span>
    );
  if (level === "caution")
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-400">
        <ShieldAlert size={9} /> caution
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-[9px] font-semibold text-red-400">
      <ShieldX size={9} /> advanced
    </span>
  );
}

// ── Impact pill ───────────────────────────────────────────────────────────────

function ImpactPill({ item }: { item: RecommendationItem }) {
  const { fps, latencyMs } = item.expectedImpact;
  if (fps != null && fps !== 0) {
    const positive = fps > 0;
    return (
      <span
        className={cn(
          "flex items-center gap-0.5 text-[9px] tabular-nums font-semibold",
          positive ? "text-emerald-400" : "text-amber-400"
        )}
      >
        {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
        {positive ? "+" : ""}{fps} fps
      </span>
    );
  }
  if (latencyMs != null && latencyMs !== 0) {
    const positive = latencyMs < 0;
    return (
      <span
        className={cn(
          "flex items-center gap-0.5 text-[9px] tabular-nums font-semibold",
          positive ? "text-emerald-400" : "text-amber-400"
        )}
      >
        {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
        {latencyMs}ms
      </span>
    );
  }
  return <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground/40"><Minus size={9} />—</span>;
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-slate-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] tabular-nums text-muted-foreground/50 w-7 text-right">{pct}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface RecommendationCardProps {
  sysInfo?: SystemInfo | null;
}

export function RecommendationCard({ sysInfo }: RecommendationCardProps) {
  const { result, loading, error, generate, clearResult, clearError } =
    useRecommendationStore();
  const [intent, setIntent] = useState<RecommendationIntent>("balanced");

  const handleGenerate = () => {
    clearError();
    generate({
      intent,
      system: {
        osVersion: sysInfo?.os_version ?? "Windows 11",
        cpu: sysInfo?.cpu_name,
        memoryGb: sysInfo
          ? Math.round(sysInfo.memory_total_mb / 1024)
          : undefined,
      },
    });
  };

  const isFlagDisabled =
    error?.includes("ENABLE_RECOMMENDATION_V2 is disabled") ?? false;

  return (
    <div className="flex flex-col gap-3">

      {/* Intent selector */}
      {!result && !loading && (
        <div className="grid grid-cols-2 gap-1.5">
          {INTENTS.map((it) => (
            <button
              key={it.value}
              type="button"
              onClick={() => setIntent(it.value)}
              className={cn(
                "px-2.5 py-2 rounded-lg border text-left transition-all",
                intent === it.value
                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                  : "bg-white/[0.02] border-white/[0.06] text-muted-foreground/60 hover:border-white/[0.12]"
              )}
            >
              <p className="text-[11px] font-semibold">{it.label}</p>
              <p className="text-[9px] mt-0.5 opacity-70">{it.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* Generate button */}
      {!result && !loading && (
        <button
          type="button"
          onClick={handleGenerate}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-500/80 to-cyan-500/80 hover:from-violet-500 hover:to-cyan-500 text-white transition-all active:scale-[0.97]"
        >
          <Sparkles size={12} />
          推奨を取得
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-2 py-6">
          <Loader2 size={22} className="text-violet-400 animate-spin" />
          <p className="text-xs text-muted-foreground/60">AI が推奨を生成中...</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {isFlagDisabled ? (
              <>
                <p className="text-xs font-medium text-red-300">推奨エンジン V2 は無効です</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  recommendation.rs の ENABLE_RECOMMENDATION_V2 を true に設定してください。
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-red-300">推奨の取得に失敗しました</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5 break-all">{error}</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-muted-foreground/40 hover:text-muted-foreground text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Result */}
      {!loading && result && (
        <>
          {/* Summary + model */}
          <div className="flex items-start gap-2 p-3 bg-violet-500/8 border border-violet-500/15 rounded-xl">
            <Sparkles size={12} className="text-violet-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground/80 leading-relaxed">{result.summary}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] text-muted-foreground/40 truncate">
                  {result.model}
                </span>
                {result.fallbackUsed && (
                  <span className="text-[9px] text-amber-400/70 shrink-0">
                    · ルールベース
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-1.5">
            {result.items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "p-3 rounded-xl border",
                  item.riskLevel === "safe"     && "bg-white/[0.02] border-white/[0.06]",
                  item.riskLevel === "caution"  && "bg-amber-500/5 border-amber-500/15",
                  item.riskLevel === "advanced" && "bg-red-500/5 border-red-500/15"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-xs font-semibold text-slate-200 leading-snug">{item.title}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <ImpactPill item={item} />
                    <RiskBadge level={item.riskLevel} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed mb-2">
                  {item.reason}
                </p>
                <ConfidenceBar value={item.confidence} />
              </div>
            ))}
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={clearResult}
            className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <ChevronRight size={10} className="rotate-180" />
            別の推奨を取得
          </button>
        </>
      )}
    </div>
  );
}
