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
  Server,
  Layers,
} from "lucide-react";
import type { GpuStatus, AiHardwareMode, MotherboardInfo, CpuDetailedInfo } from "@/types";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { getGpuVendorLogo, getCpuVendorLogo, VENDOR_ICON_BOX, DEFAULT_ICON_BOX, detectMbVendor, MB_VENDOR_CONFIG } from "@/lib/hardwareIcons";
import { VendorIcon, MbVendorIcon } from "@/lib/VendorIcon";

// ── Brand detection ───────────────────────────────────────────────────────────

function detectBrand(name: string): "nvidia" | "amd" | "intel" | "unknown" {
  const n = name.toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("quadro") || n.includes("rtx") || n.includes("gtx")) return "nvidia";
  if (n.includes("amd") || n.includes("radeon") || n.includes("rx ") || n.includes("vega")) return "amd";
  if (n.includes("intel") || n.includes("arc ") || n.includes("uhd") || n.includes("iris")) return "intel";
  return "unknown";
}

const BRAND_CONFIG = {
  nvidia: { label: "NVIDIA", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  amd:    { label: "AMD",    cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  intel:  { label: "Intel",  cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  unknown:{ label: "",       cls: "" },
} as const;

function BrandBadge({ name }: { name: string }) {
  const brand = detectBrand(name);
  if (brand === "unknown") return null;
  const { label, cls } = BRAND_CONFIG[brand];
  return (
    <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

// ── Mode config ───────────────────────────────────────────────────────────────

const MODE_CONFIG = {
  performance: {
    label: "パフォーマンス",
    desc: "ゲーミング・高負荷作業向け（電力制限なし）",
    powerRatio: 1.0,
    cls: "bg-red-500/10 border-red-500/30 text-red-400",
    activeCls: "bg-red-500/20 border-red-500/50 text-red-300 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]",
  },
  balanced: {
    label: "バランス",
    desc: "日常使用向け（デフォルト比 -20%）",
    powerRatio: 0.8,
    cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    activeCls: "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_0_1px_rgba(34,197,94,0.25)]",
  },
  efficiency: {
    label: "省電力",
    desc: "発熱抑制・省エネ優先（デフォルト比 -35%）",
    powerRatio: 0.65,
    cls: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    activeCls: "bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]",
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
    <div className="flex flex-col gap-1.5 p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
      <div className="flex items-center gap-1.5 text-muted-foreground/60">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${warn ? "text-amber-400" : "text-foreground"}`}>
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground/50 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// ── GPU card ──────────────────────────────────────────────────────────────────

function GpuCard({
  gpu,
  index,
  appliedMode,
  aiRecommendedMode,
  applying,
  onApplyMode,
}: {
  gpu: GpuStatus;
  index: number;
  appliedMode: GpuMode | null;
  aiRecommendedMode?: GpuMode | null;
  applying: boolean;
  onApplyMode: (mode: GpuMode) => void;
}) {
  const vramPct = gpu.vram_total_mb > 0 ? (gpu.vram_used_mb / gpu.vram_total_mb) * 100 : 0;
  const gpuLogo = getGpuVendorLogo(gpu.name);
  const iconBoxCls = gpuLogo ? VENDOR_ICON_BOX[gpuLogo.vendor] : DEFAULT_ICON_BOX;

  return (
    <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col card-glow">
      {/* Top accent line */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      <div className="p-5 flex flex-col gap-4">
        {/* GPU name */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border ${iconBoxCls}`}>
            {gpuLogo ? (
              <VendorIcon vendor={gpuLogo.vendor} className="w-4 h-4" />
            ) : (
              <Cpu size={16} className="text-cyan-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm leading-tight truncate">{gpu.name}</p>
              <BrandBadge name={gpu.name} />
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
              Driver {gpu.driver_version} · GPU #{index}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCell
            icon={<Activity size={12} />}
            label="GPU使用率"
            value={gpu.utilization_percent}
            unit="%"
            warn={gpu.utilization_percent > 95}
          />
          <StatCell
            icon={<Thermometer size={12} />}
            label="温度"
            value={gpu.temperature_c}
            unit="°C"
            warn={gpu.temperature_c > 83}
          />
          <StatCell
            icon={<Zap size={12} />}
            label="消費電力"
            value={gpu.power_draw_w.toFixed(0)}
            unit="W"
          />
          <StatCell
            icon={<MemoryStick size={12} />}
            label="VRAM"
            value={`${(gpu.vram_used_mb / 1024).toFixed(1)} / ${(gpu.vram_total_mb / 1024).toFixed(1)}`}
            unit="GB"
            warn={vramPct > 90}
          />
          <StatCell
            icon={<Wind size={12} />}
            label="ファン"
            value={gpu.fan_speed_percent === 0 ? "—" : gpu.fan_speed_percent}
            unit={gpu.fan_speed_percent === 0 ? undefined : "%"}
          />
          <StatCell
            icon={<Zap size={12} />}
            label="電力上限"
            value={gpu.power_limit_w.toFixed(0)}
            unit={`/ ${gpu.power_limit_default_w.toFixed(0)}W`}
          />
        </div>

        {/* VRAM progress bar */}
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground/50 mb-1.5 uppercase tracking-wider">
            <span>VRAM使用率</span>
          </div>
          <ProgressBar value={vramPct} colorByValue showLabel />
        </div>

        {/* Mode buttons */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-widest">電力モード</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(MODE_CONFIG) as [GpuMode, (typeof MODE_CONFIG)[GpuMode]][]).map(
              ([mode, cfg]) => {
                const isActive = appliedMode === mode;
                const isAiRec = aiRecommendedMode === mode;
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
                    className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition-all disabled:opacity-40 ${
                      isActive ? cfg.activeCls : cfg.cls
                    } hover:opacity-90 active:scale-[0.97]`}
                  >
                    {isAiRec && !isActive && (
                      <span className="absolute -top-2 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/30 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.3)]">
                        AI
                      </span>
                    )}
                    {isActive && <CheckCircle2 size={12} className="shrink-0" />}
                    <span className="leading-tight">{cfg.label}</span>
                    {watts !== null && (
                      <span className="text-[10px] opacity-60 tabular-nums">{watts}W</span>
                    )}
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CPU info card ─────────────────────────────────────────────────────────────

function CpuInfoCard({ info }: { info: CpuDetailedInfo }) {
  const clockGhz = info.max_clock_mhz > 0 ? (info.max_clock_mhz / 1000).toFixed(2) : "—";
  const cpuLogo = getCpuVendorLogo(`${info.name} ${info.manufacturer}`);
  const iconBoxCls = cpuLogo ? VENDOR_ICON_BOX[cpuLogo.vendor] : DEFAULT_ICON_BOX;
  return (
    <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden card-glow">
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border ${iconBoxCls}`}>
            {cpuLogo ? (
              <VendorIcon vendor={cpuLogo.vendor} className="w-4 h-4" />
            ) : (
              <Cpu size={16} className="text-cyan-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm leading-tight truncate">{info.name || "不明"}</p>
              <BrandBadge name={`${info.name} ${info.manufacturer}`} />
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
              {info.manufacturer} · {info.socket} · {info.architecture}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCell icon={<Cpu size={12} />} label="物理コア" value={info.cores || "—"} />
          <StatCell icon={<Activity size={12} />} label="論理プロセッサ" value={info.logical_processors || "—"} />
          <StatCell icon={<Zap size={12} />} label="最大クロック" value={clockGhz} unit="GHz" />
          <StatCell icon={<Layers size={12} />} label="L2キャッシュ" value={info.l2_cache_kb > 0 ? `${info.l2_cache_kb}` : "—"} unit={info.l2_cache_kb > 0 ? "KB" : undefined} />
          <StatCell icon={<Layers size={12} />} label="L3キャッシュ" value={info.l3_cache_kb > 0 ? `${(info.l3_cache_kb / 1024).toFixed(1)}` : "—"} unit={info.l3_cache_kb > 0 ? "MB" : undefined} />
          <StatCell icon={<Server size={12} />} label="ソケット" value={info.socket || "—"} />
        </div>
      </div>
    </div>
  );
}

// ── MB info card ──────────────────────────────────────────────────────────────

function MbInfoCard({ info }: { info: MotherboardInfo }) {
  const mbVendor = detectMbVendor(info.manufacturer);
  const mbCfg = mbVendor ? MB_VENDOR_CONFIG[mbVendor] : null;

  return (
    <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden card-glow">
      <div className="h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border ${mbCfg ? `${mbCfg.box} shadow-[0_0_10px_rgba(0,0,0,0.15)]` : "bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border-emerald-500/25 shadow-[0_0_10px_rgba(34,197,94,0.1)]"}`}>
            {mbVendor ? (
              <MbVendorIcon vendor={mbVendor} className="w-4 h-4" />
            ) : (
              <Server size={16} className="text-emerald-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm leading-tight">{info.product || "不明"}</p>
              {mbCfg && (
                <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 ${mbCfg.box} ${mbCfg.text}`}>
                  {mbCfg.label}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
              {info.manufacturer}{info.version ? ` · Rev ${info.version}` : ""}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCell icon={<Server size={12} />} label="メーカー" value={info.manufacturer || "—"} />
          <StatCell icon={<Layers size={12} />} label="リビジョン" value={info.version || "—"} />
        </div>
        {info.serial_number && info.serial_number.toLowerCase() !== "to be filled by o.e.m." && (
          <p className="text-[10px] text-muted-foreground/30 font-mono">S/N: {info.serial_number}</p>
        )}
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

  const [cpuInfo, setCpuInfo]         = useState<CpuDetailedInfo | null>(null);
  const [mbInfo, setMbInfo]           = useState<MotherboardInfo | null>(null);

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

  useEffect(() => {
    invoke<CpuDetailedInfo>("get_cpu_detailed_info")
      .then(setCpuInfo)
      .catch(() => {});
    invoke<MotherboardInfo>("get_motherboard_info")
      .then(setMbInfo)
      .catch(() => {});
  }, []);

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
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <Cpu className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ハードウェア</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">CPU・マザーボード・GPU状態モニタリングと電力最適化</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchGpus(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm font-medium hover:bg-white/[0.08] hover:text-foreground disabled:opacity-50 transition-colors text-muted-foreground"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            更新
          </button>

          <button
            type="button"
            onClick={handleAiRecommend}
            disabled={loadingAi || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-all hover:shadow-[0_0_12px_rgba(168,85,247,0.2)]"
          >
            {loadingAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AIモード推奨
          </button>
        </div>
      </div>

      {/* AI recommendation banner */}
      {aiResult && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/8 px-4 py-3.5 flex items-start gap-3 shadow-[0_0_0_1px_rgba(168,85,247,0.1)]">
          <div className="p-1.5 bg-purple-500/15 rounded-lg border border-purple-500/25 shrink-0 mt-0.5">
            <Sparkles size={14} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-purple-300">
                AI推奨モード: {MODE_CONFIG[aiResult.mode as GpuMode]?.label ?? aiResult.mode}
              </p>
              {aiResult.confidence > 0 && <ConfidenceBadge confidence={aiResult.confidence} />}
              <span className="text-[11px] text-purple-400/50">
                推奨電力比: {aiResult.suggested_power_limit_percent.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-purple-400/70 mt-0.5">{aiResult.reason}</p>
          </div>
          {gpus.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                for (let i = 0; i < gpus.length; i++) {
                  await handleApplyMode(i, aiResult.mode as GpuMode);
                }
              }}
              disabled={applyingIdx !== null}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 transition-all active:scale-[0.97]"
            >
              {gpus.length > 1 ? "全GPUに適用" : "適用"}
            </button>
          )}
        </div>
      )}

      {/* AI / apply logs */}
      {aiLog && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${aiLog.ok ? "bg-purple-500/8 border-purple-500/25 text-purple-400" : "bg-red-500/8 border-red-500/25 text-red-400"}`}>
          {aiLog.msg}
        </div>
      )}
      {applyLog && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${applyLog.ok ? "bg-emerald-500/8 border-emerald-500/25 text-emerald-400" : "bg-red-500/8 border-red-500/25 text-red-400"}`}>
          {applyLog.msg}
        </div>
      )}

      {/* CPU + MB info */}
      {(cpuInfo || mbInfo) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cpuInfo && <CpuInfoCard info={cpuInfo} />}
          {mbInfo && <MbInfoCard info={mbInfo} />}
        </div>
      )}

      {/* GPU section label */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium">GPU</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* GPU cards */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin text-cyan-400" />
          <span className="text-sm">GPU情報を取得中…</span>
        </div>
      ) : gpuError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
            <Cpu size={36} strokeWidth={1} className="text-muted-foreground/30" />
          </div>
          <p className="text-sm text-center max-w-sm">{gpuError}</p>
          <p className="text-xs text-muted-foreground/40 text-center">
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
              aiRecommendedMode={aiResult ? (aiResult.mode as GpuMode) : null}
              applying={applyingIdx === i}
              onApplyMode={(mode) => handleApplyMode(i, mode)}
            />
          ))}
        </div>
      )}

      {/* Note about admin */}
      {gpus.length > 0 && (
        <p className="text-[11px] text-muted-foreground/30 text-center">
          電力制限の変更には管理者権限が必要な場合があります
        </p>
      )}
    </div>
  );
}
