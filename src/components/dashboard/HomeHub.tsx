/**
 * HomeHub — FM26スタイル データ視認性重視レイアウト
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Zap, Cpu, Wifi, Activity,
  AlertTriangle, Home, Bot, Flame, TrendingDown,
  Gamepad2, Stethoscope, Trophy, Calendar,
  RotateCcw, ChevronRight, Thermometer,
} from "lucide-react";
import { cn, formatMemory } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { GlowBar } from "@/components/ui/GlowBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/stores/useToastStore";
import { PerformanceCoach } from "@/components/gamelog/PerformanceCoach";
import { RecommendationCard } from "@/components/recommendation/RecommendationCard";
import { TournamentModal } from "@/components/tournament/TournamentModal";
import { FrametimePanel } from "@/components/hardware/FrametimePanel";
import type {
  OptimizationScore, SystemInfo, GpuStatus,
  FpsEstimate, BandwidthSnapshot, DiskHealthReport, EventEntry, Policy, ScoreSnapshot,
  HardwareDiagnostics, HardwareSuggestion, GameLaunchedPayload, SessionEndedPayload,
  ActivePage,
} from "@/types";
import {
  ENABLE_POLICY_ENGINE, ENABLE_SCORE_REGRESSION_WATCH,
  ENABLE_THERMAL_AUTO_REDUCTION, ENABLE_LAUNCH_MONITORING,
  ENABLE_HARDWARE_SUGGESTIONS, ENABLE_PERFORMANCE_COACH,
  ENABLE_RECOMMENDATION_V2_UI, ENABLE_TOURNAMENT_MODE_UI,
  ENABLE_FRAMETIME_OVERLAY_UI,
} from "@/config/features";

// ── Primitives ────────────────────────────────────────────────────────────────

/** FM26スタイル セクションカード */
function Card({ title, children, className, action }: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={cn("bg-[#141414] border border-white/[0.10] rounded-xl overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{title}</span>
          {action && (
            <button type="button" onClick={action.onClick}
              className="text-[11px] text-orange-400/70 hover:text-orange-400 transition-colors uppercase tracking-wider">
              {action.label} →
            </button>
          )}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/** FM26スタイル 数値行 — ラベル左・値右 */
function MetricRow({ label, value, sub, color = "text-white/85", bar, barAccent, barValue }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  bar?: boolean;
  barAccent?: "orange" | "green" | "amber" | "red";
  barValue?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/50 uppercase tracking-wider shrink-0">{label}</span>
        <div className="flex items-center gap-1.5">
          {sub && <span className="text-[11px] text-white/30 tabular-nums">{sub}</span>}
          <span className={cn("text-sm font-semibold tabular-nums", color)}>{value}</span>
        </div>
      </div>
      {bar && barValue !== undefined && (
        <GlowBar value={barValue} accent={barAccent ?? "orange"} height={7} />
      )}
    </div>
  );
}

/** FM26スタイル ヒーロー数値 — 大きな単一数値 */
function HeroMetric({ label, value, unit, color, sub, onClick }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl bg-[#141414] border border-white/[0.09] hover:border-orange-500/25 hover:bg-[#1a1a1a] transition-all group"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 group-hover:text-white/55 transition-colors">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-3xl font-light tabular-nums leading-none", color ?? "text-white/90")}>{value}</span>
        {unit && <span className="text-xs text-white/30 uppercase">{unit}</span>}
      </div>
      {sub && <span className="text-[10px] text-white/30">{sub}</span>}
    </button>
  );
}

// ── AI Briefing ───────────────────────────────────────────────────────────────

function buildBriefing(score: OptimizationScore | null, sysInfo: SystemInfo | null, gpu: GpuStatus | null, events: EventEntry[]) {
  const s = score?.overall ?? 0;
  const gpuHot   = (gpu?.temperature_c ?? 0) >= 85;
  const memHigh  = (sysInfo?.memory_percent ?? 0) >= 85;
  const hasErrors = events.some(e => e.event_type === "error");
  const actions: { label: string; page: ActivePage; primary?: boolean }[] = [];

  if (s < 50)   actions.push({ label: "今すぐ最適化", page: "optimize_hub", primary: true });
  else if (s < 75) actions.push({ label: "パフォーマンス改善", page: "optimize_hub", primary: true });
  if (gpuHot)   actions.push({ label: "GPU温度確認", page: "hardware_bench" });
  if (memHigh)  actions.push({ label: "メモリ解放",  page: "process_startup" });
  if (hasErrors) actions.push({ label: "エラー確認", page: "rollback_logs" });
  if (actions.length < 2) actions.push({ label: "ゲームライブラリ", page: "games_hub" });
  if (actions.length < 3) actions.push({ label: "自動化設定", page: "scheduler_policy" });

  const headline =
    s < 50 ? "パフォーマンスが低下しています"
    : s < 75 ? "改善の余地があります"
    : gpuHot ? "GPU温度が高めです"
    : memHigh ? "メモリ使用率が高いです"
    : "システムは良好です";
  const status = s < 50 ? "critical" : s < 75 ? "warning" : "ok";

  return { headline, actions: actions.slice(0, 3), status };
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ snapshots }: { snapshots: ScoreSnapshot[] }) {
  if (snapshots.length < 2) return null;
  const scores = snapshots.slice(-10).map(s => s.overall);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const W = 56, H = 20;
  const pts = scores.map((v, i) => `${(i / (scores.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(" ");
  const trend = scores[scores.length - 1] - scores[scores.length - 2];
  return (
    <div className="flex items-center gap-1.5">
      <svg width={W} height={H} className="overflow-visible opacity-70">
        <polyline points={pts} fill="none" stroke={trend >= 0 ? "#22c55e" : "#f87171"} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className={cn("text-xs font-semibold tabular-nums", trend >= 0 ? "text-green-400" : "text-red-400")}>
        {trend >= 0 ? "+" : ""}{trend}
      </span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function HomeHub() {
  const { setActivePage } = useAppStore();

  const [score,          setScore]          = useState<OptimizationScore | null>(null);
  const [sysInfo,        setSysInfo]        = useState<SystemInfo | null>(null);
  const [gpuList,        setGpuList]        = useState<GpuStatus[]>([]);
  const [fps,            setFps]            = useState<FpsEstimate | null>(null);
  const [bandwidth,      setBandwidth]      = useState<BandwidthSnapshot | null>(null);
  const [diskHealth,     setDiskHealth]     = useState<DiskHealthReport | null>(null);
  const [events,         setEvents]         = useState<EventEntry[]>([]);
  const [activeProfile,  setActiveProfile]  = useState<string | null>(null);
  const [policies,       setPolicies]       = useState<Policy[]>([]);
  const [scoreSnapshots, setScoreSnapshots] = useState<ScoreSnapshot[]>([]);
  const [regressionScore,setRegressionScore]= useState<number | null>(null);
  const [thermalThrottled,setThermalThrottled] = useState(false);
  const [gameLaunched,   setGameLaunched]   = useState<GameLaunchedPayload | null>(null);
  const [hwDiag,         setHwDiag]         = useState<HardwareDiagnostics | null>(null);
  const [sessionEnded,   setSessionEnded]   = useState<SessionEndedPayload | null>(null);
  const [showCoach,      setShowCoach]      = useState(false);
  const [showTournament, setShowTournament] = useState(false);
  const [firstLoad,      setFirstLoad]      = useState(true);

  const fetchAll = useCallback(async () => {
    const r = await Promise.allSettled([
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
      ENABLE_HARDWARE_SUGGESTIONS ? invoke<HardwareDiagnostics>("get_hardware_diagnostics") : Promise.reject("disabled"),
    ]);
    if (r[0].status === "fulfilled") setScore(r[0].value);
    if (r[1].status === "fulfilled") setSysInfo(r[1].value);
    if (r[2].status === "fulfilled") setGpuList(r[2].value);
    if (r[3].status === "fulfilled") setFps(r[3].value);
    if (r[4].status === "fulfilled") setBandwidth(r[4].value);
    if (r[5].status === "fulfilled") setDiskHealth(r[5].value);
    if (r[6].status === "fulfilled") setEvents(r[6].value);
    if (r[7].status === "fulfilled") setActiveProfile(r[7].value);
    if (r[8].status === "fulfilled") setPolicies(r[8].value);
    if (r[9].status === "fulfilled") setScoreSnapshots(r[9].value);
    if (r[10].status === "fulfilled") setHwDiag(r[10].value as HardwareDiagnostics);
    setFirstLoad(false);
  }, []);

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, 3000); return () => clearInterval(id); }, [fetchAll]);

  useEffect(() => {
    if (!ENABLE_SCORE_REGRESSION_WATCH) return;
    let u: (() => void) | undefined;
    listen<number>("score_regression", e => { setRegressionScore(e.payload); toast.info(`スコア急落: ${e.payload} pts`); }).then(f => { u = f; });
    return () => u?.();
  }, []);

  useEffect(() => {
    if (!ENABLE_THERMAL_AUTO_REDUCTION) return;
    let u: (() => void) | undefined;
    listen<boolean>("thermal_throttle_changed", e => setThermalThrottled(e.payload)).then(f => { u = f; });
    return () => u?.();
  }, []);

  useEffect(() => {
    if (!ENABLE_LAUNCH_MONITORING) return;
    let u: (() => void) | undefined;
    listen<GameLaunchedPayload>("game_launched", e => { setGameLaunched(e.payload); toast.info(`ゲーム起動: ${e.payload.game_name}`); }).then(f => { u = f; });
    return () => u?.();
  }, []);

  useEffect(() => {
    if (!ENABLE_PERFORMANCE_COACH) return;
    let u: (() => void) | undefined;
    listen<SessionEndedPayload>("session_ended", e => { setSessionEnded(e.payload); setShowCoach(true); }).then(f => { u = f; });
    return () => u?.();
  }, []);

  const healthScore = score?.overall ?? 0;
  const isCritical  = !firstLoad && healthScore < 50;
  const needsAttn   = !firstLoad && healthScore >= 50 && healthScore < 75;
  const gpu         = gpuList[0] ?? null;

  const cpuPct  = sysInfo?.cpu_usage ?? 0;
  const ramPct  = sysInfo?.memory_percent ?? 0;
  const gpuTemp = gpu?.temperature_c ?? 0;
  const fpsPct  = fps?.estimated_fps ?? 0;

  const scoreColor  = healthScore >= 75 ? "text-green-400" : healthScore >= 50 ? "text-orange-400" : "text-red-400";
  const cpuColor    = cpuPct  >= 90 ? "text-red-400" : cpuPct  >= 70 ? "text-orange-400" : "text-white/85";
  const ramColor    = ramPct  >= 85 ? "text-red-400" : ramPct  >= 65 ? "text-orange-400" : "text-white/85";
  const gpuColor    = gpuTemp >= 85 ? "text-red-400" : gpuTemp >= 70 ? "text-orange-400" : "text-white/85";
  const fpsColor    = fpsPct  >= 60 ? "text-green-400" : fpsPct >= 30 ? "text-orange-400" : fpsPct > 0 ? "text-red-400" : "text-white/35";

  const { headline, actions: briefActions, status } = buildBriefing(score, sysInfo, gpu, events);
  const enabledPolicies = policies.filter(p => p.enabled);
  const totalFires      = policies.reduce((s, p) => s + p.fire_count, 0);

  return (
    <div className="p-5 flex flex-col gap-4 h-full overflow-y-auto">

      {/* ── ページヘッダー ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Home size={18} className="text-orange-400" />
          <div>
            <h1 className="text-xl font-bold text-white leading-none">ホーム</h1>
            <p className="text-[10px] text-white/35 uppercase tracking-widest mt-0.5">システム概要 · 3秒更新</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeProfile && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs text-orange-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />{activeProfile}
            </span>
          )}
          <RollbackEntryPoint compact className="opacity-60 hover:opacity-100 transition-opacity" />
          {ENABLE_TOURNAMENT_MODE_UI && (
            <button type="button" onClick={() => setShowTournament(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition-colors uppercase tracking-wider">
              <Trophy size={12} /> 試合前チェック
            </button>
          )}
        </div>
      </div>

      {/* ── アラート ─────────────────────────────────────────────────── */}
      {isCritical && <AlertBanner variant="error" icon={<AlertTriangle size={14} className="text-red-400" />}
        title="システムパフォーマンスが低下しています" detail={`スコア ${healthScore} — 即時最適化を推奨します`}
        action={{ label: "最適化へ →", onClick: () => setActivePage("optimize_hub") }} />}
      {needsAttn && <AlertBanner variant="warning" icon={<Zap size={14} className="text-orange-400" />}
        title="最適化で改善できます" detail={`スコア ${healthScore} / 100`}
        action={{ label: "最適化へ →", onClick: () => setActivePage("optimize_hub") }} />}
      {ENABLE_SCORE_REGRESSION_WATCH && regressionScore !== null && (
        <AlertBanner variant="error" icon={<TrendingDown size={14} className="text-red-400" />}
          title="スコア急落を検出しました" detail={`現在: ${regressionScore}`}
          action={{ label: "最適化へ →", onClick: () => setActivePage("optimize_hub") }}
          onDismiss={() => setRegressionScore(null)} />
      )}
      {ENABLE_LAUNCH_MONITORING && gameLaunched && (
        <AlertBanner variant="success" icon={<Gamepad2 size={14} className="text-green-400" />}
          title={`ゲーム起動検出: ${gameLaunched.game_name}`}
          detail={`プロファイル自動適用済み（起動前スコア: ${gameLaunched.score_before}）`}
          onDismiss={() => setGameLaunched(null)} />
      )}

      {/* ══════════════════════════════════════════════════════════════
          ヒーローメトリクス — 5つの主要数値を横一列
      ══════════════════════════════════════════════════════════════ */}
      <div className="flex gap-3">
        {firstLoad ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <>
            <HeroMetric label="スコア" value={healthScore} unit="/100" color={scoreColor}
              sub={ENABLE_SCORE_REGRESSION_WATCH && scoreSnapshots.length >= 2 ? undefined : undefined}
              onClick={() => setActivePage("optimize_hub")} />
            <HeroMetric label="CPU" value={`${cpuPct.toFixed(0)}%`} color={cpuColor}
              sub={sysInfo ? undefined : "—"} onClick={() => setActivePage("process_startup")} />
            <HeroMetric label="RAM" value={`${ramPct.toFixed(0)}%`} color={ramColor}
              sub={sysInfo ? formatMemory(sysInfo.memory_used_mb) : "—"} onClick={() => setActivePage("process_startup")} />
            <HeroMetric label="GPU 温度" value={gpuTemp > 0 ? `${gpuTemp}°C` : "—"} color={gpuColor}
              sub={gpu?.name?.split(" ").slice(-2).join(" ")} onClick={() => setActivePage("hardware_bench")} />
            <HeroMetric label="FPS" value={fpsPct > 0 ? fpsPct : "—"} unit={fpsPct > 0 ? "fps" : undefined} color={fpsColor}
              sub={fps?.is_detecting ? fps.game_process || "検出中" : "未起動"} onClick={() => setActivePage("hardware_bench")} />
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          AIブリーフィング
      ══════════════════════════════════════════════════════════════ */}
      {!firstLoad && (
        <div className={cn("flex items-center gap-4 px-4 py-3.5 rounded-xl border",
          status === "critical" ? "bg-red-500/[0.05] border-red-500/25"
          : status === "warning" ? "bg-orange-500/[0.05] border-orange-500/20"
          : "bg-white/[0.03] border-white/[0.09]"
        )}>
          <Bot size={20} className={status === "critical" ? "text-red-400" : status === "warning" ? "text-orange-400" : "text-green-400"} />
          <p className="flex-1 text-sm font-medium text-white/85">{headline}</p>
          <div className="flex items-center gap-2">
            {briefActions.map((a, i) => (
              <button key={a.page} type="button" onClick={() => setActivePage(a.page)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] uppercase tracking-wider",
                  i === 0 && a.primary ? "btn-gaming" : "bg-white/[0.06] border border-white/[0.10] text-white/60 hover:text-white hover:bg-white/[0.10]"
                )}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          メインデータグリッド
      ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-4">

        {/* CPU / RAM 詳細 */}
        <Card title="CPU / RAM">
          {firstLoad || !sysInfo ? <Skeleton className="h-32 w-full" /> : (
            <div className="flex flex-col gap-4">
              <MetricRow label="CPU 使用率" value={`${cpuPct.toFixed(1)}%`}
                color={cpuColor} bar barAccent={cpuPct >= 90 ? "red" : cpuPct >= 70 ? "amber" : "orange"} barValue={cpuPct} />
              <MetricRow label="RAM 使用率" value={`${ramPct.toFixed(1)}%`}
                sub={formatMemory(sysInfo.memory_used_mb)}
                color={ramColor} bar barAccent={ramPct >= 85 ? "red" : ramPct >= 65 ? "amber" : "green"} barValue={ramPct} />
              <div className="pt-1 border-t border-white/[0.06]">
                <div className="flex justify-between">
                  <span className="text-xs text-white/40 uppercase tracking-wider">合計 RAM</span>
                  <span className="text-xs font-medium text-white/60">{formatMemory(sysInfo.memory_total_mb)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* GPU */}
        <Card title="GPU">
          {firstLoad ? <Skeleton className="h-32 w-full" /> : gpu ? (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-white/40 truncate -mt-1">{gpu.name}</p>
              <MetricRow label="温度" value={`${gpuTemp}°C`} color={gpuColor}
                bar barAccent={gpuTemp >= 85 ? "red" : gpuTemp >= 70 ? "amber" : "orange"} barValue={Math.min(100, gpuTemp)} />
              {gpu.vram_total_mb > 0 && (
                <MetricRow label="VRAM 使用率"
                  value={`${((gpu.vram_used_mb / gpu.vram_total_mb) * 100).toFixed(0)}%`}
                  sub={`${formatMemory(gpu.vram_used_mb)} / ${formatMemory(gpu.vram_total_mb)}`}
                  bar barAccent={gpuTemp >= 85 ? "red" : "orange"}
                  barValue={(gpu.vram_used_mb / gpu.vram_total_mb) * 100} />
              )}
              {ENABLE_THERMAL_AUTO_REDUCTION && thermalThrottled && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <Flame size={11} className="animate-pulse" /> 電力制限中
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/35">GPU情報なし</p>
          )}
        </Card>

        {/* ネットワーク / ディスク */}
        <Card title="ネットワーク / ディスク">
          {firstLoad ? <Skeleton className="h-32 w-full" /> : (
            <div className="flex flex-col gap-4">
              {bandwidth ? (
                <>
                  <div className="flex items-center gap-2 -mt-1">
                    <Wifi size={11} className="text-orange-400/60 shrink-0" />
                    <span className="text-xs text-white/40 truncate">{bandwidth.active_interface}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricRow label="↓ ダウン"
                      value={bandwidth.download_kbps >= 1024 ? `${(bandwidth.download_kbps / 1024).toFixed(1)}` : `${bandwidth.download_kbps.toFixed(0)}`}
                      sub={bandwidth.download_kbps >= 1024 ? "Mbps" : "Kbps"} color="text-green-400" />
                    <MetricRow label="↑ アップ"
                      value={bandwidth.upload_kbps >= 1024 ? `${(bandwidth.upload_kbps / 1024).toFixed(1)}` : `${bandwidth.upload_kbps.toFixed(0)}`}
                      sub={bandwidth.upload_kbps >= 1024 ? "Mbps" : "Kbps"} color="text-white/70" />
                  </div>
                </>
              ) : <p className="text-xs text-white/35">ネットワーク情報なし</p>}

              <div className="border-t border-white/[0.06] pt-3">
                {diskHealth ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/45 uppercase tracking-wider">ディスク状態</span>
                    <span className={cn("text-sm font-semibold",
                      diskHealth.overall_health === "良好" || diskHealth.overall_health === "Good" ? "text-green-400"
                      : diskHealth.overall_health === "警告" || diskHealth.overall_health === "Warning" ? "text-amber-400"
                      : "text-red-400")}>
                      {diskHealth.overall_health}
                    </span>
                  </div>
                ) : <p className="text-xs text-white/35">ディスク情報なし</p>}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          セカンダリグリッド
      ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-4">

        {/* ハードウェア診断 */}
        {ENABLE_HARDWARE_SUGGESTIONS && hwDiag ? (
          <Card title="ハードウェア診断">
            <div className="flex flex-col gap-3">
              <MetricRow label="CPU" value={`${hwDiag.cpu_usage_percent.toFixed(0)}%`}
                color={hwDiag.cpu_usage_percent > 90 ? "text-red-400" : hwDiag.cpu_usage_percent > 80 ? "text-amber-400" : "text-white/85"}
                bar barAccent={hwDiag.cpu_usage_percent > 90 ? "red" : hwDiag.cpu_usage_percent > 80 ? "amber" : "orange"} barValue={hwDiag.cpu_usage_percent} />
              <MetricRow label="RAM" value={`${hwDiag.memory_used_percent.toFixed(0)}%`}
                color={hwDiag.memory_used_percent > 90 ? "text-red-400" : hwDiag.memory_used_percent > 80 ? "text-amber-400" : "text-white/85"}
                bar barAccent={hwDiag.memory_used_percent > 90 ? "red" : hwDiag.memory_used_percent > 80 ? "amber" : "green"} barValue={hwDiag.memory_used_percent} />
              {hwDiag.gpu_temp_c != null && (
                <MetricRow label="GPU 温度" value={`${hwDiag.gpu_temp_c}°C`}
                  color={hwDiag.gpu_temp_c >= 90 ? "text-red-400" : hwDiag.gpu_temp_c >= 83 ? "text-amber-400" : "text-white/85"}
                  bar barAccent={hwDiag.gpu_temp_c >= 90 ? "red" : hwDiag.gpu_temp_c >= 83 ? "amber" : "orange"} barValue={Math.min(100, hwDiag.gpu_temp_c)} />
              )}
              {hwDiag.suggestions.slice(0, 2).map((s: HardwareSuggestion) => (
                <div key={s.id} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                  s.severity === "critical" ? "bg-red-500/[0.06] border-red-500/20 text-red-300"
                  : s.severity === "warning"  ? "bg-orange-500/[0.06] border-orange-500/15 text-orange-300"
                  : "bg-white/[0.03] border-white/[0.07] text-white/60"
                )}>
                  <Stethoscope size={11} className="shrink-0" />
                  <span className="flex-1 truncate">{s.title}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          /* スコア詳細 */
          <Card title="スコア詳細" action={{ label: "最適化", onClick: () => setActivePage("optimize_hub") }}>
            {firstLoad || !score ? <Skeleton className="h-28 w-full" /> : (
              <div className="flex flex-col gap-3">
                <MetricRow label="プロセス最適化" value={score.process} color={score.process >= 75 ? "text-green-400" : score.process >= 50 ? "text-orange-400" : "text-red-400"}
                  bar barAccent={score.process >= 75 ? "green" : score.process >= 50 ? "amber" : "red"} barValue={score.process} />
                <MetricRow label="電源プラン"      value={score.power}   color={score.power   >= 75 ? "text-green-400" : score.power   >= 50 ? "text-orange-400" : "text-red-400"}
                  bar barAccent={score.power >= 75 ? "green" : score.power >= 50 ? "amber" : "red"} barValue={score.power} />
                <MetricRow label="ネットワーク"   value={score.network} color={score.network >= 75 ? "text-green-400" : score.network >= 50 ? "text-orange-400" : "text-red-400"}
                  bar barAccent={score.network >= 75 ? "green" : score.network >= 50 ? "amber" : "red"} barValue={score.network} />
                {ENABLE_SCORE_REGRESSION_WATCH && scoreSnapshots.length >= 2 && (
                  <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-xs text-white/40 uppercase tracking-wider">推移</span>
                    <Sparkline snapshots={scoreSnapshots} />
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ポリシーエンジン */}
        {ENABLE_POLICY_ENGINE ? (
          <Card title="ポリシーエンジン" action={{ label: "管理", onClick: () => setActivePage("scheduler_policy") }}>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">有効</span>
                  <span className="text-2xl font-light text-white/85">{enabledPolicies.length}</span>
                  <span className="text-xs text-white/30">/ {policies.length} 件</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">実行累計</span>
                  <span className="text-2xl font-light text-white/85">{totalFires}</span>
                  <span className="text-xs text-white/30">回</span>
                </div>
              </div>
              {enabledPolicies.length > 0 ? (
                <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.06]">
                  {enabledPolicies.slice(0, 3).map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400/60 shrink-0" />
                      <span className="text-xs text-white/60 truncate flex-1">{p.name}</span>
                      <span className="text-[10px] text-white/30 tabular-nums">{p.fire_count}回</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/30 pt-1 border-t border-white/[0.06]">有効なポリシーなし</p>
              )}
            </div>
          </Card>
        ) : (
          /* FPS詳細 */
          <Card title="FPS 推定">
            {firstLoad ? <Skeleton className="h-28 w-full" /> : fps ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", fps.is_detecting ? "bg-green-400 animate-pulse" : "bg-white/20")} />
                  <span className="text-xs text-white/45 truncate">{fps.is_detecting ? fps.game_process || "検出中" : "ゲーム未起動"}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-5xl font-light tabular-nums leading-none", fpsColor)}>{fpsPct > 0 ? fpsPct : "—"}</span>
                  {fpsPct > 0 && <span className="text-sm text-white/35 uppercase">fps</span>}
                </div>
                <GlowBar value={Math.min(100, (fpsPct / 144) * 100)} accent={fpsPct >= 60 ? "green" : fpsPct >= 30 ? "amber" : "red"} height={7} />
              </div>
            ) : <p className="text-sm text-white/35">データなし</p>}
          </Card>
        )}

        {/* クイックナビ */}
        <Card title="クイックナビ">
          <div className="flex flex-col gap-1.5">
            {([
              { label: "最適化ハブ",    page: "optimize_hub"    as ActivePage, icon: <Zap size={13} />,        color: "text-orange-400" },
              { label: "ゲームライブラリ", page: "games_hub"    as ActivePage, icon: <Gamepad2 size={13} />,   color: "text-white/55" },
              { label: "ハードウェア",  page: "hardware_bench"  as ActivePage, icon: <Thermometer size={13} />,color: "text-amber-400" },
              { label: "プロセス管理",  page: "process_startup" as ActivePage, icon: <Cpu size={13} />,        color: "text-white/55" },
              { label: "ロールバック",  page: "rollback_logs"   as ActivePage, icon: <RotateCcw size={13} />,  color: "text-red-400/70" },
              { label: "自動化設定",    page: "scheduler_policy"as ActivePage, icon: <Calendar size={13} />,   color: "text-white/55" },
            ] as Array<{ label: string; page: ActivePage; icon: React.ReactNode; color: string }>).map(({ label, page, icon, color }) => (
              <button key={page} type="button" onClick={() => setActivePage(page)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/65 hover:text-white hover:bg-white/[0.07] hover:border-orange-500/15 border border-transparent transition-all group">
                <span className={color}>{icon}</span>
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight size={11} className="text-white/20 group-hover:text-orange-400/50 transition-colors" />
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          最近のイベント
      ══════════════════════════════════════════════════════════════ */}
      <Card title="最近のイベント">
        {firstLoad ? <Skeleton className="h-16 w-full" /> : events.slice(0, 4).length === 0 ? (
          <p className="text-sm text-white/35">イベントなし</p>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.05]">
            {events.slice(0, 4).map(e => {
              const page: ActivePage =
                e.event_type === "error" ? "rollback_logs"
                : e.event_type === "optimization" || e.event_type === "preset" ? "optimize_hub"
                : e.event_type === "game" ? "games_hub"
                : e.event_type === "hardware" || e.event_type === "thermal" ? "hardware_bench"
                : e.event_type === "policy" ? "scheduler_policy"
                : "rollback_logs";
              return (
                <button key={e.id} type="button" onClick={() => setActivePage(page)}
                  className="flex items-center gap-3 py-2.5 text-left hover:bg-white/[0.03] -mx-4 px-4 transition-colors group first:pt-0 last:pb-0">
                  <Activity size={11} className={cn("shrink-0 mt-0.5", e.event_type === "error" ? "text-red-400/70" : "text-white/25")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/80 truncate">{e.title}</p>
                    <p className="text-xs text-white/35 truncate mt-0.5">{e.detail}</p>
                  </div>
                  <ChevronRight size={12} className="text-white/15 group-hover:text-orange-400/50 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* 追加ウィジェット */}
      {ENABLE_RECOMMENDATION_V2_UI && <Card title="推奨エンジン V2"><RecommendationCard sysInfo={sysInfo} /></Card>}
      {ENABLE_FRAMETIME_OVERLAY_UI  && <Card title="リアルタイム パフォーマンス"><FrametimePanel /></Card>}

      {/* Footer */}
      <div className="flex items-center justify-end pt-1 border-t border-white/[0.05]">
        <RollbackEntryPoint />
      </div>

      {/* Modals */}
      {ENABLE_PERFORMANCE_COACH && showCoach && sessionEnded && (
        <PerformanceCoach sessionId={sessionEnded.session_id} gameName={sessionEnded.game_name}
          scoreBefore={sessionEnded.score_before} scoreAfter={sessionEnded.score_after}
          durationMinutes={sessionEnded.duration_minutes}
          onClose={() => { setShowCoach(false); setSessionEnded(null); }} />
      )}
      {ENABLE_TOURNAMENT_MODE_UI && showTournament && <TournamentModal onClose={() => setShowTournament(false)} />}
    </div>
  );
}
