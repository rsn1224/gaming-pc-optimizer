import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  RefreshCw,
  Sparkles,
  Thermometer,
  Zap,
  Activity,
  MemoryStick,
  Loader2,
  Wind,
  CheckCircle2,
} from "lucide-react";
import type { GpuStatus, AiHardwareMode } from "@/types";

// ── Mode config ───────────────────────────────────────────────────────────────

const MODE_CONFIG = {
  performance: {
    label: "パフォーマンス",
    desc: "ゲーミング・高負荷作業向け（電力制限なし）",
    powerRatio: 1.0,
    cls: "bg-red-500/10 border-red-500/40 text-red-400",
    activeCls: "bg-red-500/20 border-red-500/60 text-red-300",
  },
  balanced: {
    label: "バランス",
    desc: "日常使用向け（デフォルト比 -20%）",
    powerRatio: 0.8,
    cls: "bg-green-500/10 border-green-500/40 text-green-400",
    activeCls: "bg-green-500/20 border-green-500/60 text-green-300",
  },
  efficiency: {
    label: "省電力",
    desc: "発熱抑制・省エネ優先（デフォルト比 -35%）",
    powerRatio: 0.65,
    cls: "bg-blue-500/10 border-blue-500/40 text-blue-400",
    activeCls: "bg-blue-500/20 border-blue-500/60 text-blue-300",
  },
} as const;

