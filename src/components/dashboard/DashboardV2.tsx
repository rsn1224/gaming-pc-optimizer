import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2, Zap, Cpu, Wifi, HardDrive,
  Activity, Gauge, MemoryStick, MonitorCheck, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMemory } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useAppStore } from "@/stores/useAppStore";
import type {
  OptimizationScore, ScoreSnapshot, SystemInfo, GpuStatus,
  FpsEstimate, BandwidthSnapshot, DiskHealthReport, EventEntry,
  MemoryCleanResult,
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

// ── Health ring (reused from Dashboard) ──────────────────────────────────────

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

// ── Mini meter bar ────────────────────────────────────────────────────────────

function MiniBar({ label, value, color = "bg-cyan-500" }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground/60 w-14 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground/60 w-8 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ history }: { history: ScoreSnapshot[] }) {
  if (history.length < 2) {
    return <div className="h-10 flex items-center justify-center text-[10px] text-muted-foreground/40">データなし</div>;
  }

  const W = 180;
  const H = 36;
  const PAD = 3;

  const xs = history.map((_, i) => PAD + (i / (history.length - 1)) * (W - PAD * 2));
  const ys = history.map((s) => PAD + (1 - s.overall / 100) * (H - PAD * 2));
  const polyline = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaPath = `M ${xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" L ")} L ${xs[xs.length - 1].toFixed(1)},${(H - PAD).toFixed(1)} L ${PAD},${(H - PAD).toFixed(1)} Z`;
  const last = history[history.length - 1];
  const color = last.overall >= 75 ? "#34d399" : last.overall >= 50 ? "#fbbf24" : "#f87171";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-9">
      <defs>
        <linearGradient id="sg2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sg2)" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1].toFixed(1)} cy={ys[ys.length - 1].toFixed(1)} r="2" fill={color} />
    </svg>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-white/[0.05] rounded animate-pulse", className)} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardV2() {
  const { setActivePage } = useAppStore();

  const [score, setScore] = useState<OptimizationScore | null>(null);
  const [history, setHistory] = useState<ScoreSnapshot[]>([]);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [gpuList, setGpuList] = useState<GpuStatus[]>([]);
  const [fps, setFps] = useState<FpsEstimate | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthSnapshot | null>(null);
  const [diskHealth, setDiskHealth] = useState<DiskHealthReport | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);

  const [cleaning, setCleaning] = useState(false);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled([
      invoke<OptimizationScore>("get_optimization_score"),
      invoke<ScoreSnapshot[]>("get_score_history"),
      invoke<SystemInfo>("get_system_info"),
      invoke<GpuStatus[]>("get_gpu_status"),
      invoke<FpsEstimate>("get_fps_estimate"),
      invoke<BandwidthSnapshot>("get_bandwidth_snapshot"),
      invoke<DiskHealthReport>("get_disk_health"),
      invoke<EventEntry[]>("get_event_log"),
      invoke<string | null>("get_active_profile"),
    ]);

    if (results[0].status === "fulfilled") setScore(results[0].value);
    if (results[1].status === "fulfilled") setHistory(results[1].value);
    if (results[2].status === "fulfilled") setSysInfo(results[2].value);
    if (results[3].status === "fulfilled") setGpuList(results[3].value);
    if (results[4].status === "fulfilled") setFps(results[4].value);
    if (results[5].status === "fulfilled") setBandwidth(results[5].value);
    if (results[6].status === "fulfilled") setDiskHealth(results[6].value);
    if (results[7].status === "fulfilled") setEvents(results[7].value);
    if (results[8].status === "fulfilled") setActiveProfile(results[8].value);

    setFirstLoad(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleCleanMemory = async () => {
    if (cleaning) return;
    setCleaning(true);
    try {
      const r = await invoke<MemoryCleanResult>("clean_memory");
      toast.success(`${r.freed_mb.toFixed(1)} MB のメモリを解放しました`);
      fetchAll();
    } catch (e) {
      toast.error("メモリクリーンに失敗しました: " + String(e));
    } finally {
      setCleaning(false);
    }
  };

  const gpu = gpuList[0] ?? null;
  const recentEvents = events.slice(0, 3);

  const healthScore = score?.overall ?? 0;

  return (
    <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">ダッシュボード V2</h1>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">全メトリクス一覧 · 3秒更新</p>
        </div>
        {activeProfile && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/25 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
            <span className="text-[10px] font-semibold text-cyan-400">{activeProfile}</span>
          </div>
        )}
      </div>

      {/* Row 1: Health Score | CPU/RAM | GPU */}
      <div className="grid grid-cols-3 gap-3">
        {/* Health Score */}
        <Widget label="システムヘルス">
          {firstLoad ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex items-center gap-3">
              <HealthRing score={healthScore} />
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground/50">ゲーミング最適化スコア</p>
                {score && (
                  <div className="flex flex-col gap-1">
                    <MiniBar label="プロセス" value={score.process} color="bg-emerald-500" />
                    <MiniBar label="電源" value={score.power} color="bg-cyan-500" />
                  </div>
                )}
              </div>
            </div>
          )}
        </Widget>

        {/* CPU / RAM */}
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

        {/* GPU */}
        <Widget label="GPU / VRAM">
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
              {gpu.vram_total_mb > 0 && (
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${(gpu.vram_used_mb / gpu.vram_total_mb) * 100}%` }} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">GPU情報なし</p>
          )}
        </Widget>
      </div>

      {/* Row 2: Score breakdown | Network | Disk | FPS */}
      <div className="grid grid-cols-4 gap-3">
        {/* Score breakdown */}
        <Widget label="スコア内訳">
          {firstLoad || !score ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-col gap-1.5">
              <MiniBar label="プロセス" value={score.process} color="bg-emerald-500" />
              <MiniBar label="電源" value={score.power} color="bg-cyan-500" />
              <MiniBar label="Windows" value={score.windows} color="bg-blue-500" />
              <MiniBar label="ネットワーク" value={score.network} color="bg-violet-500" />
            </div>
          )}
        </Widget>

        {/* Network */}
        <Widget label="ネットワーク">
          {firstLoad ? (
            <Skeleton className="h-20 w-full" />
          ) : bandwidth ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Wifi size={11} className="text-cyan-400 shrink-0" />
                <span className="text-[10px] text-muted-foreground/50 truncate">{bandwidth.active_interface}</span>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/50 mb-0.5">↓ ダウン</p>
                <p className="text-base font-bold text-emerald-400 tabular-nums">
                  {bandwidth.download_kbps >= 1024
                    ? `${(bandwidth.download_kbps / 1024).toFixed(1)} Mbps`
                    : `${bandwidth.download_kbps.toFixed(0)} Kbps`}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/50 mb-0.5">↑ アップ</p>
                <p className="text-sm font-bold text-cyan-400 tabular-nums">
                  {bandwidth.upload_kbps >= 1024
                    ? `${(bandwidth.upload_kbps / 1024).toFixed(1)} Mbps`
                    : `${bandwidth.upload_kbps.toFixed(0)} Kbps`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">データなし</p>
          )}
        </Widget>

        {/* Disk health */}
        <Widget label="ディスク健全性">
          {firstLoad ? (
            <Skeleton className="h-20 w-full" />
          ) : diskHealth ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <HardDrive size={11} className="text-muted-foreground/50 shrink-0" />
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
              {diskHealth.disks.slice(0, 2).map((d) => (
                <div key={d.caption} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/50 truncate">{d.caption}</span>
                  <span className="text-[10px] tabular-nums text-slate-300">{d.health_score}点</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">データなし</p>
          )}
        </Widget>

        {/* FPS */}
        <Widget label="FPS推定">
          {firstLoad ? (
            <Skeleton className="h-20 w-full" />
          ) : fps ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Gauge size={11} className="text-muted-foreground/50 shrink-0" />
                <span className="text-[10px] text-muted-foreground/50 truncate">
                  {fps.is_detecting ? fps.game_process || "検出中..." : "非ゲーム"}
                </span>
              </div>
              <p className={cn("text-3xl font-bold tabular-nums leading-none",
                fps.estimated_fps >= 60 ? "text-emerald-400" : fps.estimated_fps >= 30 ? "text-amber-400" : "text-red-400"
              )}>
                {fps.estimated_fps}
                <span className="text-sm font-normal text-muted-foreground/50 ml-1">fps</span>
              </p>
              <p className="text-[10px] text-muted-foreground/50">CPU: {fps.cpu_percent.toFixed(1)}%</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">データなし</p>
          )}
        </Widget>
      </div>

      {/* Row 3: Sparkline | Recent events */}
      <div className="grid grid-cols-2 gap-3">
        <Widget label="スコア推移">
          {firstLoad ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            <Sparkline history={history.slice(-10)} />
          )}
        </Widget>

        <Widget label="最近のイベント">
          {firstLoad ? (
            <Skeleton className="h-14 w-full" />
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
      </div>

      {/* Row 4: Active profile | Session stats | Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {/* Active profile */}
        <Widget label="アクティブプロファイル">
          {activeProfile ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)] shrink-0" />
              <p className="text-sm font-bold text-cyan-300 truncate">{activeProfile}</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">なし</p>
          )}
        </Widget>

        {/* Session stats */}
        <Widget label="セッション情報">
          {sysInfo ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground/50 mb-0.5">OS</p>
                <p className="text-[11px] text-slate-300 truncate">{sysInfo.os_name}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/50 mb-0.5">CPU</p>
                <p className="text-[11px] text-slate-300 truncate">{sysInfo.cpu_cores}コア</p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-10 w-full" />
          )}
        </Widget>

        {/* Quick actions */}
        <Widget label="クイックアクション">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setActivePage("optimize")}
              className="w-full py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97] transition-all"
            >
              <Zap size={11} />
              最適化へ
              <ArrowRight size={11} />
            </button>
            <button
              type="button"
              onClick={handleCleanMemory}
              disabled={cleaning}
              className={cn(
                "w-full py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all border",
                cleaning
                  ? "border-white/[0.06] text-muted-foreground/40 cursor-not-allowed"
                  : "border-white/[0.08] text-muted-foreground/70 hover:text-slate-200 hover:bg-white/[0.04]"
              )}
            >
              {cleaning ? <Loader2 size={11} className="animate-spin" /> : <MemoryStick size={11} />}
              メモリクリーン
            </button>
            <button
              type="button"
              onClick={() => setActivePage("benchmark")}
              className="w-full py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 border border-white/[0.08] text-muted-foreground/70 hover:text-slate-200 hover:bg-white/[0.04] transition-all"
            >
              <Gauge size={11} />
              ベンチマーク
            </button>
          </div>
        </Widget>
      </div>
    </div>
  );
}
