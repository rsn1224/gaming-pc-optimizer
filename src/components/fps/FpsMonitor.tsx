import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FpsEstimate } from "@/types";

const MAX_HISTORY = 30;
const POLL_MS = 500;

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, max = 165 }: { data: number[]; max?: number }) {
  const W = 340;
  const H = 48;
  if (data.length < 2) {
    return (
      <svg width={W} height={H} className="w-full">
        <line x1={0} y1={H} x2={W} y2={H} stroke="rgba(255,255,255,0.06)" />
      </svg>
    );
  }

  const step = W / (MAX_HISTORY - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = H - (v / max) * (H - 4);
    return `${x},${y}`;
  });

  const area = `M${pts.join("L")} L${(data.length - 1) * step},${H} L0,${H} Z`;
  const line = `M${pts.join("L")}`;

  return (
    <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="fps-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,211,238,0.25)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#fps-grad)" />
      <path d={line} fill="none" stroke="rgba(34,211,238,0.7)" strokeWidth={1.5} />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fpsColor(fps: number) {
  if (fps >= 60) return "text-emerald-400";
  if (fps >= 30) return "text-amber-400";
  return "text-red-400";
}

function fpsLabel(fps: number) {
  if (fps >= 60) return { text: "スムーズ", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (fps >= 30) return { text: "やや重い", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  if (fps > 0)   return { text: "重い", cls: "bg-red-500/10 text-red-400 border-red-500/20" };
  return { text: "待機中", cls: "bg-white/5 text-muted-foreground border-white/[0.06]" };
}

// ── Main component ────────────────────────────────────────────────────────────

export function FpsMonitor() {
  const [estimate, setEstimate] = useState<FpsEstimate | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const data = await invoke<FpsEstimate>("get_fps_estimate");
      setEstimate(data);
      setHistory((prev) => {
        const next = [...prev, data.estimated_fps];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fps = estimate?.estimated_fps ?? 0;
  const frameTime = fps > 0 ? (1000 / fps).toFixed(1) : "—";
  const label = fpsLabel(fps);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">FPS モニター</h1>
        </div>
        <div className="flex items-center gap-2">
          {estimate?.is_detecting && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              監視中
            </span>
          )}
          <button
            type="button"
            onClick={() => { setLoading(true); poll(); }}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Disclaimer */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-2.5 text-xs text-amber-400/80">
          これはCPU使用率に基づく推定値です。実際のゲーム内FPSとは異なる場合があります。
        </div>

        {error && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs text-red-400">
            エラー: {error}
          </div>
        )}

        {/* Main FPS display */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">推定FPS</p>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-6xl font-bold tabular-nums leading-none", fpsColor(fps))}>
                  {loading && estimate === null ? "—" : fps}
                </span>
                <span className="text-lg text-muted-foreground">fps</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">フレームタイム</p>
              <span className="text-2xl font-semibold text-white tabular-nums">{frameTime}</span>
              <span className="text-sm text-muted-foreground ml-1">ms</span>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2 mb-5">
            <span className={cn("text-xs px-2 py-0.5 rounded-full border", label.cls)}>
              {label.text}
            </span>
            {estimate?.game_process && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                監視中: <span className="text-slate-300">{estimate.game_process}</span>
              </span>
            )}
          </div>

          {/* Sparkline */}
          <div className="rounded-xl overflow-hidden bg-black/20">
            <Sparkline data={history} />
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1 text-right">
            直近{MAX_HISTORY}サンプル（500ms間隔）
          </p>
        </div>

        {/* CPU info */}
        {estimate && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-xs text-muted-foreground mb-3">CPU負荷（最上位プロセス）</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300 truncate max-w-[200px]">
                {estimate.game_process || "—"}
              </span>
              <span className={cn("text-sm font-semibold tabular-nums", fpsColor(fps))}>
                {estimate.cpu_percent.toFixed(1)}%
              </span>
            </div>
            {/* CPU bar */}
            <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  fps >= 60 ? "bg-emerald-400" : fps >= 30 ? "bg-amber-400" : "bg-red-400"
                )}
                style={{ width: `${Math.min(estimate.cpu_percent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs text-muted-foreground mb-3">FPS推定の見方</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-muted-foreground">60 fps以上 — スムーズなゲームプレイ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-muted-foreground">30–59 fps — 設定の最適化を推奨</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <span className="text-muted-foreground">30 fps未満 — 重大なパフォーマンス低下</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
