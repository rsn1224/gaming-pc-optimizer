/**
 * BenchmarkHistoryChart — ベンチマーク履歴チャート (ENABLE_BENCHMARK_HISTORY)
 *
 * 直近のベンチマーク結果を時系列 SVG ラインチャートと
 * テーブルリストで表示する。
 */
import { useState } from "react";
import { BarChart3, List, Trash2, RefreshCw, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BenchmarkRecord } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  return d.toLocaleDateString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(score: number): string {
  if (score >= 1500) return "text-cyan-400";
  if (score >= 1000) return "text-emerald-400";
  if (score >= 600)  return "text-amber-400";
  return "text-red-400";
}

// ── SVG sparkline chart ───────────────────────────────────────────────────────

function HistoryLineChart({ records }: { records: BenchmarkRecord[] }) {
  // records are newest-first; reverse for left→right chronological
  const sorted = [...records].reverse().slice(-20);
  if (sorted.length < 2) return null;

  const W = 420;
  const H = 80;
  const PAD_L = 36;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 20;

  const scores = sorted.map((r) => r.totalScore);
  const minScore = Math.max(0, Math.min(...scores) - 100);
  const maxScore = Math.max(...scores) + 100;
  const range = maxScore - minScore || 1;

  const toX = (i: number) =>
    PAD_L + (i / (sorted.length - 1)) * (W - PAD_L - PAD_R);
  const toY = (v: number) =>
    PAD_T + (1 - (v - minScore) / range) * (H - PAD_T - PAD_B);

  const points = sorted.map((r, i) => `${toX(i)},${toY(r.totalScore)}`).join(" ");
  const latestScore = scores[scores.length - 1];
  const prevScore   = scores[scores.length - 2];
  const delta       = latestScore - prevScore;

  // Y-axis labels
  const yLabels = [minScore + range, minScore + range / 2, minScore].map((v) =>
    Math.round(v)
  );

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible max-h-[100px]"
      >
        {/* Y-axis gridlines + labels */}
        {yLabels.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 4}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground/55"
                fontSize="8"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <polyline
          points={[
            `${toX(0)},${H - PAD_B}`,
            ...sorted.map((r, i) => `${toX(i)},${toY(r.totalScore)}`),
            `${toX(sorted.length - 1)},${H - PAD_B}`,
          ].join(" ")}
          fill="rgba(139,92,246,0.08)"
          stroke="none"
        />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="rgba(139,92,246,0.7)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots */}
        {sorted.map((r, i) => (
          <circle
            key={r.id}
            cx={toX(i)}
            cy={toY(r.totalScore)}
            r="2.5"
            fill={i === sorted.length - 1 ? "rgb(139,92,246)" : "rgba(139,92,246,0.4)"}
          />
        ))}
      </svg>

      {/* Delta badge */}
      <div className="flex items-center justify-end gap-1 mt-1">
        {delta > 0 ? (
          <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
            <TrendingUp size={9} /> +{delta} pts
          </span>
        ) : delta < 0 ? (
          <span className="flex items-center gap-0.5 text-[10px] text-rose-400">
            <TrendingDown size={9} /> {delta} pts
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/55">
            <Minus size={9} /> 変化なし
          </span>
        )}
      </div>
    </div>
  );
}

// ── Run list row ──────────────────────────────────────────────────────────────

function RunRow({
  record,
  prev,
}: {
  record: BenchmarkRecord;
  prev: BenchmarkRecord | null;
}) {
  const delta = prev ? record.totalScore - prev.totalScore : null;
  const color = scoreColor(record.totalScore);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      <div className="w-20 shrink-0">
        <p className="text-[11px] text-muted-foreground/50">{formatDate(record.runAt)}</p>
      </div>
      <div className={cn("text-[13px] font-bold tabular-nums w-14 shrink-0", color)}>
        {record.totalScore}
      </div>
      <div className="flex-1 flex items-center gap-2 text-[10px] text-muted-foreground/55 tabular-nums">
        <span>CPU {record.cpuScore}</span>
        <span>MEM {record.memoryScore}</span>
        <span>DSK {record.diskScore}</span>
      </div>
      {delta !== null && (
        <span
          className={cn(
            "text-[10px] font-semibold tabular-nums shrink-0",
            delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground/30"
          )}
        >
          {delta > 0 ? "+" : ""}{delta}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface BenchmarkHistoryChartProps {
  records: BenchmarkRecord[];
  loading: boolean;
  onRefresh: () => void;
  onClear: () => void;
}

export function BenchmarkHistoryChart({
  records,
  loading,
  onRefresh,
  onClear,
}: BenchmarkHistoryChartProps) {
  const [view, setView] = useState<"chart" | "list">("chart");
  const [confirmClear, setConfirmClear] = useState(false);

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    onClear();
    setConfirmClear(false);
  }

  const best = records.length > 0 ? Math.max(...records.map((r) => r.totalScore)) : null;

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className="text-violet-400" />
          <span className="text-[12px] font-semibold text-muted-foreground/80">
            履歴
          </span>
          {best !== null && (
            <span className="text-[10px] text-muted-foreground/55">
              ベスト: <span className="text-violet-400 font-semibold">{best}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setView("chart")}
              aria-label="チャート表示"
              className={cn(
                "px-2 py-1 text-[10px] transition-colors",
                view === "chart"
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-muted-foreground/55 hover:text-muted-foreground bg-white/[0.02]"
              )}
            >
              <BarChart3 size={10} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="リスト表示"
              className={cn(
                "px-2 py-1 text-[10px] transition-colors",
                view === "list"
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-muted-foreground/55 hover:text-muted-foreground bg-white/[0.02]"
              )}
            >
              <List size={10} />
            </button>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="履歴を更新"
            className="text-muted-foreground/55 hover:text-muted-foreground transition-colors disabled:opacity-30"
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          </button>
          {records.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors",
                confirmClear
                  ? "bg-rose-500/20 border-rose-500/30 text-rose-300"
                  : "border-white/[0.06] text-muted-foreground/55 hover:text-muted-foreground"
              )}
            >
              <Trash2 size={9} />
              {confirmClear ? "確認" : "削除"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground/55">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">読み込み中...</span>
          </div>
        ) : records.length === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground/30 py-6">
            ベンチマークを実行すると履歴が表示されます
          </p>
        ) : view === "chart" ? (
          <HistoryLineChart records={records} />
        ) : (
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {records.map((r, i) => (
              <RunRow
                key={r.id}
                record={r}
                prev={records[i + 1] ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
