import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gauge, Loader2, Cpu, MemoryStick, HardDrive, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BenchmarkHistoryChart } from "./BenchmarkHistoryChart";
import type { BenchmarkResult, BenchmarkRecord } from "@/types";
import { ENABLE_BENCHMARK_HISTORY } from "@/config/features";

// ── Score rating ──────────────────────────────────────────────────────────────

function rateScore(score: number): { label: string; color: string } {
  if (score >= 1500) return { label: "ハイエンド", color: "text-cyan-400" };
  if (score >= 1000) return { label: "高性能", color: "text-emerald-400" };
  if (score >= 600)  return { label: "標準的", color: "text-amber-400" };
  return { label: "低性能", color: "text-red-400" };
}

function ringColor(score: number) {
  if (score >= 1500) return "text-cyan-400";
  if (score >= 1000) return "text-emerald-400";
  if (score >= 600)  return "text-amber-400";
  return "text-red-400";
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, max = 2000 }: { score: number; max?: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / max, 1);
  const dash = pct * circ;
  const color = ringColor(score);

  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      <svg width="112" height="112" className="-rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-white/[0.05]" />
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="11"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={`${color} opacity-20 blur-[3px]`} />
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={`${color} [transition:stroke-dasharray_0.8s_ease]`} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold leading-none tabular-nums ${color}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground/50 mt-1 tracking-widest uppercase">score</span>
      </div>
    </div>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({
  icon,
  label,
  score,
  ms,
}: {
  icon: React.ReactNode;
  label: string;
  score: number;
  ms: number;
}) {
  const { label: rating, color } = rateScore(score);
  const pct = Math.min((score / 2000) * 100, 100);
  const barColor = score >= 1500 ? "bg-cyan-400" : score >= 1000 ? "bg-emerald-400" : score >= 600 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.07] shrink-0">
        <span className="text-muted-foreground/70">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] font-semibold text-slate-200">{label}</span>
          <span className={`text-[11px] font-bold ${color}`}>{score} <span className="text-muted-foreground/55 font-normal">pts</span></span>
        </div>
        {/* Segmented bar */}
        <div className="flex gap-0.5">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => (
            <div
              key={t}
              className={cn("flex-1 h-1 rounded-sm transition-colors duration-700",
                pct >= t ? barColor : "bg-white/[0.07]"
              )}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/55 mt-1">
          {rating} · {ms}ms
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Benchmark() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [prev, setPrev] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // History
  const [history, setHistory] = useState<BenchmarkRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!ENABLE_BENCHMARK_HISTORY) return;
    setHistoryLoading(true);
    try {
      const h = await invoke<BenchmarkRecord[]>("get_benchmark_history");
      setHistory(h);
    } catch {
      // silently ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const runBenchmark = async () => {
    setRunning(true);
    setError(null);
    setPrev(result);
    setResult(null);

    try {
      setStep("CPU計測中...");
      // Small delay so UI renders
      await new Promise((r) => setTimeout(r, 50));
      const res = await invoke<BenchmarkResult>("run_benchmark");
      setResult(res);
      // Auto-save to history when feature is enabled
      if (ENABLE_BENCHMARK_HISTORY) {
        try {
          await invoke("save_benchmark_result", {
            cpuScore:    res.cpu_score,
            memoryScore: res.memory_score,
            diskScore:   res.disk_score,
            totalScore:  res.total_score,
            cpuMs:       res.cpu_ms,
            memoryMs:    res.memory_ms,
            diskMs:      res.disk_ms,
          });
          await fetchHistory();
        } catch {
          // history save failure is non-fatal
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
      setStep(null);
    }
  };

  async function handleClearHistory() {
    try {
      await invoke("clear_benchmark_history");
      setHistory([]);
    } catch {
      // ignore
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Gauge size={16} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-100">ベンチマーク</h1>
            <p className="text-[11px] text-muted-foreground/50">
              CPU・メモリ・ディスクの性能を計測
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5 max-w-2xl">
        {/* Run button */}
        <button
          type="button"
          onClick={runBenchmark}
          disabled={running}
          className={cn(
            "w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all",
            running
              ? "bg-violet-500/10 text-violet-400/50 cursor-not-allowed border border-violet-500/15"
              : "bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:brightness-110 active:scale-[0.98]"
          )}
        >
          {running ? (
            <><Loader2 size={16} className="animate-spin" />{step ?? "計測中..."}</>
          ) : (
            <><Zap size={16} />ベンチマーク開始</>
          )}
        </button>

        {/* Results */}
        {result && (
          <>
            {/* Total score */}
            <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden">
              <div className="h-[1px] bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
              <div className="p-5 flex items-center gap-5">
                <ScoreRing score={result.total_score} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">総合スコア</p>
                  <p className={`text-lg font-bold mt-0.5 ${rateScore(result.total_score).color}`}>
                    {rateScore(result.total_score).label}
                  </p>
                  {prev && (
                    <p className={cn("text-[12px] mt-1 font-semibold",
                      result.total_score >= prev.total_score ? "text-emerald-400" : "text-red-400"
                    )}>
                      {result.total_score >= prev.total_score ? "▲" : "▼"}
                      {" "}{Math.abs(result.total_score - prev.total_score)} pts
                      {" "}({result.total_score >= prev.total_score ? "+" : ""}{(((result.total_score - prev.total_score) / prev.total_score) * 100).toFixed(1)}%)
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground/55 mt-1">
                    基準値: 1000pts = 標準的なPC
                  </p>
                </div>
              </div>
            </div>

            {/* Per-category */}
            <div className="flex flex-col gap-2">
              <CategoryRow icon={<Cpu size={16} />} label="CPU" score={result.cpu_score} ms={result.cpu_ms} />
              <CategoryRow icon={<MemoryStick size={16} />} label="メモリ" score={result.memory_score} ms={result.memory_ms} />
              <CategoryRow icon={<HardDrive size={16} />} label="ディスク" score={result.disk_score} ms={result.disk_ms} />
            </div>
          </>
        )}

        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!result && !running && !error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/55">
            <Gauge size={36} />
            <p className="text-[13px]">「ベンチマーク開始」を押して計測</p>
            <p className="text-[11px] text-center leading-relaxed">
              CPU・メモリ・ディスクの3項目を計測します<br />
              完了まで10〜30秒かかります
            </p>
          </div>
        )}

        {/* History chart (ENABLE_BENCHMARK_HISTORY) */}
        {ENABLE_BENCHMARK_HISTORY && (
          <BenchmarkHistoryChart
            records={history}
            loading={historyLoading}
            onRefresh={fetchHistory}
            onClear={handleClearHistory}
          />
        )}
      </div>
    </div>
  );
}
