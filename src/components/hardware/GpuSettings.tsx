import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, AlertTriangle, RotateCcw, Zap, Fan } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { GpuStatus, GpuPowerLimit } from "@/types";

export function GpuSettings() {
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [powerInfo, setPowerInfo] = useState<GpuPowerLimit | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const [pendingWatts, setPendingWatts] = useState<number>(0);
  const [settingPower, setSettingPower] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [fanAuto, setFanAuto] = useState(true);
  const [fanPercent, setFanPercent] = useState(50);
  const [settingFan, setSettingFan] = useState(false);

  const loadData = async () => {
    try {
      const [gpus, power] = await Promise.all([
        invoke<GpuStatus[]>("get_gpu_status"),
        invoke<GpuPowerLimit>("get_gpu_power_info"),
      ]);
      const first = gpus[0] ?? null;
      setGpuStatus(first);
      setPowerInfo(power);
      setPendingWatts(power.current_w);
      if (first) {
        setFanPercent(first.fan_speed_percent > 0 ? first.fan_speed_percent : 50);
      }
      setNotAvailable(false);
    } catch {
      setNotAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSetPower = async () => {
    if (!powerInfo || settingPower) return;
    setSettingPower(true);
    try {
      await invoke("set_gpu_power_limit", { gpuIndex: 0, watts: pendingWatts });
      toast.success(`電力制限を ${pendingWatts}W に設定しました`);
      await loadData();
    } catch (e) {
      toast.error("電力制限の設定に失敗しました: " + String(e));
    } finally {
      setSettingPower(false);
    }
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await invoke("reset_gpu_power_limit");
      toast.success("電力制限をデフォルトに戻しました");
      await loadData();
    } catch (e) {
      toast.error("リセットに失敗しました: " + String(e));
    } finally {
      setResetting(false);
    }
  };

  const handleFanApply = async () => {
    if (settingFan) return;
    setSettingFan(true);
    try {
      if (fanAuto) {
        await invoke("set_gpu_fan_speed", { percent: null });
        toast.success("ファン速度を自動モードに設定しました");
      } else {
        await invoke("set_gpu_fan_speed", { percent: fanPercent });
        toast.success(`ファン速度を ${fanPercent}% に設定しました`);
      }
    } catch (e) {
      toast.error("ファン設定に失敗しました: " + String(e));
    } finally {
      setSettingFan(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          <span className="text-sm">GPU情報を取得中...</span>
        </div>
      </div>
    );
  }

  if (notAvailable) {
    return (
      <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">GPU設定管理</h1>
          <p className="text-xs text-muted-foreground/60 mt-0.5">電力制限・ファン速度の制御</p>
        </div>
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle size={32} className="text-amber-400" />
          <p className="text-sm font-semibold text-amber-300">GPU設定はNVIDIA GPUのみ対応</p>
          <p className="text-xs text-muted-foreground/60 max-w-sm">
            nvidia-smiが見つかりませんでした。NVIDIA GPU搭載のPCでのみご利用いただけます。
          </p>
        </div>
      </div>
    );
  }

  const minW = powerInfo?.min_w ?? 0;
  const maxW = powerInfo?.max_w ?? 300;
  const defaultW = powerInfo?.default_w ?? 0;

  // Preset watts
  const presets = [
    { label: "省電力 (80%)", watts: Math.round(defaultW * 0.8) },
    { label: "標準", watts: defaultW },
    { label: "最大パフォーマンス (120%)", watts: Math.min(Math.round(defaultW * 1.2), maxW) },
  ];

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">GPU設定管理</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">電力制限・ファン速度の制御</p>
      </div>

      {/* GPU info card */}
      {gpuStatus && (
        <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
          <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
          <div className="p-4 flex flex-wrap gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">GPU</p>
              <p className="text-sm font-bold text-white">{gpuStatus.name}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">ドライバー</p>
              <p className="text-sm font-bold text-white">{gpuStatus.driver_version}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">現在の電力</p>
              <p className="text-sm font-bold text-cyan-400">{gpuStatus.power_draw_w.toFixed(0)}W</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">温度</p>
              <p className="text-sm font-bold text-amber-400">{gpuStatus.temperature_c}°C</p>
            </div>
          </div>
        </div>
      )}

      {/* Power limit */}
      {powerInfo && (
        <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
          <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-cyan-400" />
                <p className="text-[13px] font-semibold text-foreground">電力制限</p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.04]"
              >
                {resetting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                デフォルトに戻す
              </button>
            </div>

            {/* Slider */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-2xl font-bold text-white tabular-nums">{pendingWatts}W</span>
                <span className="text-[10px] text-muted-foreground/50">
                  範囲: {minW}W – {maxW}W / デフォルト: {defaultW}W
                </span>
              </div>
              <input
                type="range"
                min={minW}
                max={maxW}
                step={5}
                value={pendingWatts}
                onChange={(e) => setPendingWatts(Number(e.target.value))}
                className="w-full h-2 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Presets */}
            <div className="flex gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPendingWatts(p.watts)}
                  className={cn(
                    "flex-1 py-2 px-2 rounded-lg text-[11px] font-medium border transition-all text-center",
                    pendingWatts === p.watts
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "border-white/[0.07] text-muted-foreground/70 hover:bg-white/[0.04]"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleSetPower}
              disabled={settingPower || pendingWatts === powerInfo.current_w}
              className={cn(
                "w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                settingPower || pendingWatts === powerInfo.current_w
                  ? "bg-white/[0.04] text-muted-foreground/55 cursor-not-allowed border border-white/[0.06]"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97]"
              )}
            >
              {settingPower ? <Loader2 size={14} className="animate-spin" /> : null}
              {settingPower ? "設定中..." : "電力制限を適用"}
            </button>
          </div>
        </div>
      )}

      {/* Fan speed */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fan size={14} className="text-cyan-400" />
              <p className="text-[13px] font-semibold text-foreground">ファン速度</p>
            </div>
            {/* Auto toggle */}
            <button
              type="button"
              onClick={() => setFanAuto(!fanAuto)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
                fanAuto
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                  : "border-white/[0.07] text-muted-foreground/60 hover:bg-white/[0.04]"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", fanAuto ? "bg-cyan-400" : "bg-white/20")} />
              自動
            </button>
          </div>

          {!fanAuto && (
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-2xl font-bold text-white tabular-nums">{fanPercent}%</span>
                <span className="text-[10px] text-muted-foreground/50">手動設定</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={fanPercent}
                onChange={(e) => setFanPercent(Number(e.target.value))}
                className="w-full h-2 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleFanApply}
            disabled={settingFan}
            className={cn(
              "w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
              settingFan
                ? "bg-white/[0.04] text-muted-foreground/55 cursor-not-allowed border border-white/[0.06]"
                : "bg-white/[0.06] border border-white/[0.09] text-slate-200 hover:bg-white/[0.09] active:scale-[0.97]"
            )}
          >
            {settingFan ? <Loader2 size={14} className="animate-spin" /> : null}
            {settingFan ? "設定中..." : "ファン設定を適用"}
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/20 rounded-xl p-3.5">
        <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-red-300/70 leading-relaxed">
          GPU設定の変更はリスクを伴います。自己責任でご使用ください。
          過度な電力設定はハードウェアの損傷を引き起こす可能性があります。
        </p>
      </div>
    </div>
  );
}
