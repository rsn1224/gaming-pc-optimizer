import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, MemoryStick, Zap, Monitor, MonitorCheck, Shield, HardDrive, Wifi, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useAppStore } from "@/stores/useAppStore";
import { useSystemInfo } from "@/hooks/useSystemInfo";
import { formatMemory } from "@/lib/utils";
import type { GpuInfo, NetworkSettings, AllOptimizationResult } from "@/types";

// ── Health Score ─────────────────────────────────────────────────────────────

interface HealthCheck {
  label: string;
  active: boolean;
  page: string;
}

function HealthRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const colorClass =
    score >= 75 ? "text-cyan-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke="currentColor" strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className={`${colorClass} [transition:stroke-dasharray_0.8s_ease]`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold leading-none ${colorClass}`}>{score}</span>
        <span className="text-[9px] text-muted-foreground mt-0.5">/ 100</span>
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
        <div className="text-muted-foreground animate-pulse">システム情報を取得中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {systemInfo.os_name} {systemInfo.os_version}
          </p>
        </div>
        {gameModeActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium text-green-400">ゲームモード ON</span>
          </div>
        )}
      </div>

      {/* Health Score */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-4">
        <div className="flex items-center gap-6">
          <HealthRing score={healthScore} />
          <div className="flex-1 flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">ゲーミング最適化スコア</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {healthChecks.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => useAppStore.getState().setActivePage(c.page as never)}
                  className="flex items-center gap-2 text-xs group text-left"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 transition-colors ${c.active ? "bg-green-400" : "bg-border"}`} />
                  <span className={c.active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground transition-colors"}>
                    {c.label}
                  </span>
                  {!c.active && (
                    <ChevronRight size={10} className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
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
            className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all border
              ${allOptRunning
                ? "bg-primary/20 text-primary/60 cursor-not-allowed border-primary/20"
                : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] glow-cyan border-primary/20"
              }`}
          >
            {allOptRunning ? (
              <><Loader2 size={18} className="animate-spin" /> 全最適化実行中...</>
            ) : (
              <><Zap size={18} /> 今すぐ全最適化（プロセス・電源・Windows・ネットワーク）</>
            )}
          </button>
        )}

        {/* Result banner */}
        {allOptResult && (
          <div className={`rounded-lg px-4 py-3 flex flex-col gap-1.5 border ${allOptResult.errors.length > 0 && allOptResult.process_killed === 0 ? "bg-destructive/10 border-destructive/30" : "bg-green-500/10 border-green-500/30"}`}>
            <div className="flex items-center gap-2">
              {allOptResult.errors.length === 0 ? (
                <CheckCircle2 size={15} className="text-green-400 shrink-0" />
              ) : (
                <XCircle size={15} className="text-amber-400 shrink-0" />
              )}
              <p className="text-sm font-medium text-green-400">全最適化完了</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pl-5">
              <span>プロセス停止: <span className="text-foreground">{allOptResult.process_killed}件 ({allOptResult.process_freed_mb.toFixed(0)} MB解放)</span></span>
              {allOptResult.power_plan_set && <span className="text-foreground">電源✓</span>}
              {allOptResult.windows_applied && <span className="text-foreground">Windows✓</span>}
              {allOptResult.network_applied && <span className="text-foreground">ネットワーク✓</span>}
              {allOptResult.errors.map((e, i) => (
                <span key={i} className="text-amber-400">{e}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* System Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="CPU 使用率"
          value={systemInfo.cpu_usage}
          icon={<Cpu size={16} />}
          subtitle={`${systemInfo.cpu_name} (${systemInfo.cpu_cores}コア)`}
        />
        <StatCard
          label="RAM 使用率"
          value={systemInfo.memory_percent}
          icon={<MemoryStick size={16} />}
          subtitle={`${formatMemory(systemInfo.memory_used_mb)} / ${formatMemory(systemInfo.memory_total_mb)}`}
        />
        {gpuList.map((gpu, i) => (
          <StatCard
            key={i}
            label="GPU"
            value={gpu.vram_used_mb > 0 ? (gpu.vram_used_mb / gpu.vram_total_mb) * 100 : 0}
            icon={<MonitorCheck size={16} />}
            subtitle={gpu.vram_total_mb > 0
              ? `${gpu.name} · ${formatMemory(gpu.vram_total_mb)} VRAM`
              : gpu.name}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          クイックアクション
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <QuickActionButton
            icon={<Monitor size={20} />}
            label="ゲームモード"
            description="不要プロセス停止"
            onClick={() => useAppStore.getState().setActivePage("gamemode")}
            active={gameModeActive}
          />
          <QuickActionButton
            icon={<Zap size={20} />}
            label="Windows設定"
            description="視覚効果最適化"
            onClick={() => useAppStore.getState().setActivePage("windows")}
            active={windowsOptimized}
          />
          <QuickActionButton
            icon={<Wifi size={20} />}
            label="ネットワーク"
            description="DNS・TCP/IP最適化"
            onClick={() => useAppStore.getState().setActivePage("network")}
            active={networkOptimized}
          />
          <QuickActionButton
            icon={<HardDrive size={20} />}
            label="ストレージ"
            description="キャッシュ削除"
            onClick={() => useAppStore.getState().setActivePage("storage")}
          />
          <QuickActionButton
            icon={<Shield size={20} />}
            label="アップデート"
            description="アプリ・ドライバー"
            onClick={() => useAppStore.getState().setActivePage("updates")}
          />
          <QuickActionButton
            icon={<Cpu size={20} />}
            label="ハードウェア"
            description="GPU電力制御"
            onClick={() => useAppStore.getState().setActivePage("hardware")}
          />
        </div>
      </div>

      {/* Last Optimization Result */}
      {freedMemoryMb > 0 && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 flex items-center gap-3">
          <span className="text-green-400 text-xl">✓</span>
          <div>
            <p className="text-sm font-medium text-green-400">最適化完了</p>
            <p className="text-xs text-muted-foreground">
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
        relative flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center
        ${disabled
          ? "border-border/50 opacity-40 cursor-not-allowed"
          : active
          ? "border-green-500/40 bg-green-500/10 hover:bg-green-500/20"
          : "border-border hover:border-cyan-500/40 hover:bg-cyan-500/5 cursor-pointer"
        }
      `}
    >
      <span className={active ? "text-green-400" : "text-cyan-400"}>{icon}</span>
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      {disabled && disabledLabel && (
        <span className="absolute top-1 right-1 text-[9px] text-muted-foreground/60 bg-secondary px-1 rounded">
          {disabledLabel}
        </span>
      )}
    </button>
  );
}
