import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Thermometer, Play, Square, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { TempSnapshot } from "@/types";

const MAX_HISTORY = 60; // 60 snapshots × 2s = 2 minutes
const POLL_MS = 2000;

// Chart dimensions
const W = 600;
const H = 120;
const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

const Y_MIN = 0;
const Y_MAX = 100;
const DANGER_TEMP = 85;
const GRID_LINES = [40, 60, 80];

function tempToY(temp: number): number {
  const ratio = 1 - (temp - Y_MIN) / (Y_MAX - Y_MIN);
  return PAD_TOP + ratio * CHART_H;
}

function indexToX(i: number, total: number): number {
  if (total <= 1) return PAD_LEFT + CHART_W;
  return PAD_LEFT + (i / (total - 1)) * CHART_W;
}

function buildPolyline(history: TempSnapshot[], getTemp: (s: TempSnapshot) => number): string {
  return history
    .map((s, i) => `${indexToX(i, history.length).toFixed(1)},${tempToY(getTemp(s)).toFixed(1)}`)
    .join(" ");
}

function buildAreaPath(history: TempSnapshot[], getTemp: (s: TempSnapshot) => number): string {
  if (history.length < 2) return "";
  const pts = history.map((s, i) => `${indexToX(i, history.length).toFixed(1)},${tempToY(getTemp(s)).toFixed(1)}`);
  const lastX = indexToX(history.length - 1, history.length).toFixed(1);
  const baseY = (PAD_TOP + CHART_H).toFixed(1);
  return `M ${pts.join(" L ")} L ${lastX},${baseY} L ${PAD_LEFT},${baseY} Z`;
}

function tempColor(temp: number): string {
  if (temp >= 80) return "#f87171"; // red-400
  if (temp >= 60) return "#fbbf24"; // amber-400
  return "#34d399"; // emerald-400
}

function TempValue({ label, temp, unit = "°C" }: { label: string; temp: number; unit?: string }) {
  const color =
    temp >= 80 ? "text-red-400" : temp >= 60 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("text-2xl font-bold tabular-nums", temp > 0 ? color : "text-muted-foreground/40")}>
        {temp > 0 ? temp.toFixed(1) : "—"}
        {temp > 0 && <span className="text-sm font-normal ml-0.5">{unit}</span>}
      </span>
      <span className="text-[11px] text-muted-foreground/60">{label}</span>
    </div>
  );
}

function calcStats(history: TempSnapshot[], getTemp: (s: TempSnapshot) => number) {
  const vals = history.map(getTemp).filter((v) => v > 0);
  if (vals.length === 0) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, avg };
}

