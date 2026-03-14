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
import { listen } from "@tauri-apps/api/event";
import {
  Zap, Cpu, Wifi, HardDrive,
  Activity, Gauge, MemoryStick, MonitorCheck, AlertTriangle, Home,
  Bot, Circle, Flame, TrendingDown, Gamepad2, Stethoscope, Trophy,
} from "lucide-react";
import { cn, formatMemory } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";
import { HealthRing } from "@/components/ui/HealthRing";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { toast } from "@/stores/useToastStore";
import { PerformanceCoach } from "@/components/gamelog/PerformanceCoach";
import { RecommendationCard } from "@/components/recommendation/RecommendationCard";
import { TournamentModal } from "@/components/tournament/TournamentModal";
import { FrametimePanel } from "@/components/hardware/FrametimePanel";
import type {
  OptimizationScore, SystemInfo, GpuStatus,
  FpsEstimate, BandwidthSnapshot, DiskHealthReport, EventEntry, Policy, ScoreSnapshot,
  HardwareDiagnostics, HardwareSuggestion, GameLaunchedPayload, SessionEndedPayload,
} from "@/types";
import {
  ENABLE_POLICY_ENGINE,
  ENABLE_SCORE_REGRESSION_WATCH,
  ENABLE_THERMAL_AUTO_REDUCTION,
  ENABLE_LAUNCH_MONITORING,
  ENABLE_HARDWARE_SUGGESTIONS,
  ENABLE_PERFORMANCE_COACH,
  ENABLE_RECOMMENDATION_V2_UI,
  ENABLE_TOURNAMENT_MODE_UI,
  ENABLE_FRAMETIME_OVERLAY_UI,
} from "@/config/features";

// ── S6-01: Score sparkline ────────────────────────────────────────────────────

