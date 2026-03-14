import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Signal, Play, Square, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { BandwidthSnapshot } from "@/types";

const MAX_HISTORY = 60;
const POLL_MS = 1000;

// Chart dimensions
const W = 600;
const H = 120;
const PAD_LEFT = 42;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

function formatKbps(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(2)} MB/s`;
  return `${kbps.toFixed(1)} KB/s`;
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function indexToX(i: number, total: number): number {
  if (total <= 1) return PAD_LEFT + CHART_W;
  return PAD_LEFT + (i / (total - 1)) * CHART_W;
}

function valueToY(value: number, maxVal: number): number {
  const safeMax = maxVal <= 0 ? 1 : maxVal;
  const ratio = 1 - value / safeMax;
  return PAD_TOP + ratio * CHART_H;
}

function buildPolyline(
  history: BandwidthSnapshot[],
  getValue: (s: BandwidthSnapshot) => number,
  maxVal: number,
): string {
  return history
    .map((s, i) =>
      `${indexToX(i, history.length).toFixed(1)},${valueToY(getValue(s), maxVal).toFixed(1)}`
    )
    .join(" ");
}

function buildAreaPath(
  history: BandwidthSnapshot[],
  getValue: (s: BandwidthSnapshot) => number,
  maxVal: number,
): string {
  if (history.length < 2) return "";
  const pts = history.map(
    (s, i) =>
      `${indexToX(i, history.length).toFixed(1)},${valueToY(getValue(s), maxVal).toFixed(1)}`
  );
  const lastX = indexToX(history.length - 1, history.length).toFixed(1);
  const baseY = (PAD_TOP + CHART_H).toFixed(1);
  return `M ${pts.join(" L ")} L ${lastX},${baseY} L ${PAD_LEFT},${baseY} Z`;
}

export function BandwidthMonitor() {
  const [history, setHistory] = useState<BandwidthSnapshot[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [peakDl, setPeakDl] = useState(0);
  const [peakUl, setPeakUl] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const snap = await invoke<BandwidthSnapshot>("get_bandwidth_snapshot");
      setHistory((prev) => {
        const next = [...prev, snap];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
      setPeakDl((prev) => Math.max(prev, snap.download_kbps));
      setPeakUl((prev) => Math.max(prev, snap.upload_kbps));
    } catch {
      // silent during polling
    }
  }, []);

  const startMonitor = useCallback(async () => {
    setLoading(true);
    try {
      await poll();
      setRunning(true);
      intervalRef.current = setInterval(poll, POLL_MS);
    } catch (e) {
      toast.error(`帯域幅の取得に失敗しました: ${e}`);
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
    setPeakDl(0);
    setPeakUl(0);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const latest = history[history.length - 1];
  const dlKbps = latest?.download_kbps ?? 0;
  const ulKbps = latest?.upload_kbps ?? 0;
  const totalRxMb = latest?.total_received_mb ?? 0;
  const totalTxMb = latest?.total_sent_mb ?? 0;
  const iface = latest?.active_interface ?? "—";

  const maxVal = Math.max(
    ...history.map((s) => Math.max(s.download_kbps, s.upload_kbps)),
    1,
  );

  const dlPolyline = history.length >= 2 ? buildPolyline(history, (s) => s.download_kbps, maxVal) : "";
  const ulPolyline = history.length >= 2 ? buildPolyline(history, (s) => s.upload_kbps, maxVal) : "";
  const dlArea = history.length >= 2 ? buildAreaPath(history, (s) => s.download_kbps, maxVal) : "";

  // Y-axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1.0].map((frac) => ({
    value: maxVal * frac,
    y: valueToY(maxVal * frac, maxVal),
  }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Signal size={18} className="text-cyan-400" />
            ネットワーク帯域モニター
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            リアルタイム帯域幅を監視（最大 {MAX_HISTORY} 秒間）
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
        {/* Current metrics */}
        <div className="grid grid-cols-2 gap-4">
          {/* Download */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-[11px] text-muted-foreground/60 mb-1 uppercase tracking-wider">↓ ダウンロード</p>
            <p className={cn("text-2xl font-bold tabular-nums", dlKbps > 0 ? "text-cyan-400" : "text-muted-foreground/55")}>
              {dlKbps > 0 ? formatKbps(dlKbps) : "—"}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">ピーク: {peakDl > 0 ? formatKbps(peakDl) : "—"}</p>
          </div>

          {/* Upload */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-[11px] text-muted-foreground/60 mb-1 uppercase tracking-wider">↑ アップロード</p>
            <p className={cn("text-2xl font-bold tabular-nums", ulKbps > 0 ? "text-emerald-400" : "text-muted-foreground/55")}>
              {ulKbps > 0 ? formatKbps(ulKbps) : "—"}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">ピーク: {peakUl > 0 ? formatKbps(peakUl) : "—"}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            帯域幅履歴グラフ
          </p>
          {history.length < 2 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground/55 text-sm">
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
                  <linearGradient id="bw-dl-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid lines */}
                {yLabels.filter((_, i) => i > 0).map(({ value, y }) => (
                  <g key={value}>
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
                      fontSize="8"
                      fill="rgba(255,255,255,0.25)"
                      textAnchor="end"
                    >
                      {value >= 1024 ? `${(value / 1024).toFixed(1)}M` : `${value.toFixed(0)}K`}
                    </text>
                  </g>
                ))}

                {/* Download area */}
                {dlArea && <path d={dlArea} fill="url(#bw-dl-area)" />}

                {/* Upload line (emerald) */}
                {ulPolyline && (
                  <polyline
                    points={ulPolyline}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                  />
                )}

                {/* Download line (cyan) */}
                {dlPolyline && (
                  <polyline
                    points={dlPolyline}
                    fill="none"
                    stroke="#22d3ee"
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
                  <span className="w-4 h-0.5 rounded-full bg-cyan-400 block" />
                  <span className="text-[11px] text-muted-foreground">↓ ダウンロード</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 rounded-full bg-emerald-400 block opacity-80" />
                  <span className="text-[11px] text-muted-foreground">↑ アップロード</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session totals + interface */}
        {latest && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground/60 mb-1 uppercase tracking-wider">総受信</p>
              <p className="text-base font-bold text-cyan-400 tabular-nums">{formatMb(totalRxMb)}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground/60 mb-1 uppercase tracking-wider">総送信</p>
              <p className="text-base font-bold text-emerald-400 tabular-nums">{formatMb(totalTxMb)}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground/60 mb-1 uppercase tracking-wider">インターフェース</p>
              <p className="text-sm font-medium text-white/80 truncate" title={iface}>{iface}</p>
            </div>
          </div>
        )}

        {/* Info note */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3">
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            sysinfo を使用してネットワークインターフェースの帯域幅を測定します。
            全インターフェースの合計値を表示します。
          </p>
        </div>
      </div>
    </div>
  );
}
