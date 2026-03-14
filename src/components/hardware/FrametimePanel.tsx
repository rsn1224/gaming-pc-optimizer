/**
 * FrametimePanel — リアルタイム CPU/GPU パフォーマンスモニター
 * (ENABLE_FRAMETIME_OVERLAY)
 *
 * 機能:
 *   - 60 サンプルのローリングウィンドウ（1s ごと）
 *   - CPU% + GPU% デュアルライン SVG チャート
 *   - 1% Low / 0.1% Low 相当の安定度指標
 *   - Tauri イベント `perf_snapshot` / `perf_stats` をリアルタイムで受信
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  Cpu,
  Monitor,
  Play,
  Square,
  RefreshCw,
  Thermometer,
  MemoryStick,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PerfSnapshot, PerformanceStats } from "@/types";

// ── Feature flag ─────────────────────────────────────────────────────────────

export const ENABLE_FRAMETIME_OVERLAY = false;

// ── SVG chart ─────────────────────────────────────────────────────────────────

const CHART_W = 400;
const CHART_H = 80;
const MAX_SAMPLES = 60;

function buildPath(values: number[], color: string) {
  if (values.length < 2) return null;
  const step = CHART_W / (MAX_SAMPLES - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = CHART_H - (Math.min(v, 100) / 100) * CHART_H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <polyline
      points={points.join(" ")}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

function PerfChart({ snapshots }: { snapshots: PerfSnapshot[] }) {
  const cpuValues = snapshots.map((s) => s.cpuPercent);
  const gpuValues = snapshots.map((s) => s.gpuUtilPercent);
  const hasGpu = snapshots.some((s) => s.gpuUtilPercent > 0);

  return (
    <div className="relative bg-[#080c10] border border-white/[0.05] rounded-xl overflow-hidden">
      {/* Grid lines */}
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ height: CHART_H }}
        preserveAspectRatio="none"
      >
        {/* 25 / 50 / 75% gridlines */}
        {[25, 50, 75].map((pct) => {
          const y = CHART_H - (pct / 100) * CHART_H;
          return (
            <line
              key={pct}
              x1={0}
              y1={y}
              x2={CHART_W}
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="4 4"
            />
          );
        })}
        {buildPath(cpuValues, "#22d3ee")}
        {hasGpu && buildPath(gpuValues, "#a78bfa")}
      </svg>

      {/* Y-axis labels */}
      <div className="absolute inset-y-0 left-1.5 flex flex-col justify-between py-0.5 pointer-events-none">
        {["100", "75", "50", "25", "0"].map((l) => (
          <span key={l} className="text-[8px] text-white/20 leading-none">
            {l}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute top-1 right-2 flex items-center gap-2.5 pointer-events-none">
        <span className="flex items-center gap-1 text-[10px] text-cyan-400/70">
          <span className="w-3 h-px bg-cyan-400 inline-block" /> CPU
        </span>
        {hasGpu && (
          <span className="flex items-center gap-1 text-[10px] text-violet-400/70">
            <span className="w-3 h-px bg-violet-400 inline-block" /> GPU
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stat badge ────────────────────────────────────────────────────────────────

function StatBadge({
  label,
  value,
  unit = "%",
  color = "text-foreground",
}: {
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-white/[0.02] border border-white/[0.05] rounded-lg min-w-[64px]">
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
        {label}
      </span>
      <span className={cn("text-[15px] font-bold tabular-nums leading-none", color)}>
        {typeof value === "number" ? value.toFixed(1) : value}
        <span className="text-[10px] font-normal ml-0.5 text-muted-foreground/50">{unit}</span>
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FrametimePanel() {
  const [running, setRunning] = useState(false);
  const [snapshots, setSnapshots] = useState<PerfSnapshot[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const unlistenRef = useRef<{ snap?: UnlistenFn; stat?: UnlistenFn }>({});

  // Subscribe to Tauri events
  const subscribe = useCallback(async () => {
    const snapUn = await listen<PerfSnapshot>("perf_snapshot", (e) => {
      setSnapshots((prev) => {
        const next = [...prev, e.payload];
        return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
      });
    });
    const statUn = await listen<PerformanceStats>("perf_stats", (e) => {
      setStats(e.payload);
    });
    unlistenRef.current = { snap: snapUn, stat: statUn };
  }, []);

  const unsubscribe = useCallback(() => {
    unlistenRef.current.snap?.();
    unlistenRef.current.stat?.();
    unlistenRef.current = {};
  }, []);

  // Seed initial snapshots on start
  const seedSnapshots = useCallback(async () => {
    try {
      const initial = await invoke<PerfSnapshot[]>("get_perf_snapshots");
      if (initial.length > 0) setSnapshots(initial);
    } catch {
      // non-fatal
    }
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await subscribe();
      await invoke("start_frametime_monitor");
      await seedSnapshots();
      setRunning(true);
    } catch (e) {
      setError(String(e));
      unsubscribe();
    } finally {
      setStarting(false);
    }
  }, [subscribe, unsubscribe, seedSnapshots]);

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_frametime_monitor");
    } catch {
      // ignore
    }
    unsubscribe();
    setRunning(false);
  }, [unsubscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (running) {
        invoke("stop_frametime_monitor").catch(() => {});
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const latest = snapshots[snapshots.length - 1];

  const cpuColor =
    (latest?.cpuPercent ?? 0) >= 90
      ? "text-rose-400"
      : (latest?.cpuPercent ?? 0) >= 70
      ? "text-amber-400"
      : "text-cyan-400";

  const gpuColor =
    (latest?.gpuUtilPercent ?? 0) >= 90
      ? "text-rose-400"
      : (latest?.gpuUtilPercent ?? 0) >= 70
      ? "text-amber-400"
      : "text-violet-400";

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Activity size={13} className="text-cyan-400" />
        <span className="text-[12px] font-semibold text-muted-foreground/80">
          リアルタイム CPU / GPU モニター
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {running && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              監視中
            </span>
          )}
          <button
            type="button"
            onClick={running ? handleStop : handleStart}
            disabled={starting}
            aria-label={running ? "モニター停止" : "モニター開始"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all",
              running
                ? "bg-rose-500/10 border-rose-500/25 text-rose-400 hover:bg-rose-500/20"
                : "bg-cyan-500/10 border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/20",
              starting && "opacity-50 cursor-wait"
            )}
          >
            {starting ? (
              <RefreshCw size={10} className="animate-spin" />
            ) : running ? (
              <Square size={10} />
            ) : (
              <Play size={10} />
            )}
            {running ? "停止" : "開始"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-rose-400/80 bg-rose-500/5 border border-rose-500/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Chart */}
      {snapshots.length > 0 ? (
        <PerfChart snapshots={snapshots} />
      ) : (
        <div className="flex items-center justify-center h-20 bg-[#080c10] border border-white/[0.05] rounded-xl">
          <p className="text-[11px] text-muted-foreground/30">
            {running ? "データ収集中..." : "「開始」を押してモニタリングを開始"}
          </p>
        </div>
      )}

      {/* Live values */}
      {latest && (
        <div className="flex flex-wrap gap-2">
          <StatBadge label="CPU" value={latest.cpuPercent} color={cpuColor} />
          {stats && (
            <StatBadge label="1% Low CPU" value={stats.p1LowCpu} color="text-cyan-300/70" />
          )}
          {stats?.gpuAvailable && (
            <>
              <StatBadge label="GPU" value={latest.gpuUtilPercent} color={gpuColor} />
              <StatBadge label="1% Low GPU" value={stats.p1LowGpu} color="text-violet-300/70" />
            </>
          )}
          {latest.gpuTempC > 0 && (
            <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-white/[0.02] border border-white/[0.05] rounded-lg min-w-[64px]">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide flex items-center gap-0.5">
                <Thermometer size={8} /> GPU温度
              </span>
              <span
                className={cn(
                  "text-[15px] font-bold tabular-nums leading-none",
                  latest.gpuTempC >= 85
                    ? "text-rose-400"
                    : latest.gpuTempC >= 75
                    ? "text-amber-400"
                    : "text-emerald-400"
                )}
              >
                {latest.gpuTempC}
                <span className="text-[10px] font-normal ml-0.5 text-muted-foreground/50">°C</span>
              </span>
            </div>
          )}
          {latest.gpuVramTotalMb > 0 && (
            <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-white/[0.02] border border-white/[0.05] rounded-lg min-w-[64px]">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide flex items-center gap-0.5">
                <MemoryStick size={8} /> VRAM
              </span>
              <span className="text-[15px] font-bold tabular-nums leading-none text-violet-300">
                {(latest.gpuVramUsedMb / 1024).toFixed(1)}
                <span className="text-[10px] font-normal ml-0.5 text-muted-foreground/50">
                  / {(latest.gpuVramTotalMb / 1024).toFixed(1)} GB
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stats summary */}
      {stats && stats.sampleCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
          <Cpu size={9} className="text-muted-foreground/30 shrink-0" />
          <p className="text-[10px] text-muted-foreground/55 leading-relaxed">
            {stats.sampleCount} サンプル &nbsp;·&nbsp; CPU 平均{" "}
            <span className="text-cyan-400/70">{stats.avgCpu.toFixed(1)}%</span>
            {stats.gpuAvailable && (
              <>
                &nbsp;·&nbsp; GPU 平均{" "}
                <span className="text-violet-400/70">{stats.avgGpu.toFixed(1)}%</span>
                {stats.peakVramMb > 0 && (
                  <>
                    &nbsp;·&nbsp; VRAM ピーク{" "}
                    <span className="text-violet-400/70">
                      {(stats.peakVramMb / 1024).toFixed(1)} GB
                    </span>
                  </>
                )}
              </>
            )}
          </p>
          <Monitor size={9} className="text-muted-foreground/30 shrink-0 ml-auto" />
        </div>
      )}

      {/* Info */}
      <p className="text-[10px] text-muted-foreground/25 leading-relaxed px-0.5">
        CPU は sysinfo で取得。GPU は nvidia-smi（NVIDIA のみ）。1秒ごとにサンプリングし、直近60秒を表示。
      </p>
    </div>
  );
}