function ScoreSparkline({ snapshots }: { snapshots: ScoreSnapshot[] }) {
  if (snapshots.length < 2) return null;
  const last10 = snapshots.slice(-10);
  const scores = last10.map(s => s.overall);
  const min = Math.max(0,  Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const W = 80, H = 28;
  const toX = (i: number) => (i / (scores.length - 1)) * W;
  const toY = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const pts = scores.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const latest = scores[scores.length - 1];
  const prev    = scores[scores.length - 2];
  const trend   = latest - prev;
  const color   = trend >= 0 ? "#34d399" : "#f87171";

  return (
    <div className="flex items-center gap-2">
      <svg width={W} height={H} className="overflow-visible">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={toX(scores.length - 1)} cy={toY(latest)} r="2.5" fill={color} />
      </svg>
      <span className={`text-[10px] font-semibold tabular-nums ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {trend >= 0 ? "+" : ""}{trend}
      </span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Widget({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-[#05080c] border border-white/[0.10] rounded-xl p-4", className)}>
      <p className="text-[11px] text-muted-foreground/55 uppercase tracking-wider mb-2.5">
        {label}
      </p>
      {children}
    </div>
  );
}

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
  const [policies, setPolicies] = useState<Policy[]>([]);
  // S6-01
  const [scoreSnapshots, setScoreSnapshots] = useState<ScoreSnapshot[]>([]);
  const [regressionScore, setRegressionScore] = useState<number | null>(null);
  // S6-02
  const [thermalThrottled, setThermalThrottled] = useState(false);
  // S8-01: game launch monitoring
  const [gameLaunched, setGameLaunched] = useState<GameLaunchedPayload | null>(null);
  // S8-04: hardware diagnostics
  const [hwDiag, setHwDiag] = useState<HardwareDiagnostics | null>(null);
  // S10-03: session ended coaching
  const [sessionEnded, setSessionEnded] = useState<SessionEndedPayload | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  // Tournament checklist
  const [showTournament, setShowTournament] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);

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
      invoke<Policy[]>("list_policies"),
      invoke<ScoreSnapshot[]>("get_score_history"),
      ENABLE_HARDWARE_SUGGESTIONS
        ? invoke<HardwareDiagnostics>("get_hardware_diagnostics")
        : Promise.reject("disabled"),
    ]);
    if (results[0].status === "fulfilled") setScore(results[0].value);
    if (results[1].status === "fulfilled") setSysInfo(results[1].value);
    if (results[2].status === "fulfilled") setGpuList(results[2].value);
    if (results[3].status === "fulfilled") setFps(results[3].value);
    if (results[4].status === "fulfilled") setBandwidth(results[4].value);
    if (results[5].status === "fulfilled") setDiskHealth(results[5].value);
    if (results[6].status === "fulfilled") setEvents(results[6].value);
    if (results[7].status === "fulfilled") setActiveProfile(results[7].value);
    if (results[8].status === "fulfilled") setPolicies(results[8].value);
    if (results[9].status === "fulfilled") setScoreSnapshots(results[9].value);
    if (results[10].status === "fulfilled") setHwDiag(results[10].value as HardwareDiagnostics);
    setFirstLoad(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // S6-01: listen for score regression events from watcher
  useEffect(() => {
    if (!ENABLE_SCORE_REGRESSION_WATCH) return;
    let unlisten: (() => void) | undefined;
    listen<number>("score_regression", (event) => {
      setRegressionScore(event.payload);
      toast.info(`スコア急落: ${event.payload} pts — 最適化を推奨します`);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // S6-02: listen for thermal throttle events from watcher
  useEffect(() => {
    if (!ENABLE_THERMAL_AUTO_REDUCTION) return;
    let unlisten: (() => void) | undefined;
    listen<boolean>("thermal_throttle_changed", (event) => {
      setThermalThrottled(event.payload);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // S8-01: listen for game_launched events from watcher
  useEffect(() => {
    if (!ENABLE_LAUNCH_MONITORING) return;
    let unlisten: (() => void) | undefined;
    listen<GameLaunchedPayload>("game_launched", (event) => {
      setGameLaunched(event.payload);
      toast.info(`ゲーム起動検出: ${event.payload.game_name}`);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // S10-03: listen for session_ended events from watcher
  useEffect(() => {
    if (!ENABLE_PERFORMANCE_COACH) return;
    let unlisten: (() => void) | undefined;
    listen<SessionEndedPayload>("session_ended", (event) => {
      setSessionEnded(event.payload);
      setShowCoach(true);
      toast.info(`セッション終了: ${event.payload.game_name} — コーチングレポートを生成中`);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const healthScore = score?.overall ?? 0;
  const isCritical = !firstLoad && healthScore < 50;
  const needsAttention = !firstLoad && healthScore >= 50 && healthScore < 75;
  const gpu = gpuList[0] ?? null;
  const recentEvents = events.slice(0, 3);

  // S4-05: policy stats
  const enabledPolicies = policies.filter((p) => p.enabled);
  const lastFiredPolicy = policies
    .filter((p) => p.last_fired_at)
    .sort((a, b) => (b.last_fired_at! > a.last_fired_at! ? 1 : -1))[0] ?? null;
  const totalFireCount = policies.reduce((sum, p) => sum + p.fire_count, 0);

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
          {ENABLE_TOURNAMENT_MODE_UI && (
            <button
              type="button"
              onClick={() => setShowTournament(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg hover:bg-amber-500/20 transition-colors"
            >
              <Trophy size={11} /> 試合前チェック
            </button>
          )}
        </div>
      </div>

      {/* ── State banners (AlertBanner 統一) ────────────────────────── */}
      {isCritical && (
        <AlertBanner
          variant="error"
          icon={<AlertTriangle size={14} className="text-red-400" />}
          title="システムパフォーマンスが低下しています"
          detail={`スコア ${healthScore} — 即時最適化を推奨します`}
          action={{ label: "最適化へ", onClick: () => setActivePage("optimize") }}
        />
      )}
      {needsAttention && (
        <AlertBanner
          variant="warning"
          icon={<Zap size={14} className="text-amber-400" />}
          title="最適化で改善できます"
          detail={`スコア ${healthScore} / 100 — ゲームモードを試してみてください`}
          action={{ label: "最適化へ", onClick: () => setActivePage("optimize") }}
        />
      )}
      {ENABLE_SCORE_REGRESSION_WATCH && regressionScore !== null && (
        <AlertBanner
          variant="error"
          icon={<TrendingDown size={14} className="text-red-400" />}
          title="スコア急落を検出しました"
          detail={`現在のスコア: ${regressionScore} — 最適化で改善できます`}
          action={{ label: "最適化へ", onClick: () => setActivePage("optimize") }}
          onDismiss={() => setRegressionScore(null)}
        />
      )}
      {ENABLE_LAUNCH_MONITORING && gameLaunched && (
        <AlertBanner
          variant="success"
          icon={<Gamepad2 size={14} className="text-emerald-400" />}
          title="ゲーム起動を検出しました"
          detail={`${gameLaunched.game_name} — プロファイルを自動適用しました（起動前スコア: ${gameLaunched.score_before}）`}
          onDismiss={() => setGameLaunched(null)}
        />
      )}
      {ENABLE_PERFORMANCE_COACH && sessionEnded && !showCoach && (
        <AlertBanner
          variant="warning"
          icon={<Bot size={14} className="text-amber-400" />}
          title="セッション終了"
          detail={`${sessionEnded.game_name}${sessionEnded.duration_minutes != null ? ` · ${sessionEnded.duration_minutes}分` : ""} — AI コーチングレポートを確認できます`}
          action={{ label: "コーチングを見る", onClick: () => setShowCoach(true) }}
          onDismiss={() => setSessionEnded(null)}
        />
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
                  {/* S6-01: sparkline */}
                  {ENABLE_SCORE_REGRESSION_WATCH && scoreSnapshots.length >= 2 && (
                    <div className="mt-1">
                      <ScoreSparkline snapshots={scoreSnapshots} />
                    </div>
                  )}
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
              <p className="text-[10px] text-muted-foreground/55 truncate">
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
                  <div className="flex items-center gap-1">
                    <p className={cn("text-base font-bold tabular-nums",
                      gpu.temperature_c >= 85 ? "text-red-400" : gpu.temperature_c >= 70 ? "text-amber-400" : "text-cyan-400"
                    )}>{gpu.temperature_c}°C</p>
                    {/* S6-02: thermal throttle indicator */}
                    {ENABLE_THERMAL_AUTO_REDUCTION && thermalThrottled && (
                      <Flame size={11} className="text-amber-400 shrink-0 animate-pulse" aria-label="電力制限中" />
                    )}
                  </div>
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
              {ENABLE_THERMAL_AUTO_REDUCTION && thermalThrottled && (
                <p className="text-[10px] text-amber-400/70 mt-1">
                  🌡 温度超過により電力制限中
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/55">GPU情報なし</p>
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
            <p className="text-[11px] text-muted-foreground/55">データなし</p>
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
            <p className="text-[11px] text-muted-foreground/55">データなし</p>
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
            <p className="text-[11px] text-muted-foreground/55">データなし</p>
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
              最適化ページへ →
            </button>
          </div>
        </Widget>
      </div>

      {/* ── Row 3: Policy engine status widget (S4-05) ──────────────── */}
      {ENABLE_POLICY_ENGINE && (
        <Widget label="ポリシーエンジン">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                <Bot size={14} className="text-violet-400" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[11px] text-muted-foreground/60">
                  有効: <span className="text-foreground font-medium">{enabledPolicies.length}</span>
                  <span className="text-muted-foreground/55 mx-1">/</span>
                  <span className="text-muted-foreground/50">{policies.length} 件</span>
                  <span className="ml-2 text-muted-foreground/55">実行累計: {totalFireCount}回</span>
                </p>
                {lastFiredPolicy ? (
                  <p className="text-[10px] text-muted-foreground/55">
                    最終実行: <span className="text-muted-foreground/60">{lastFiredPolicy.name}</span>
                    {" · "}
                    {new Date(lastFiredPolicy.last_fired_at!).toLocaleString("ja-JP", {
                      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/30">まだ実行されていません</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {enabledPolicies.length === 0 ? (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/55">
                  <Circle size={8} />
                  有効なポリシーなし
                </div>
              ) : (
                enabledPolicies.slice(0, 2).map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 bg-violet-500/8 border border-violet-500/15 rounded-lg">
                    <span className="w-1 h-1 rounded-full bg-violet-400/60" />
                    <span className="text-[10px] text-violet-300/80 truncate max-w-[120px]">{p.name}</span>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={() => setActivePage("policies")}
                className="text-[10px] text-violet-400/70 hover:text-violet-400 transition-colors text-right"
              >
                管理 →
              </button>
            </div>
          </div>
        </Widget>
      )}

      {/* ── S8-04: Hardware diagnostics card ─────────────────────────── */}
      {ENABLE_HARDWARE_SUGGESTIONS && hwDiag && (
        <Widget label="ハードウェア診断">
          <div className="flex flex-col gap-3">
            {/* Metric bars */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <Cpu size={9} /> CPU
                  </span>
                  <span className="text-[10px] tabular-nums font-semibold text-slate-200">
                    {hwDiag.cpu_usage_percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all",
                    hwDiag.cpu_usage_percent > 90 ? "bg-red-500" : hwDiag.cpu_usage_percent > 80 ? "bg-amber-500" : "bg-cyan-500"
                  )} style={{ width: `${hwDiag.cpu_usage_percent}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <MemoryStick size={9} /> RAM
                  </span>
                  <span className="text-[10px] tabular-nums font-semibold text-slate-200">
                    {hwDiag.memory_used_percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all",
                    hwDiag.memory_used_percent > 90 ? "bg-red-500" : hwDiag.memory_used_percent > 80 ? "bg-amber-500" : "bg-emerald-500"
                  )} style={{ width: `${hwDiag.memory_used_percent}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <MonitorCheck size={9} /> GPU
                  </span>
                  <span className={cn("text-[10px] tabular-nums font-semibold",
                    hwDiag.gpu_temp_c != null && hwDiag.gpu_temp_c >= 90 ? "text-red-400"
                    : hwDiag.gpu_temp_c != null && hwDiag.gpu_temp_c >= 83 ? "text-amber-400"
                    : "text-slate-200"
                  )}>
                    {hwDiag.gpu_temp_c != null ? `${hwDiag.gpu_temp_c}°C` : "—"}
                  </span>
                </div>
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all",
                    hwDiag.gpu_temp_c != null && hwDiag.gpu_temp_c >= 90 ? "bg-red-500"
                    : hwDiag.gpu_temp_c != null && hwDiag.gpu_temp_c >= 83 ? "bg-amber-500"
                    : "bg-violet-500"
                  )} style={{ width: hwDiag.gpu_temp_c != null ? `${Math.min(100, (hwDiag.gpu_temp_c / 100) * 100)}%` : "0%" }} />
                </div>
              </div>
            </div>
            {/* Suggestions */}
            <div className="space-y-1.5">
              {hwDiag.suggestions.map((s: HardwareSuggestion) => (
                <div key={s.id} className={cn(
                  "flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs",
                  s.severity === "critical" && "bg-red-500/8 border-red-500/20",
                  s.severity === "warning"  && "bg-amber-500/8 border-amber-500/15",
                  s.severity === "info"     && "bg-white/[0.02] border-white/[0.06]",
                )}>
                  <Stethoscope size={11} className={cn(
                    "shrink-0 mt-0.5",
                    s.severity === "critical" ? "text-red-400" : s.severity === "warning" ? "text-amber-400" : "text-cyan-400/60"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium",
                      s.severity === "critical" ? "text-red-300" : s.severity === "warning" ? "text-amber-300" : "text-slate-300"
                    )}>{s.title}</p>
                    <p className="text-muted-foreground/50 text-[10px] mt-0.5 leading-relaxed">{s.detail}</p>
                  </div>
                  {s.action && (
                    <button
                      type="button"
                      onClick={() => setActivePage(
                        s.action === "プロセス管理" ? "process"
                        : s.action === "ブロートウェア終了" ? "process"
                        : s.action === "メモリクリーン" ? "process"
                        : s.action === "GPU 電力制限" ? "hardware"
                        : s.action === "電源プラン最適化" ? "optimize"
                        : "optimize"
                      )}
                      className="text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors shrink-0 whitespace-nowrap"
                    >
                      {s.action} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Widget>
      )}

      {/* ── V2: Recommendation Engine widget ─────────────────────────── */}
      {ENABLE_RECOMMENDATION_V2_UI && (
        <Widget label="推奨エンジン V2">
          <RecommendationCard sysInfo={sysInfo} />
        </Widget>
      )}

      {/* ── Frametime / Perf overlay (ENABLE_FRAMETIME_OVERLAY_UI) ─────── */}
      {ENABLE_FRAMETIME_OVERLAY_UI && (
        <Widget label="リアルタイム パフォーマンス">
          <FrametimePanel />
        </Widget>
      )}

      {/* ── Row 4: Recent events ─────────────────────────────────────── */}
      <Widget label="最近のイベント">
        {firstLoad ? (
          <Skeleton className="h-10 w-full" />
        ) : recentEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/55">イベントなし</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recentEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-2">
                <Activity size={10} className="text-muted-foreground/55 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-300 truncate">{e.title}</p>
                  <p className="text-[10px] text-muted-foreground/55 truncate">{e.detail}</p>
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

      {/* ── S10-03: Performance Coach modal ──────────────────────────── */}
      {ENABLE_PERFORMANCE_COACH && showCoach && sessionEnded && (
        <PerformanceCoach
          sessionId={sessionEnded.session_id}
          gameName={sessionEnded.game_name}
          scoreBefore={sessionEnded.score_before}
          scoreAfter={sessionEnded.score_after}
          durationMinutes={sessionEnded.duration_minutes}
          onClose={() => {
            setShowCoach(false);
            setSessionEnded(null);
          }}
        />
      )}

      {/* ── Tournament checklist modal (ENABLE_TOURNAMENT_MODE_UI) ────── */}
      {ENABLE_TOURNAMENT_MODE_UI && showTournament && (
        <TournamentModal onClose={() => setShowTournament(false)} />
      )}

    </div>
  );
}