type GpuMode = keyof typeof MODE_CONFIG;

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({
  icon,
  label,
  value,
  unit,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold ${warn ? "text-amber-400" : "text-foreground"}`}>
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// ── GPU card ──────────────────────────────────────────────────────────────────

function GpuCard({
  gpu,
  index,
  appliedMode,
  applying,
  onApplyMode,
}: {
  gpu: GpuStatus;
  index: number;
  appliedMode: GpuMode | null;
  applying: boolean;
  onApplyMode: (mode: GpuMode) => void;
}) {
  const vramPct = gpu.vram_total_mb > 0 ? (gpu.vram_used_mb / gpu.vram_total_mb) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      {/* GPU name */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="p-1.5 bg-secondary border border-border rounded-md">
          <Cpu size={16} className="text-cyan-400" />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">{gpu.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">Driver {gpu.driver_version} · GPU #{index}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCell
          icon={<Activity size={13} />}
          label="GPU使用率"
          value={gpu.utilization_percent}
          unit="%"
          warn={gpu.utilization_percent > 95}
        />
        <StatCell
          icon={<Thermometer size={13} />}
          label="温度"
          value={gpu.temperature_c}
          unit="°C"
          warn={gpu.temperature_c > 83}
        />
        <StatCell
          icon={<Zap size={13} />}
          label="消費電力"
          value={gpu.power_draw_w.toFixed(0)}
          unit="W"
        />
        <StatCell
          icon={<MemoryStick size={13} />}
          label="VRAM"
          value={`${(gpu.vram_used_mb / 1024).toFixed(1)} / ${(gpu.vram_total_mb / 1024).toFixed(1)}`}
          unit="GB"
          warn={vramPct > 90}
        />
        <StatCell
          icon={<Wind size={13} />}
          label="ファン"
          value={gpu.fan_speed_percent === 0 ? "—" : gpu.fan_speed_percent}
          unit={gpu.fan_speed_percent === 0 ? undefined : "%"}
        />
        <StatCell
          icon={<Zap size={13} />}
          label="電力上限"
          value={gpu.power_limit_w.toFixed(0)}
          unit={`/ ${gpu.power_limit_default_w.toFixed(0)}W`}
        />
      </div>

      {/* VRAM progress bar */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>VRAM使用率</span>
          <span>{vramPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${vramPct > 90 ? "bg-red-500" : vramPct > 70 ? "bg-amber-400" : "bg-cyan-500"}`}
            style={{ width: `${vramPct}%` }}
          />
        </div>
      </div>

      {/* Mode buttons */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground font-medium">電力モード</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(MODE_CONFIG) as [GpuMode, (typeof MODE_CONFIG)[GpuMode]][]).map(
            ([mode, cfg]) => {
              const isActive = appliedMode === mode;
              const watts =
                gpu.power_limit_default_w > 0
                  ? Math.round(gpu.power_limit_default_w * cfg.powerRatio)
                  : null;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onApplyMode(mode)}
                  disabled={applying}
                  title={cfg.desc}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    isActive ? cfg.activeCls : cfg.cls
                  } hover:opacity-90`}
                >
                  {isActive && <CheckCircle2 size={12} className="shrink-0" />}
                  <span>{cfg.label}</span>
                  {watts !== null && (
                    <span className="text-[10px] opacity-70">{watts}W</span>
                  )}
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Hardware() {
  const [gpus, setGpus]               = useState<GpuStatus[]>([]);
  const [gpuError, setGpuError]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const [aiResult, setAiResult]       = useState<AiHardwareMode | null>(null);
  const [loadingAi, setLoadingAi]     = useState(false);
  const [aiLog, setAiLog]             = useState<{ msg: string; ok: boolean } | null>(null);

  // Per-GPU applied mode and applying state
  const [appliedModes, setAppliedModes]  = useState<Record<number, GpuMode>>({});
  const [applyingIdx, setApplyingIdx]    = useState<number | null>(null);
  const [applyLog, setApplyLog]          = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!aiLog) return;
    const t = setTimeout(() => setAiLog(null), 6000);
    return () => clearTimeout(t);
  }, [aiLog]);

  useEffect(() => {
    if (!applyLog) return;
    const t = setTimeout(() => setApplyLog(null), 5000);
    return () => clearTimeout(t);
  }, [applyLog]);

  const fetchGpus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setGpuError(null);
    try {
      const result = await invoke<GpuStatus[]>("get_gpu_status");
      setGpus(result);
    } catch (e) {
      setGpuError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchGpus(); }, [fetchGpus]);

  const handleAiRecommend = async () => {
    setLoadingAi(true);
    setAiLog(null);
    try {
      const result = await invoke<AiHardwareMode>("get_ai_hardware_mode");
      setAiResult(result);
      setAiLog({
        msg: `AI推奨: ${MODE_CONFIG[result.mode as GpuMode]?.label ?? result.mode} — ${result.reason}（推奨電力比: ${result.suggested_power_limit_percent.toFixed(2)}）`,
        ok: true,
      });
    } catch (e) {
      setAiLog({ msg: String(e), ok: false });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleApplyMode = async (gpuIndex: number, mode: GpuMode) => {
    const gpu = gpus[gpuIndex];
    if (!gpu) return;

    const defaultW = gpu.power_limit_default_w;
    if (defaultW <= 0) {
      setApplyLog({ msg: "このGPUのデフォルト電力情報がありません", ok: false });
      return;
    }

    const watts = Math.round(defaultW * MODE_CONFIG[mode].powerRatio);
    setApplyingIdx(gpuIndex);
    setApplyLog(null);
    try {
      await invoke("set_gpu_power_limit", { gpuIndex, watts });
      setAppliedModes((prev) => ({ ...prev, [gpuIndex]: mode }));
      setApplyLog({
        msg: `GPU #${gpuIndex} を${MODE_CONFIG[mode].label}モード（${watts}W）に設定しました`,
        ok: true,
      });
      // Refresh stats
      setTimeout(() => fetchGpus(true), 1500);
    } catch (e) {
      setApplyLog({ msg: String(e), ok: false });
    } finally {
      setApplyingIdx(null);
    }
  };

  return (
    <div className="p-6 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-secondary border border-border rounded-lg">
            <Cpu className="text-muted-foreground" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ハードウェア</h1>
            <p className="text-sm text-muted-foreground">GPU状態モニタリングと電力最適化</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchGpus(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors text-muted-foreground"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            更新
          </button>

          <button
            type="button"
            onClick={handleAiRecommend}
            disabled={loadingAi || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
          >
            {loadingAi ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            AIモード推奨
          </button>
        </div>
      </div>

      {/* AI recommendation banner */}
      {aiResult && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-3 flex items-start gap-3">
          <Sparkles size={16} className="text-purple-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-purple-300">
              AI推奨モード: {MODE_CONFIG[aiResult.mode as GpuMode]?.label ?? aiResult.mode}
              <span className="ml-2 text-[11px] font-normal opacity-70">
                推奨電力比: {aiResult.suggested_power_limit_percent.toFixed(2)}（参考値）
              </span>
            </p>
            <p className="text-xs text-purple-400/80 mt-0.5">{aiResult.reason}</p>
          </div>
          {gpus.length > 0 && (
            <button
              type="button"
              onClick={() => handleApplyMode(0, aiResult.mode as GpuMode)}
              disabled={applyingIdx !== null}
              className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
            >
              GPU #0 に適用
            </button>
          )}
        </div>
      )}

      {/* AI / apply logs */}
      {aiLog && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${aiLog.ok ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {aiLog.msg}
        </div>
      )}
      {applyLog && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${applyLog.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {applyLog.msg}
        </div>
      )}

      {/* GPU cards */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">GPU情報を取得中…</span>
        </div>
      ) : gpuError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <Cpu size={40} strokeWidth={1} />
          <p className="text-sm text-center max-w-sm">{gpuError}</p>
          <p className="text-xs text-muted-foreground/60 text-center">
            NVIDIA GPU搭載PCでのみ詳細情報が取得できます
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {gpus.map((gpu, i) => (
            <GpuCard
              key={i}
              gpu={gpu}
              index={i}
              appliedMode={appliedModes[i] ?? null}
              applying={applyingIdx === i}
              onApplyMode={(mode) => handleApplyMode(i, mode)}
            />
          ))}
        </div>
      )}

      {/* Note about admin */}
      {gpus.length > 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center">
          電力制限の変更には管理者権限が必要な場合があります
        </p>
      )}
    </div>
  );
}
