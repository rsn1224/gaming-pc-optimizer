import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SystemInfo, BandwidthSnapshot, GpuStatus, FpsEstimate } from "@/types";

interface OsdData {
  cpuPercent: number;
  ramPercent: number;
  gpuTemp: number;
  fps: number;
  downloadKbps: number;
  uploadKbps: number;
}

export function OsdOverlay() {
  const [data, setData] = useState<OsdData>({
    cpuPercent: 0,
    ramPercent: 0,
    gpuTemp: 0,
    fps: 0,
    downloadKbps: 0,
    uploadKbps: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [sysInfo, gpu, fps, bw] = await Promise.allSettled([
          invoke<SystemInfo>("get_system_info"),
          invoke<GpuStatus>("get_gpu_status"),
          invoke<FpsEstimate>("get_fps_estimate"),
          invoke<BandwidthSnapshot>("get_bandwidth_snapshot"),
        ]);

        if (cancelled) return;

        setData({
          cpuPercent:
            sysInfo.status === "fulfilled" ? sysInfo.value.cpu_usage : 0,
          ramPercent:
            sysInfo.status === "fulfilled"
              ? sysInfo.value.memory_percent
              : 0,
          gpuTemp:
            gpu.status === "fulfilled" ? gpu.value.temperature_c : 0,
          fps:
            fps.status === "fulfilled" ? fps.value.estimated_fps : 0,
          downloadKbps:
            bw.status === "fulfilled" ? bw.value.download_kbps : 0,
          uploadKbps:
            bw.status === "fulfilled" ? bw.value.upload_kbps : 0,
        });
      } catch {
        // silently ignore
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleMouseDown = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  };

  const fmt = (n: number, digits = 0) => n.toFixed(digits);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-[220px] h-[140px] rounded-xl border border-white/10 backdrop-blur-md bg-black/60 p-3 select-none cursor-move"
    >
      <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
        Gaming PC Optimizer
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">CPU</span>
          <span className="text-[11px] font-mono text-cyan-400">
            {fmt(data.cpuPercent, 1)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">RAM</span>
          <span className="text-[11px] font-mono text-cyan-400">
            {fmt(data.ramPercent, 1)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">GPU°</span>
          <span className="text-[11px] font-mono text-cyan-400">
            {fmt(data.gpuTemp)}°C
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">FPS</span>
          <span className="text-[11px] font-mono text-cyan-400">
            {fmt(data.fps)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">DL</span>
          <span className="text-[11px] font-mono text-cyan-400">
            {fmt(data.downloadKbps)} KB/s
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">UL</span>
          <span className="text-[11px] font-mono text-cyan-400">
            {fmt(data.uploadKbps)} KB/s
          </span>
        </div>
      </div>
    </div>
  );
}
