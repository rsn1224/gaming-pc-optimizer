import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, MemoryStick, Zap, Monitor, MonitorCheck, Shield, HardDrive, Wifi, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useAppStore } from "@/stores/useAppStore";
import { useSystemInfo } from "@/hooks/useSystemInfo";
import { formatMemory } from "@/lib/utils";
import type { GpuInfo, NetworkSettings, AllOptimizationResult } from "@/types";
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
        <span className="text-[9px] text-muted-foreground/50 mt-1 tracking-widest uppercase">score</span>
      </div>
    </div>
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
    <div className="flex-1 min-w-0 bg-[#05080c] border border-white/[0.08] rounded-xl px-4 py-3.5 flex items-center gap-3 card-glow transition-all">
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
  const { systemInfo, gameModeActive, freedMemoryMb } = useAppStore();
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [windowsOptimized, setWindowsOptimized] = useState(false);
  const [networkOptimized, setNetworkOptimized] = useState(false);
  const [powerOptimized, setPowerOptimized] = useState(false);
  const [allOptRunning, setAllOptRunning] = useState(false);
  const [allOptResult, setAllOptResult] = useState<AllOptimizationResult | null>(null);

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

  useEffect(() => {
    invoke<GpuInfo[]>("get_gpu_info").then(setGpuList).catch(console.error);
    refreshOptStates();
  }, []);

  const runAllOptimizations = async () => {
    if (allOptRunning) return;
    setAllOptRunning(true);
    setAllOptResult(null);
    try {
      const r = await invoke<AllOptimizationResult>("apply_all_optimizations");
      setAllOptResult(r);
      useAppStore.getState().setGameModeActive(true);
      useAppStore.getState().setFreedMemoryMb(r.process_freed_mb);
      refreshOptStates();
    } catch (e) {
      setAllOptResult({ process_killed: 0, process_freed_mb: 0, power_plan_set: false, windows_applied: false, network_applied: false, errors: [String(e)] });
    } finally {
      setAllOptRunning(false);
    }
  };

  const healthChecks: HealthCheck[] = [
    { label: "プロセス最適化", active: gameModeActive, page: "gamemode" },
    { label: "Windows 設定", active: windowsOptimized, page: "windows" },
    { label: "ネットワーク最適化", active: networkOptimized, page: "network" },
    { label: "パフォーマンス電源", active: powerOptimized, page: "gamemode" },
  ];
  const healthScore = healthChecks.filter((c) => c.active).length * 25;

  if (!systemInfo) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          <span className="text-sm">システム情報を取得中...</span>
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
          <h1 className="text-xl font-bold text-foreground tracking-tight">ダッシュボード</h1>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {systemInfo.os_name} · {systemInfo.os_version}
          </p>
        </div>
        {gameModeActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wide">ゲームモード ON</span>
          </div>
        )}
      </div>

      {/* Top strip — mini stat cards */}
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
            value={gpuFirst.vram_total_mb > 0 ? `${((gpuFirst.vram_used_mb / gpuFirst.vram_total_mb) * 100).toFixed(1)}%` : "—"}
            sub={gpuFirst.vram_total_mb > 0 ? `${formatMemory(gpuFirst.vram_total_mb)} VRAM` : gpuFirst.name}
            accent
          />
        )}
        <MiniStat
          icon={<Wifi size={14} />}
          label="Network"
          value={networkOptimized ? "最適化済み" : "通常"}
          sub={networkOptimized ? "DNS・TCP/IP最適化" : "未最適化"}
          accent={networkOptimized}
        />
      </div>

      {/* Health Score + CTA */}
      <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden card-glow">
        {/* Top accent bar */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-5">
            <HealthRing score={healthScore} />
            <div className="flex-1 flex flex-col gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">ゲーミング最適化スコア</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  {healthChecks.filter(c => c.active).length} / {healthChecks.length} 項目が有効
                </p>
              </div>
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
                <><Zap size={16} /> 今すぐ全最適化（プロセス・電源・Windows・ネットワーク）</>
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
                <p className="text-sm font-semibold text-emerald-400">全最適化完了</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pl-5">
                <span>プロセス停止: <span className="text-foreground font-medium">{allOptResult.process_killed}件 ({allOptResult.process_freed_mb.toFixed(0)} MB解放)</span></span>
                {allOptResult.power_plan_set && <span className="text-emerald-400">電源 ✓</span>}
                {allOptResult.windows_applied && <span className="text-emerald-400">Windows ✓</span>}
                {allOptResult.network_applied && <span className="text-emerald-400">ネットワーク ✓</span>}
                {allOptResult.errors.map((e, i) => (
                  <span key={i} className="text-amber-400">{e}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="CPU 使用率"
          value={systemInfo.cpu_usage}
          icon={cpuLogo ? <VendorIcon vendor={cpuLogo.vendor} className="w-3.5 h-3.5" /> : <Cpu size={14} />}
          subtitle={`${systemInfo.cpu_name} (${systemInfo.cpu_cores}コア)`}
        />
        <StatCard
          label="RAM 使用率"
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
      <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden card-glow">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="p-4">
          <h2 className="text-[10px] font-semibold text-muted-foreground/50 mb-3.5 uppercase tracking-widest">
            クイックアクション
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            <QuickActionButton
              icon={<Monitor size={16} />}
              label="ゲームモード"
              description="不要プロセス停止"
              onClick={() => useAppStore.getState().setActivePage("gamemode")}
              active={gameModeActive}
            />
            <QuickActionButton
              icon={<Zap size={16} />}
              label="Windows設定"
              description="視覚効果最適化"
              onClick={() => useAppStore.getState().setActivePage("windows")}
              active={windowsOptimized}
            />
            <QuickActionButton
              icon={<Wifi size={16} />}
              label="ネットワーク"
              description="DNS・TCP/IP最適化"
              onClick={() => useAppStore.getState().setActivePage("network")}
              active={networkOptimized}
            />
            <QuickActionButton
              icon={<HardDrive size={16} />}
              label="ストレージ"
              description="キャッシュ削除"
              onClick={() => useAppStore.getState().setActivePage("storage")}
            />
            <QuickActionButton
              icon={<Shield size={16} />}
              label="アップデート"
              description="アプリ・ドライバー"
              onClick={() => useAppStore.getState().setActivePage("updates")}
            />
            <QuickActionButton
              icon={<Cpu size={16} />}
              label="ハードウェア"
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
            <p className="text-sm font-semibold text-emerald-400">最適化完了</p>
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
        <span className="absolute top-1 right-1 text-[9px] text-muted-foreground/50 bg-white/5 px-1 rounded">
          {disabledLabel}
        </span>
      )}
      {active && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
      )}
    </button>
  );
}