export function TempMonitor() {
  const [history, setHistory] = useState<TempSnapshot[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const snap = await invoke<TempSnapshot>("get_temperature_snapshot");
      setHistory((prev) => {
        const next = [...prev, snap];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
    } catch {
      // silent failure — don't spam toasts during polling
    }
  }, []);

  const startMonitor = useCallback(async () => {
    setLoading(true);
    try {
      await poll();
      setRunning(true);
      intervalRef.current = setInterval(poll, POLL_MS);
    } catch (e) {
      toast.error(`温度取得に失敗しました: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [poll]);

  const stopMonitor = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const latest = history[history.length - 1];
  const gpuTemp = latest?.gpu_temp_c ?? 0;
  const cpuTemp = latest?.cpu_temp_c ?? 0;
  const hasCpu = history.some((s) => s.cpu_temp_c > 0);

  const gpuStats = calcStats(history, (s) => s.gpu_temp_c);
  const cpuStats = calcStats(history, (s) => s.cpu_temp_c);

  // Danger zone Y boundary
  const dangerY = tempToY(DANGER_TEMP);

  const gpuPolyline = history.length >= 2 ? buildPolyline(history, (s) => s.gpu_temp_c) : "";
  const cpuPolyline = hasCpu && history.length >= 2 ? buildPolyline(history, (s) => s.cpu_temp_c) : "";
  const gpuArea = history.length >= 2 ? buildAreaPath(history, (s) => s.gpu_temp_c) : "";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Thermometer size={18} className="text-cyan-400" />
            温度モニター
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            最大 {MAX_HISTORY} サンプル（約 {(MAX_HISTORY * POLL_MS / 1000 / 60).toFixed(0)} 分）を表示
          </p>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw size={13} />
              クリア
            </button>
          )}
          <button
            type="button"
            onClick={running ? stopMonitor : startMonitor}
            disabled={loading}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border",
              running
                ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20",
              loading && "opacity-50 cursor-not-allowed",
            )}
          >
            {running ? <Square size={13} /> : <Play size={13} />}
            {running ? "停止" : "開始"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Current values */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-around">
            <TempValue label="GPU 温度" temp={gpuTemp} />
            {hasCpu && <div className="w-px h-12 bg-white/[0.06]" />}
            {hasCpu && <TempValue label="CPU 温度" temp={cpuTemp} />}
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            温度履歴グラフ
          </p>
          {history.length < 2 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-sm">
              {running ? "データを収集中…" : "「開始」を押してモニタリングを開始してください"}
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="w-full h-40"
              >
                <defs>
                  {/* GPU area gradient */}
                  <linearGradient id="gpu-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                  </linearGradient>
                  {/* Danger zone gradient */}
                  <linearGradient id="danger-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* Danger zone fill (above 85°C) */}
                <rect
                  x={PAD_LEFT}
                  y={PAD_TOP}
                  width={CHART_W}
                  height={dangerY - PAD_TOP}
                  fill="url(#danger-grad)"
                />

                {/* Grid lines */}
                {GRID_LINES.map((temp) => {
                  const y = tempToY(temp);
                  return (
                    <g key={temp}>
                      <line
                        x1={PAD_LEFT}
                        y1={y}
                        x2={PAD_LEFT + CHART_W}
                        y2={y}
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={PAD_LEFT - 4}
                        y={y + 3.5}
                        fontSize="9"
                        fill="rgba(255,255,255,0.25)"
                        textAnchor="end"
                      >
                        {temp}
                      </text>
                    </g>
                  );
                })}

                {/* Danger label */}
                <text
                  x={PAD_LEFT + CHART_W - 2}
                  y={dangerY - 3}
                  fontSize="8"
                  fill="rgba(239,68,68,0.5)"
                  textAnchor="end"
                >
                  85°C
                </text>
                <line
                  x1={PAD_LEFT}
                  y1={dangerY}
                  x2={PAD_LEFT + CHART_W}
                  y2={dangerY}
                  stroke="rgba(239,68,68,0.25)"
                  strokeWidth="1"
                />

                {/* GPU area */}
                {gpuArea && <path d={gpuArea} fill="url(#gpu-area)" />}

                {/* CPU line (cyan) */}
                {cpuPolyline && (
                  <polyline
                    points={cpuPolyline}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                  />
                )}

                {/* GPU line (orange/red) */}
                {gpuPolyline && (
                  <polyline
                    points={gpuPolyline}
                    fill="none"
                    stroke={tempColor(gpuTemp)}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Chart border */}
                <rect
                  x={PAD_LEFT}
                  y={PAD_TOP}
                  width={CHART_W}
                  height={CHART_H}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
              </svg>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-4 h-0.5 rounded-full block",
                    gpuTemp >= 80 ? "bg-red-400" : gpuTemp >= 60 ? "bg-amber-400" : "bg-emerald-400",
                  )} />
                  <span className="text-[11px] text-muted-foreground">GPU</span>
                </div>
                {hasCpu && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 rounded-full bg-cyan-400 block opacity-80" />
                    <span className="text-[11px] text-muted-foreground">CPU</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {history.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {/* GPU stats */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground/60 mb-3 uppercase tracking-wider">GPU 統計</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "最小", value: gpuStats.min },
                  { label: "最大", value: gpuStats.max },
                  { label: "平均", value: gpuStats.avg },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center">
                    <span className={cn("text-base font-bold tabular-nums", tempColor(value) === "#f87171" ? "text-red-400" : value >= 60 ? "text-amber-400" : "text-emerald-400")}>
                      {value > 0 ? value.toFixed(1) : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CPU stats */}
            {hasCpu && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                <p className="text-[11px] text-muted-foreground/60 mb-3 uppercase tracking-wider">CPU 統計</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "最小", value: cpuStats.min },
                    { label: "最大", value: cpuStats.max },
                    { label: "平均", value: cpuStats.avg },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center">
                      <span className={cn("text-base font-bold tabular-nums", value >= 80 ? "text-red-400" : value >= 60 ? "text-amber-400" : "text-emerald-400")}>
                        {value > 0 ? value.toFixed(1) : "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info note */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3">
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            GPU 温度は nvidia-smi を使用して取得します。CPU 温度は WMI 経由で取得しますが、
            取得できない環境では非表示になります。赤いゾーンは 85°C 以上の危険域を示します。
          </p>
        </div>
      </div>
    </div>
  );
}
