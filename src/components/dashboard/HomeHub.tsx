/**
 * HomeHub — 司令塔ホーム画面
 *
 * 責務: システム状態の一覧表示 + 次の推奨アクションへの導線
 *
 * 優先度レイアウト:
 *   Critical（スコア<50）> Recommended（スコア<75）> Detail（メトリクス）> Footer（復元導線）
 *
 * [Phase D] ENABLE_HOME_HUB = true のときのみ使用。
 * false の間は App.tsx で DashboardV2 にフォールバック。
 *
 * 使い方:
 *   import { HomeHub } from "@/components/dashboard/HomeHub";
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2, Zap, Cpu, Wifi, HardDrive,
  Activity, Gauge, MemoryStick, MonitorCheck, AlertTriangle, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMemory } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useAppStore } from "@/stores/useAppStore";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";
import type {
  OptimizationScore, SystemInfo, GpuStatus,
  FpsEstimate, BandwidthSnapshot, DiskHealthReport, EventEntry,
} from "@/types";

// ── Helper: compact widget card ───────────────────────────────────────────────

function Widget({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white/[0.03] border border-white/[0.06] rounded-xl p-4", className)}>
      <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  );
}

// ── Health ring ───────────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const colorClass =
    score >= 75 ? "text-cyan-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-white/[0.05]" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={cn(colorClass, "opacity-20 blur-[3px]")} />
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={cn(colorClass, "[transition:stroke-dasharray_0.8s_ease]")} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-2xl font-bold leading-none tabular-nums", colorClass)}>{score}</span>
        <span className="text-[8px] text-muted-foreground/50 mt-1 tracking-widest uppercase">score</span>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-white/[0.05] rounded animate-pulse", className)} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function HomeHub() {
  const { setActivePage } = useAppStore();

  const [score, setScore] = useState<OptimizationScore | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [gpuList, setGpuList] = useState<GpuStatus[]>([]);
  const [fps, setFps] = useState<FpsEstimate | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthSnapshot | null>(null);
  const [diskHealth, setDiskHealth] = useState<DiskHealthReport | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled([
      invoke<OptimizationScore>("get_optimization_score"),
      invoke<SystemInfo>("get_system_info"),
      invoke<GpuStatus[]>("get_gpu_status"),
      invoke<FpsEstimate>("get_fps_estimate"),
      invoke<BandwidthSnapshot>("get_bandwidth_snapshot"),
      invoke<DiskHealthReport>("get_disk_health"),
      invoke<EventEntry[]>("get_event_log"),
      invoke<string | null>("get_active_profile"),
    ]);
    if (results[0].status === "fulfilled") setScore(results[0].value);
    if (results[1].status === "fulfilled") setSysInfo(results[1].value);
    if (results[2].status === "fulfilled") setGpuList(results[2].value);
    if (results[3].status === "fulfilled") setFps(results[3].value);
    if (results[4].status === "fulfilled") setBandwidth(results[4].value);
    if (results[5].status === "fulfilled") setDiskHealth(results[5].value);
    if (results[6].status === "fulfilled") setEvents(results[6].value);
    if (results[7].status === "fulfilled") setActiveProfile(results[7].value);
    setFirstLoad(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleQuickOptimize = async () => {
    if (optimizing) return;
    setOptimizing(true);
    try {
      await invoke("apply_all_optimizations");
      toast.success("全最適化を実行しました");
      fetchAll();
    } catch (e) {
      toast.error("最適化に失敗しました: " + String(e));
    } finally {
      setOptimizing(false);
    }
  };

  const healthScore = score?.overall ?? 0;
  const isCritical = !firstLoad && healthScore < 50;
  const needsAttention = !firstLoad && healthScore >= 50 && healthScore < 75;
  const gpu = gpuList[0] ?? null;
  const recentEvents = events.slice(0, 3);

  return (
    <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl">
            <Home className="text-cyan-400" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">ホーム</h1>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">システム司令塔 · 3秒更新</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeProfile && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/25 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              <span className="text-[10px] font-semibold text-cyan-400">{activeProfile}</span>
            </div>
          )}
          <RollbackEntryPoint compact className="opacity-60 hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* ── Critical zone (score < 50) ───────────────────────────────── */}
      {isCritical && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-300">システムパフォーマンスが低下しています</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">スコア {healthScore} — 即時最適化を推奨します</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActivePage("optimize")}
            className="shrink-0 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-xs font-semibold rounded-lg transition-colors"
          >
            最適化へ →
          </button>
        </div>
      )}

      {/* ── Recommended action (score 50–74) ────────────────────────── */}
      {needsAttention && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Zap size={15} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">最適化で改善できます</p>
              <p className="text-xs text-muted-foreground/50 mt-0.5">スコア {healthScore} / 100 — ゲームモードを試してみてください</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActivePage("optimize")}
            className="shrink-0 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 text-xs font-semibold rounded-lg transition-colors"
          >
            最適化へ →
          </button>
        </div>
      )}

      {/* ── Row 1: Health ring | CPU/RAM | GPU ──────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Widget label="システムヘルス">
          {firstLoad ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex items-center gap-3">
              <HealthRing score={healthScore} />
              {score && (
                <div className="flex flex-col gap-1 text-[10px] text-muted-foreground/60">
                  <span>プロセス: <span className="text-foreground tabular-nums">{score.process}</span></span>
                  <span>電源: <span className="text-foreground tabular-nums">{score.power}</span></span>
                  <span>ネット: <span className="text-foreground tabular-nums">{score.network}</span></span>
                </div>
              )}
            </div>
          )}
        </Widget>

        <Widget label="CPU / RAM">
          {firstLoad || !sysInfo ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Cpu size={13} className="text-muted-foreground/50 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground/60">CPU</span>
                    <span className="text-[10px] tabular-nums font-semibold text-slate-200">{sysInfo.cpu_usage.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${sysInfo.cpu_usage}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MemoryStick size={13} className="text-muted-foreground/50 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground/60">RAM</span>
                    <span className="text-[10px] tabular-nums font-semibold text-slate-200">{sysInfo.memory_percent.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500",
                      sysInfo.memory_percent >= 85 ? "bg-red-500" : sysInfo.memory_percent >= 65 ? "bg-amber-500" : "bg-emerald-500"
                    )} style={{ width: `${sysInfo.memory_percent}%` }} />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/40 truncate">
                {formatMemory(sysInfo.memory_used_mb)} / {formatMemory(sysInfo.memory_total_mb)}
              </p>
            </div>
          )}
        </Widget>

        <Widget label="GPU">
          {firstLoad ? (
            <Skeleton className="h-20 w-full" />
          ) : gpu ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <MonitorCheck size={13} className="text-muted-foreground/50 shrink-0" />
                <span className="text-[10px] text-slate-300 truncate">{gpu.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground/50 mb-0.5">温度</p>
                  <p className={cn("text-base font-bold tabular-nums",
                    gpu.temperature_c >= 85 ? "text-red-400" : gpu.temperature_c >= 70 ? "text-amber-400" : "text-cyan-400"
                  )}>{gpu.temperature_c}°C</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/50 mb-0.5">VRAM</p>
                  <p className="text-base font-bold text-slate-200 tabular-nums">
                    {gpu.vram_total_mb > 0
                      ? `${((gpu.vram_used_mb / gpu.vram_total_mb) * 100).toFixed(0)}%`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">GPU情報なし</p>
          )}
        </Widget>
      </div>

      {/* ── Row 2: Network | Disk | FPS | Quick actions ─────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <Widget label="ネットワーク">
          {firstLoad ? (
            <Skeleton className="h-16 w-full" />
          ) : bandwidth ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Wifi size={10} className="text-cyan-400 shrink-0" />
                <span className="text-[10px] text-muted-foreground/50 truncate">{bandwidth.active_interface}</span>
              </div>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">
                ↓ {bandwidth.download_kbps >= 1024
                  ? `${(bandwidth.download_kbps / 1024).toFixed(1)} Mbps`
                  : `${bandwidth.download_kbps.toFixed(0)} Kbps`}
              </p>
              <p className="text-xs font-bold text-cyan-400 tabular-nums">
                ↑ {bandwidth.upload_kbps >= 1024
                  ? `${(bandwidth.upload_kbps / 1024).toFixed(1)} Mbps`
                  : `${bandwidth.upload_kbps.toFixed(0)} Kbps`}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">データなし</p>
          )}
        </Widget>

        <Widget label="ディスク">
          {firstLoad ? (
            <Skeleton className="h-16 w-full" />
          ) : diskHealth ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <HardDrive size={10} className="text-muted-foreground/50 shrink-0" />
                <span className={cn("text-sm font-bold",
                  diskHealth.overall_health === "良好" || diskHealth.overall_health === "Good"
                    ? "text-emerald-400"
                    : diskHealth.overall_health === "警告" || diskHealth.overall_health === "Warning"
                    ? "text-amber-400"
                    : "text-red-400"
                )}>
                  {diskHealth.overall_health}
                </span>
              </div>
              {diskHealth.disks.slice(0, 1).map((d) => (
                <p key={d.caption} className="text-[10px] text-muted-foreground/50 truncate">
                  {d.caption}: {d.health_score}点
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">データなし</p>
          )}
        </Widget>

        <Widget label="FPS推定">
          {firstLoad ? (
            <Skeleton className="h-16 w-full" />
          ) : fps ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Gauge size={10} className="text-muted-foreground/50 shrink-0" />
                <span className="text-[10px] text-muted-foreground/50 truncate">
                  {fps.is_detecting ? fps.game_process || "検出中" : "非ゲーム"}
                </span>
              </div>
              <p className={cn("text-2xl font-bold tabular-nums leading-none",
                fps.estimated_fps >= 60 ? "text-emerald-400" : fps.estimated_fps >= 30 ? "text-amber-400" : "text-red-400"
              )}>
                {fps.estimated_fps}
                <span className="text-xs font-normal text-muted-foreground/50 ml-1">fps</span>
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">データなし</p>
          )}
        </Widget>

        <Widget label="クイックアクション">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setActivePage("optimize")}
              className="w-full py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97] transition-all"
            >
              <Zap size={11} />
              最適化へ
            </button>
            <button
              type="button"
              onClick={handleQuickOptimize}
              disabled={optimizing}
              className={cn(
                "w-full py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all border",
                optimizing
                  ? "border-white/[0.06] text-muted-foreground/40 cursor-not-allowed"
                  : "border-white/[0.08] text-muted-foreground/70 hover:text-slate-200 hover:bg-white/[0.04]"
              )}
            >
              {optimizing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              即時最適化
            </button>
          </div>
        </Widget>
      </div>

      {/* ── Row 3: Recent events ─────────────────────────────────────── */}
      <Widget label="最近のイベント">
        {firstLoad ? (
          <Skeleton className="h-10 w-full" />
        ) : recentEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40">イベントなし</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recentEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-2">
                <Activity size={10} className="text-muted-foreground/40 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-300 truncate">{e.title}</p>
                  <p className="text-[9px] text-muted-foreground/40 truncate">{e.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Widget>

      {/* ── Footer: rollback entry point ─────────────────────────────── */}
      <div className="flex items-center justify-end pt-1 border-t border-white/[0.04]">
        <RollbackEntryPoint />
      </div>

    </div>
  );
}
