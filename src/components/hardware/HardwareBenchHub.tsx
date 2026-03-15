/**
 * HardwareBenchHub — ハードウェア + ベンチマーク 統合ページ
 * 統合効果:
 *  - ライブ温度バーを常時表示、高温時はベンチマーク前に警告
 *  - 最新ベンチ結果をロード → AI（ルールベース）でボトルネックを特定
 *  - 高温 × 低スコアの相関を自動検出
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { HardwareHub } from "./HardwareHub";
import { Benchmark } from "@/components/benchmark/Benchmark";
import type { TempSnapshot, BenchmarkRecord } from "@/types";
import { Thermometer, AlertTriangle, Bot, Cpu, MemoryStick, HardDrive, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "hardware", label: "ハードウェア" },
  { id: "benchmark", label: "ベンチマーク" },
];

const POLL_MS = 4000;
const WARN_GPU = 80;
const WARN_CPU = 85;

// ── Temp bar ──────────────────────────────────────────────────────────────────

function TempBar({ label, value, warn }: { label: string; value: number; warn: number }) {
  const pct = Math.min(100, (value / 110) * 100);
  const hot = value >= warn;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground/50 w-7 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", hot ? "bg-red-400" : "bg-cyan-400/70")}
          ref={(el) => { if (el) el.style.width = `${pct}%`; }}
        />
      </div>
      <span className={cn("text-[11px] font-mono tabular-nums w-10 text-right shrink-0", hot ? "text-red-400 font-bold" : "text-muted-foreground/70")}>
        {value > 0 ? `${Math.round(value)}°C` : "—"}
      </span>
    </div>
  );
}

// ── AI bottleneck analysis ────────────────────────────────────────────────────

interface BottleneckReport {
  bottleneck: "cpu" | "memory" | "disk" | "balanced";
  summary: string;
  tip: string;
  thermalWarning: boolean;
}

function analyzeBottleneck(latest: BenchmarkRecord, prev: BenchmarkRecord | null, gpuTemp: number): BottleneckReport {
  const { cpuScore, memoryScore, diskScore, totalScore } = latest;
  const avg = (cpuScore + memoryScore + diskScore) / 3;

  // Find the lowest relative sub-score
  const ratios = [
    { key: "cpu" as const, score: cpuScore, label: "CPU" },
    { key: "memory" as const, score: memoryScore, label: "メモリ" },
    { key: "disk" as const, score: diskScore, label: "ディスク" },
  ];
  ratios.sort((a, b) => a.score - b.score);
  const weakest = ratios[0];
  const gap = avg - weakest.score;

  const thermalWarning = gpuTemp >= WARN_GPU;
  const trend = prev ? totalScore - prev.totalScore : null;

  let bottleneck: BottleneckReport["bottleneck"] = "balanced";
  let summary = "";
  let tip = "";

  if (gap < 80) {
    bottleneck = "balanced";
    summary = `スコア ${totalScore} — バランスの取れた構成です。`;
    tip = "全体的なスコアを上げるにはメモリのデュアルチャネル化が最も費用対効果が高いです。";
  } else {
    bottleneck = weakest.key;
    if (weakest.key === "cpu") {
      summary = `CPU がボトルネックです（スコア ${cpuScore}）。GPU の能力を十分に引き出せていない可能性があります。`;
      tip = "ゲームを優先するプロセスの終了と、Ultimate Performance 電源プランの適用を試してください。";
    } else if (weakest.key === "memory") {
      summary = `メモリ帯域幅がボトルネックです（スコア ${memoryScore}）。RAM の速度または空き容量が不足しています。`;
      tip = "メモリクリーナーを実行してワーキングセットを解放するか、XMP/EXPO プロファイルの有効化を検討してください。";
    } else {
      summary = `ストレージが遅いです（スコア ${diskScore}）。ゲームのロード時間やシェーダーコンパイルに影響します。`;
      tip = "ストレージのクリーンアップを実行し、デフラグまたは TRIM を試してください。";
    }
  }

  if (thermalWarning) {
    summary = `⚠ GPU 高温（${Math.round(gpuTemp)}°C）でベンチを実行 — スコアが抑制されている可能性があります。冷却後に再計測を推奨。`;
  }

  if (trend !== null) {
    const pct = ((trend / prev!.totalScore) * 100).toFixed(1);
    if (Math.abs(trend) > 30) {
      summary += ` 前回比 ${trend > 0 ? "+" : ""}${pct}%。`;
    }
  }

  return { bottleneck, summary, tip, thermalWarning };
}

// ── Main component ────────────────────────────────────────────────────────────

export function HardwareBenchHub() {
  const [tab, setTab] = useState("hardware");
  const [snap, setSnap] = useState<TempSnapshot | null>(null);
  const [latestBench, setLatestBench] = useState<BenchmarkRecord | null>(null);
  const [prevBench, setPrevBench] = useState<BenchmarkRecord | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const s = await invoke<TempSnapshot>("get_temperature_snapshot").catch(() => null);
    if (s) setSnap(s);
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL_MS);

    // Load latest benchmark history
    invoke<BenchmarkRecord[]>("get_benchmark_history")
      .then((history) => {
        if (history.length > 0) setLatestBench(history[0]);
        if (history.length > 1) setPrevBench(history[1]);
      })
      .catch(() => {});

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [poll]);

  const gpuTemp = snap?.gpu_temp_c ?? 0;
  const cpuTemp = snap?.cpu_temp_c ?? 0;
  const gpuHot = gpuTemp >= WARN_GPU;
  const cpuHot = cpuTemp >= WARN_CPU;
  const anyHot = gpuHot || cpuHot;
  const report = latestBench ? analyzeBottleneck(latestBench, prevBench, gpuTemp) : null;

  const subScoreItems = latestBench ? [
    { label: "CPU",      score: latestBench.cpuScore,    icon: <Cpu size={11} /> },
    { label: "メモリ",   score: latestBench.memoryScore, icon: <MemoryStick size={11} /> },
    { label: "ディスク", score: latestBench.diskScore,   icon: <HardDrive size={11} /> },
  ] : [];

  const trend = latestBench && prevBench ? latestBench.totalScore - prevBench.totalScore : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Cpu size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">ハードウェア</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">温度監視 · ベンチマーク · AI解析</p>
        </div>
      </div>
      {/* ── Insight Panel ── */}
      <div className="shrink-0 mx-4 mb-1 space-y-2">

        {/* Live temp bar */}
        {snap && (
          <div className={cn(
            "border rounded-xl px-4 py-2.5",
            anyHot ? "bg-red-500/[0.04] border-red-500/20" : "bg-[#141414] border-white/[0.10]"
          )}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 shrink-0">
                <Thermometer size={12} className={anyHot ? "text-red-400" : "text-cyan-400"} />
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">ライブ温度</span>
              </div>
              <div className="flex-1 flex flex-col gap-1">
                {gpuTemp > 0 && <TempBar label="GPU" value={gpuTemp} warn={WARN_GPU} />}
                {cpuTemp > 0 && <TempBar label="CPU" value={cpuTemp} warn={WARN_CPU} />}
              </div>
              {anyHot && tab === "benchmark" && (
                <div className="shrink-0 flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                  <AlertTriangle size={10} />
                  高温: 結果不正確の恐れ
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Benchmark Interpreter */}
        {report && latestBench && (
          <div className={cn(
            "border rounded-xl px-4 py-3",
            report.thermalWarning
              ? "bg-red-500/[0.04] border-red-500/20"
              : report.bottleneck === "balanced"
                ? "bg-[#141414] border-emerald-500/20"
                : "bg-[#141414] border-white/[0.10]"
          )}>
            <div className="flex items-start gap-3">
              <Bot size={13} className={cn("shrink-0 mt-0.5",
                report.thermalWarning ? "text-red-400" :
                report.bottleneck === "balanced" ? "text-emerald-400" : "text-amber-400"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">AI ベンチ解析</span>
                  {/* Sub-score mini bars */}
                  <div className="flex items-center gap-2 ml-auto">
                    {subScoreItems.map(({ label, score, icon }) => (
                      <div key={label} className="flex items-center gap-1">
                        <span className="text-muted-foreground/40">{icon}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground/60">{score}</span>
                      </div>
                    ))}
                    {trend !== null && (
                      <div className={cn("flex items-center gap-0.5 text-[10px] font-medium",
                        trend > 0 ? "text-emerald-400" : trend < 0 ? "text-red-400" : "text-muted-foreground/50"
                      )}>
                        {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                        {trend > 0 ? "+" : ""}{trend}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-white/80 leading-relaxed">{report.summary}</p>
                {!report.thermalWarning && (
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    💡 {report.tip}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setTab("benchmark")}
                  className="mt-2 text-[10px] text-orange-400/60 hover:text-orange-400 transition-colors"
                >
                  再ベンチマーク →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No bench yet */}
        {!latestBench && (
          <div className="bg-[#141414] border border-white/[0.10] rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Bot size={12} className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/50">
              ベンチマークを実行するとAIがボトルネックを診断します
            </p>
            <button
              type="button"
              onClick={() => setTab("benchmark")}
              className="ml-auto text-[10px] text-orange-400/60 hover:text-orange-400 transition-colors shrink-0"
            >
              実行 →
            </button>
          </div>
        )}
      </div>

      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "hardware" && <HardwareHub />}
        {tab === "benchmark" && <Benchmark />}
      </div>
    </div>
  );
}
