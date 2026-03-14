import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, MemoryStick, Zap, Monitor, MonitorCheck, Shield, HardDrive, Wifi, ChevronRight, Loader2, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useAppStore } from "@/stores/useAppStore";
import { useSystemStore } from "@/stores/useSystemStore";
import { useMetricsStore } from "@/stores/useMetricsStore";
import { useSafetyStore } from "@/stores/useSafetyStore";
import { useSystemInfo } from "@/hooks/useSystemInfo";
import { formatMemory } from "@/lib/utils";
import type { GpuInfo, NetworkSettings, AllOptimizationResult, SimulationResult, SessionStats, OptimizationScore, ScoreSnapshot } from "@/types";
import { getCpuVendorLogo, getGpuVendorLogo } from "@/lib/hardwareIcons";
import { VendorIcon } from "@/lib/VendorIcon";

// ── Health Score ─────────────────────────────────────────────────────────────

interface HealthCheck {
  label: string;
  active: boolean;
  page: string;
}

function HealthRing({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const colorClass =
    score >= 75 ? "text-cyan-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      <svg width="112" height="112" className="-rotate-90">
        {/* Track */}
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-white/[0.05]" />
        {/* Glow layer */}
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="11"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={`${colorClass} opacity-20 blur-[3px]`}
        />
        {/* Main progress */}
        <circle
          cx="56" cy="56" r={r} fill="none"
          stroke="currentColor" strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className={`${colorClass} [transition:stroke-dasharray_0.8s_ease]`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-bold leading-none tabular-nums ${colorClass}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground/50 mt-1 tracking-widest uppercase">score</span>
      </div>
    </div>
  );
}

// ── Per-category score bar ────────────────────────────────────────────────────

function ScoreBar({
  score,
  label,
  sub,
  page,
}: {
  score: number;
  label: string;
  sub?: string;
  page: string;
}) {
  const barColor =
    score >= 75
      ? "bg-emerald-400"
      : score >= 40
      ? "bg-amber-400"
      : "bg-red-400";
  const textColor =
    score >= 75
      ? "text-emerald-400"
      : score >= 40
      ? "text-amber-400"
      : "text-red-400";

  return (
    <button
      type="button"
      onClick={() => useAppStore.getState().setActivePage(page as never)}
      className="flex items-center gap-2.5 text-xs group text-left w-full hover:bg-white/[0.02] rounded-lg px-1 py-0.5 transition-colors"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          score === 100
            ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.7)]"
            : "bg-white/[0.15]"
        }`}
      />
      <span className="flex-1 min-w-0">
        <span
          className={
            score === 100
              ? "text-foreground"
              : "text-muted-foreground/70 group-hover:text-muted-foreground/90 transition-colors"
          }
        >
          {label}
        </span>
        {sub && (
          <span className="ml-1.5 text-[10px] text-muted-foreground/55">{sub}</span>
        )}
      </span>
      {/* 5 fixed segments: each lights up when score exceeds its threshold */}
      <div className="flex gap-0.5 shrink-0">
        {[20, 40, 60, 80, 100].map((t) => (
          <div
            key={t}
            className={`w-2.5 h-1 rounded-sm transition-colors duration-500 ${
              score >= t ? barColor : "bg-white/[0.07]"
            }`}
          />
        ))}
      </div>
      <span className={`text-[10px] tabular-nums w-6 text-right ${textColor}`}>
        {score}
      </span>
    </button>
  );
}

// ── Score sparkline ───────────────────────────────────────────────────────────

function ScoreSparkline({ history }: { history: ScoreSnapshot[] }) {
  if (history.length < 2) return null;

  const W = 200;
  const H = 40;
  const PAD = 4;

  const xs = history.map(
    (_, i) => PAD + (i / (history.length - 1)) * (W - PAD * 2)
  );
  const ys = history.map(
    (s) => PAD + (1 - s.overall / 100) * (H - PAD * 2)
  );

  const polyline = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaPath = `M ${xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" L ")} L ${xs[xs.length - 1].toFixed(1)},${(H - PAD).toFixed(1)} L ${PAD},${(H - PAD).toFixed(1)} Z`;

  const last = history[history.length - 1];
  const color =
    last.overall >= 75 ? "#34d399" : last.overall >= 50 ? "#fbbf24" : "#f87171";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-10"
    >
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sg)" />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={xs[xs.length - 1].toFixed(1)}
        cy={ys[ys.length - 1].toFixed(1)}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

// ── Mini stat strip card ──────────────────────────────────────────────────────

function MiniStat({
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 bg-[#05080c] border border-white/[0.12] rounded-xl px-4 py-3.5 flex items-center gap-3 card-glow transition-all">
      <div className={`p-2 rounded-lg shrink-0 ${accent ? "bg-cyan-500/15 border border-cyan-500/25" : "bg-white/[0.05] border border-white/[0.06]"}`}>
        <span className={accent ? "text-cyan-400" : "text-muted-foreground"}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest leading-none mb-1.5">{label}</p>
        <p className="text-sm font-bold text-foreground truncate">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function Dashboard() {
  useSystemInfo(3000);
  const { gameModeActive, freedMemoryMb } = useAppStore();
  const { systemInfo } = useSystemStore();
  const { setSimulation, lastOptResult, setLastOptResult } = useMetricsStore();
  const { rollbackEnabled } = useSafetyStore();
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [windowsOptimized, setWindowsOptimized] = useState(false);
  const [networkOptimized, setNetworkOptimized] = useState(false);
  const [powerOptimized, setPowerOptimized] = useState(false);
  const [allOptRunning, setAllOptRunning] = useState(false);
  const [allOptResult, setAllOptResult] = useState<AllOptimizationResult | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [optScore, setOptScore] = useState<OptimizationScore | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>([]);

  const refreshOptStates = () => {
    invoke<boolean>("has_windows_settings_backup").then(setWindowsOptimized).catch(() => {});
    invoke<NetworkSettings>("get_network_settings")
      .then((s) => setNetworkOptimized(s.throttling_disabled))
      .catch(() => {});
    invoke<string>("get_current_power_plan")
      .then((s) => {
        const lower = s.toLowerCase();
        setPowerOptimized(lower.includes("ultimate") || lower.includes("high performance") || lower.includes("ハイパフォーマンス"));
      })
      .catch(() => {});
  };

  const refreshScore = () => {
    invoke<OptimizationScore>("get_optimization_score").then(setOptScore).catch(console.error);
  };

  useEffect(() => {
    invoke<GpuInfo[]>("get_gpu_info").then(setGpuList).catch(console.error);
    invoke<SessionStats>("get_session_stats").then(setSessionStats).catch(console.error);
    invoke<ScoreSnapshot[]>("get_score_history").then(setScoreHistory).catch(console.error);
    refreshOptStates();
    refreshScore();
  }, []);

  // Sync result from SimulationPanel execution back into Dashboard state
  useEffect(() => {
    if (lastOptResult) {
      setAllOptResult(lastOptResult);
      setLastOptResult(null);
      refreshOptStates();
      refreshScore();
      invoke<ScoreSnapshot[]>("get_score_history").then(setScoreHistory).catch(console.error);
      // Refresh stats after a brief delay to allow session to be saved
      setTimeout(() => {
        invoke<SessionStats>("get_session_stats").then(setSessionStats).catch(console.error);
      }, 1500);
    }
  }, [lastOptResult, setLastOptResult]);

  const runAllOptimizations = async () => {
    if (allOptRunning) return;
    setAllOptRunning(true);
    setAllOptResult(null);
    try {
      // Phase 3: show simulation preview when rollback is enabled
      if (rollbackEnabled) {
        const sim = await invoke<SimulationResult>("simulate_all_optimizations");
        const hasRisky = sim.caution_count > 0 || sim.advanced_count > 0;
        if (hasRisky) {
          // Open confirmation dialog  Eexecution happens inside SimulationPanel
          setSimulation(sim);
          setAllOptRunning(false);
          return;
        }
      }
      // All safe or rollback disabled  Erun directly
      const r = await invoke<AllOptimizationResult>("apply_all_optimizations");
      setAllOptResult(r);
      useAppStore.getState().setGameModeActive(true);
      useAppStore.getState().setFreedMemoryMb(r.process_freed_mb);
      refreshOptStates();
      refreshScore();
      invoke<ScoreSnapshot[]>("get_score_history").then(setScoreHistory).catch(console.error);
      setTimeout(() => {
        invoke<SessionStats>("get_session_stats").then(setSessionStats).catch(console.error);
      }, 1500);
    } catch (e) {
      setAllOptResult({ process_killed: 0, process_freed_mb: 0, power_plan_set: false, windows_applied: false, network_applied: false, errors: [String(e)] });
    } finally {
      setAllOptRunning(false);
    }
  };

  const healthChecks: HealthCheck[] = [
    { label: "プロセス最適匁E, active: gameModeActive, page: "gamemode" },
    { label: "Windows 設宁E, active: windowsOptimized, page: "windows" },
    { label: "ネットワーク最適匁E, active: networkOptimized, page: "network" },
    { label: "パフォーマンス電溁E, active: powerOptimized, page: "gamemode" },
  ];
  // Use detailed score when available, else fall back to binary 4-check score
  const healthScore = optScore?.overall ?? healthChecks.filter((c) => c.active).length * 25;

  if (!systemInfo) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          <span className="text-sm">シスチE��惁E��を取得中...</span>
        </div>
      </div>
    );
  }

  const gpuFirst = gpuList[0];
  const cpuLogo = getCpuVendorLogo(systemInfo.cpu_name);
  const gpuLogo = gpuFirst ? getGpuVendorLogo(gpuFirst.name) : null;

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">ダチE��ュボ�EチE/h1>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {systemInfo.os_name} · {systemInfo.os_version}
          </p>
        </div>
        {gameModeActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wide">ゲームモーチEON</span>
          </div>
        )}
      </div>

      {/* Top strip  Emini stat cards */}
      <div className="flex gap-3">
        <MiniStat
          icon={cpuLogo ? <VendorIcon vendor={cpuLogo.vendor} className="w-3.5 h-3.5" /> : <Cpu size={14} />}
          label="CPU"
          value={`${systemInfo.cpu_usage.toFixed(1)}%`}
          sub={`${systemInfo.cpu_name} · ${systemInfo.cpu_cores}コア`}
          accent
        />
        <MiniStat
          icon={<MemoryStick size={14} />}
          label="Memory"
          value={`${systemInfo.memory_percent.toFixed(1)}%`}
          sub={`${formatMemory(systemInfo.memory_used_mb)} / ${formatMemory(systemInfo.memory_total_mb)}`}
          accent
        />
        {gpuFirst && (
          <MiniStat
            icon={gpuLogo ? <VendorIcon vendor={gpuLogo.vendor} className="w-3.5 h-3.5" /> : <MonitorCheck size={14} />}
            label="GPU"
            value={gpuFirst.vram_total_mb > 0 ? `${((gpuFirst.vram_used_mb / gpuFirst.vram_total_mb) * 100).toFixed(1)}%` : " E}
            sub={gpuFirst.vram_total_mb > 0 ? `${formatMemory(gpuFirst.vram_total_mb)} VRAM` : gpuFirst.name}
            accent
          />
        )}
        <MiniStat
          icon={<Wifi size={14} />}
          label="Network"
          value={networkOptimized ? "最適化済み" : "通常"}
          sub={networkOptimized ? "DNS・TCP/IP最適匁E : "未最適匁E}
          accent={networkOptimized}
        />
      </div>

      {/* Health Score + CTA */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
        {/* Top accent bar */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-5">
            <HealthRing score={healthScore} />
            <div className="flex-1 flex flex-col gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">ゲーミング最適化スコア</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  {optScore
                    ? `総合スコア ${optScore.overall}/100`
                    : `${healthChecks.filter(c => c.active).length} / ${healthChecks.length} 頁E��が有効`}
                </p>
              </div>
              {optScore ? (
                <div className="flex flex-col gap-1">
                  <ScoreBar
                    score={optScore.process}
                    label="プロセス最適匁E
                    sub={optScore.bloatware_running > 0 ? `${optScore.bloatware_running}個稼働中` : undefined}
                    page="gamemode"
                  />
                  <ScoreBar score={optScore.power}   label="電源�Eラン"     page="gamemode" />
                  <ScoreBar score={optScore.windows} label="Windows 設宁E   page="windows"  />
                  <ScoreBar score={optScore.network} label="ネットワーク"   page="network"  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                  {healthChecks.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => useAppStore.getState().setActivePage(c.page as never)}
                      className="flex items-center gap-2 text-xs group text-left"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 transition-all ${c.active ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-white/[0.10]"}`} />
                      <span className={c.active ? "text-foreground" : "text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"}>
                        {c.label}
                      </span>
                      {!c.active && (
                        <ChevronRight size={10} className="text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* All-in-one optimization CTA */}
          {healthScore < 100 && !allOptResult && (
            <button
              type="button"
              onClick={runAllOptimizations}
              disabled={allOptRunning}
              className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all text-sm
                ${allOptRunning
                  ? "bg-cyan-500/10 text-cyan-400/50 cursor-not-allowed border border-cyan-500/15"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97] glow-cyan"
                }`}
            >
              {allOptRunning ? (
                <><Loader2 size={16} className="animate-spin" /> 全最適化実行中...</>
              ) : (
                <><Zap size={16} /> 今すぐ�E最適化（�Eロセス・電源�EWindows・ネットワーク�E�E/>
              )}
            </button>
          )}

          {/* Result banner */}
          {allOptResult && (
            <div className={`rounded-xl px-4 py-3 flex flex-col gap-1.5 border ${allOptResult.errors.length > 0 && allOptResult.process_killed === 0 ? "bg-red-500/10 border-red-500/25" : "bg-emerald-500/10 border-emerald-500/25"}`}>
              <div className="flex items-center gap-2">
                {allOptResult.errors.length === 0 ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-amber-400 shrink-0" />
                )}
                <p className="text-sm font-semibold text-emerald-400">全最適化完亁E/p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pl-5">
                <span>プロセス停止: <span className="text-foreground font-medium">{allOptResult.process_killed}件 ({allOptResult.process_freed_mb.toFixed(0)} MB解放)</span></span>
                {allOptResult.power_plan_set && <span className="text-emerald-400">電溁E✁E/span>}
                {allOptResult.windows_applied && <span className="text-emerald-400">Windows ✁E/span>}
                {allOptResult.network_applied && <span className="text-emerald-400">ネットワーク ✁E/span>}
                {allOptResult.errors.map((e, i) => (
                  <span key={i} className="text-amber-400">{e}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cumulative Session Stats */}
      {sessionStats && sessionStats.total_sessions > 0 && (
        <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
          <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="p-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg shrink-0">
              <BarChart3 size={13} className="text-muted-foreground/60" />
            </div>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">
              累積実績
            </p>
          </div>
          <div className="px-4 pb-3 grid grid-cols-3 gap-px">
            <div className="flex flex-col items-center py-2 px-3 bg-white/[0.015] rounded-lg">
              <span className="text-xl font-bold text-slate-200 tabular-nums">{sessionStats.total_sessions}</span>
              <span className="text-[10px] text-muted-foreground/50 mt-0.5">最適化回数</span>
            </div>
            <div className="flex flex-col items-center py-2 px-3 bg-white/[0.015] rounded-lg">
              <span className="text-xl font-bold text-emerald-400 tabular-nums">
                {sessionStats.total_memory_freed_mb >= 1024
                  ? `${(sessionStats.total_memory_freed_mb / 1024).toFixed(1)}GB`
                  : `${sessionStats.total_memory_freed_mb.toFixed(0)}MB`}
              </span>
              <span className="text-[10px] text-muted-foreground/50 mt-0.5">総解放メモリ</span>
            </div>
            <div className="flex flex-col items-center py-2 px-3 bg-white/[0.015] rounded-lg">
              <span className="text-xl font-bold text-cyan-400 tabular-nums">{sessionStats.total_processes_killed}</span>
              <span className="text-[10px] text-muted-foreground/50 mt-0.5">停止プロセス</span>
            </div>
          </div>
          {/* Score trend sparkline */}
          {scoreHistory.length >= 2 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] text-muted-foreground/55 uppercase tracking-widest mb-1.5">
                スコア推移
              </p>
              <ScoreSparkline history={scoreHistory} />
            </div>
          )}
        </div>
      )}

      {/* System Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="CPU 使用玁E
          value={systemInfo.cpu_usage}
          icon={cpuLogo ? <VendorIcon vendor={cpuLogo.vendor} className="w-3.5 h-3.5" /> : <Cpu size={14} />}
          subtitle={`${systemInfo.cpu_name} (${systemInfo.cpu_cores}コア)`}
        />
        <StatCard
          label="RAM 使用玁E
          value={systemInfo.memory_percent}
          icon={<MemoryStick size={14} />}
          subtitle={`${formatMemory(systemInfo.memory_used_mb)} / ${formatMemory(systemInfo.memory_total_mb)}`}
        />
        {gpuList.map((gpu, i) => {
          const logo = getGpuVendorLogo(gpu.name);
          return (
            <StatCard
              key={i}
              label="GPU VRAM"
              value={gpu.vram_used_mb > 0 ? (gpu.vram_used_mb / gpu.vram_total_mb) * 100 : 0}
              icon={logo ? <VendorIcon vendor={logo.vendor} className="w-3.5 h-3.5" /> : <MonitorCheck size={14} />}
              subtitle={gpu.vram_total_mb > 0
                ? `${gpu.name} · ${formatMemory(gpu.vram_total_mb)} VRAM`
                : gpu.name}
            />
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="p-4">
          <h2 className="text-[10px] font-semibold text-muted-foreground/50 mb-3.5 uppercase tracking-widest">
            クイチE��アクション
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            <QuickActionButton
              icon={<Monitor size={16} />}
              label="ゲームモーチE
              description="不要�Eロセス停止"
              onClick={() => useAppStore.getState().setActivePage("gamemode")}
              active={gameModeActive}
            />
            <QuickActionButton
              icon={<Zap size={16} />}
              label="Windows設宁E
              description="視覚効果最適匁E
              onClick={() => useAppStore.getState().setActivePage("windows")}
              active={windowsOptimized}
            />
            <QuickActionButton
              icon={<Wifi size={16} />}
              label="ネットワーク"
              description="DNS・TCP/IP最適匁E
              onClick={() => useAppStore.getState().setActivePage("network")}
              active={networkOptimized}
            />
            <QuickActionButton
              icon={<HardDrive size={16} />}
              label="ストレージ"
              description="キャチE��ュ削除"
              onClick={() => useAppStore.getState().setActivePage("storage")}
            />
            <QuickActionButton
              icon={<Shield size={16} />}
              label="アチE�EチE�EチE
              description="アプリ・ドライバ�E"
              onClick={() => useAppStore.getState().setActivePage("updates")}
            />
            <QuickActionButton
              icon={<Cpu size={16} />}
              label="ハ�Eドウェア"
              description="GPU電力制御"
              onClick={() => useAppStore.getState().setActivePage("hardware")}
            />
          </div>
        </div>
      </div>

      {/* Last Optimization Result */}
      {freedMemoryMb > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <CheckCircle2 size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-400">最適化完亁E/p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {freedMemoryMb.toFixed(1)} MB のメモリを解放しました
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  disabledLabel?: string;
}

function QuickActionButton({
  icon,
  label,
  description,
  onClick,
  active,
  disabled,
  disabledLabel,
}: QuickActionButtonProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative flex flex-col items-center gap-2.5 p-3.5 rounded-xl border transition-all text-center group
        ${disabled
          ? "border-white/[0.06] opacity-40 cursor-not-allowed"
          : active
          ? "border-emerald-500/35 bg-emerald-500/8 hover:bg-emerald-500/12"
          : "border-white/[0.07] hover:border-cyan-500/35 hover:bg-cyan-500/5 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.15)] cursor-pointer"
        }
      `}
    >
      <div className={`p-2.5 rounded-xl transition-all ${
        active
          ? "bg-emerald-500/15 border border-emerald-500/25"
          : "bg-white/[0.05] border border-white/[0.07] group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20"
      }`}>
        <span className={active ? "text-emerald-400" : "text-muted-foreground/70 group-hover:text-cyan-400 transition-colors"}>{icon}</span>
      </div>
      <div>
        <p className="text-xs font-semibold leading-tight">{label}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-tight">{description}</p>
      </div>
      {disabled && disabledLabel && (
        <span className="absolute top-1 right-1 text-[10px] text-muted-foreground/50 bg-white/5 px-1 rounded">
          {disabledLabel}
        </span>
      )}
      {active && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
      )}
    </button>
  );
}
