/**
 * RecommendationMetricsPanel — 推奨エンジン V2 メトリクス表示
 *
 * Settings.tsx の AI セクション内に埋め込む。
 * ENABLE_RECOMMENDATION_V2 の ON/OFF に関わらず表示（履歴があれば見える）。
 */
import { useState, useEffect, useCallback } from "react";
import { BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRecommendationMetrics } from "@/services/recommendationService";
import type { MetricsSummary, ModelMetrics } from "@/types";

// ── Range selector ────────────────────────────────────────────────────────────

const RANGES: { label: string; hours: number }[] = [
  { label: "1h",  hours: 1  },
  { label: "6h",  hours: 6  },
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 168 },
];

// ── Model row ─────────────────────────────────────────────────────────────────

function ModelRow({ m }: { m: ModelMetrics }) {
  const successPct  = Math.round(m.successRate  * 100);
  const fallbackPct = Math.round(m.fallbackRate * 100);
  const shortName   = m.model.replace("claude-", "").replace("-20251001", "");

  return (
    <div className="flex flex-col gap-1.5 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-200 truncate">{shortName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-muted-foreground/50 tabular-nums">
            {m.totalCalls}件
          </span>
          <span className="text-[9px] tabular-nums text-muted-foreground/50">
            avg {m.avgLatencyMs.toFixed(0)}ms
          </span>
        </div>
      </div>

      {/* Success rate bar */}
      <div>
        <div className="flex justify-between mb-0.5">
          <span className="text-[9px] text-muted-foreground/50">成功率</span>
          <span className={cn(
            "text-[9px] font-semibold tabular-nums",
            successPct >= 80 ? "text-emerald-400" : successPct >= 50 ? "text-amber-400" : "text-red-400"
          )}>
            {successPct}%
          </span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              successPct >= 80 ? "bg-emerald-500" : successPct >= 50 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${successPct}%` }}
          />
        </div>
      </div>

      {/* Fallback badge */}
      {fallbackPct > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground/40">フォールバック率:</span>
          <span className={cn(
            "text-[9px] font-semibold tabular-nums",
            fallbackPct >= 50 ? "text-amber-400" : "text-muted-foreground/60"
          )}>
            {fallbackPct}%
          </span>
          {fallbackPct === 100 && (
            <span className="text-[9px] text-muted-foreground/40">
              （APIキー未設定またはエラー）
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RecommendationMetricsPanel() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [rangeHours, setRangeHours] = useState(24);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRecommendationMetrics(rangeHours);
      setSummary(data);
    } catch {
      // silently fail — metrics are optional
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [rangeHours]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const hasData = summary && summary.models.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={12} className="text-violet-400" />
          <span className="text-[11px] font-semibold text-muted-foreground/70">
            呼び出しメトリクス
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Range tabs */}
          <div className="flex">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                type="button"
                onClick={() => setRangeHours(r.hours)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium transition-colors first:rounded-l-md last:rounded-r-md border border-white/[0.08]",
                  rangeHours === r.hours
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                    : "text-muted-foreground/50 hover:text-muted-foreground bg-white/[0.02]"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={fetchMetrics}
            disabled={loading}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-50"
            aria-label="更新"
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && !hasData ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 size={14} className="text-violet-400 animate-spin" />
          <span className="text-[11px] text-muted-foreground/50">読み込み中...</span>
        </div>
      ) : hasData ? (
        <div className="space-y-2">
          {summary.models.map((m) => (
            <ModelRow key={m.model} m={m} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-4">
          <p className="text-[11px] text-muted-foreground/40">
            まだ呼び出し履歴がありません — ENABLE_RECOMMENDATION_V2 を有効にしてください
          </p>
        </div>
      )}
    </div>
  );
}
