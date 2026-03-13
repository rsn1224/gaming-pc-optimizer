import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, Zap, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/useAppStore";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ProcessInfo, KillResult } from "@/types";
import { formatMemory } from "@/lib/utils";

type StepStatus = "idle" | "running" | "success" | "error";

interface OptimizationStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  result?: string;
}

export function GameMode() {
  const {
    bloatwareProcesses,
    setBloatwareProcesses,
    setGameModeActive,
    setFreedMemoryMb,
    gameModeActive,
    disabledProcesses,
  } = useAppStore();

  const [isScanning, setIsScanning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [prevPowerGuid, setPrevPowerGuid] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [steps, setSteps] = useState<OptimizationStep[]>([
    {
      id: "processes",
      label: "不要プロセス停止",
      description: "33種のブロートウェアを検出・終了",
      status: "idle",
    },
    {
      id: "power",
      label: "電源プラン変更",
      description: "Ultimate Performance に切り替え",
      status: "idle",
    },
  ]);

  const scanProcesses = useCallback(async () => {
    setIsScanning(true);
    try {
      const procs = await invoke<ProcessInfo[]>("get_running_processes");
      setBloatwareProcesses(procs);
    } catch (e) {
      console.error("Failed to scan processes:", e);
    } finally {
      setIsScanning(false);
    }
  }, [setBloatwareProcesses]);

  useEffect(() => {
    scanProcesses();
  }, [scanProcesses]);

  const updateStep = (id: string, updates: Partial<OptimizationStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const runOptimization = async () => {
    setIsOptimizing(true);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "idle", result: undefined })));

    // Step 1: Kill bloatware processes
    updateStep("processes", { status: "running" });
    try {
      // Pass null (= use all defaults) when no processes are disabled,
      // otherwise pass only the enabled subset
      const targets = disabledProcesses.length === 0
        ? null
        : bloatwareProcesses
            .filter((p) => !disabledProcesses.includes(p.name))
            .map((p) => p.name);
      const result = await invoke<KillResult>("kill_bloatware", { targets });
      const killedCount = result.killed.length;
      updateStep("processes", {
        status: "success",
        result: killedCount > 0
          ? `${killedCount} 個のプロセスを停止 (${result.freed_memory_mb.toFixed(1)} MB 解放)`
          : "対象プロセスなし（既にクリーン）",
      });
      setFreedMemoryMb(result.freed_memory_mb);
    } catch (e) {
      updateStep("processes", { status: "error", result: String(e) });
    }

    // Step 2: Power plan
    updateStep("power", { status: "running" });
    try {
      const ret = await invoke<string>("set_ultimate_performance");
      // ret format: "newGUID|prevGUID"
      const [, prevGuid] = ret.split("|");
      if (prevGuid) setPrevPowerGuid(prevGuid);
      updateStep("power", { status: "success", result: "Ultimate Performance に切り替えました" });
    } catch (e) {
      updateStep("power", { status: "error", result: String(e) });
    }

    // Refresh process list
    await scanProcesses();
    setGameModeActive(true);
    setIsOptimizing(false);
  };

  const restoreOptimization = async () => {
    if (!prevPowerGuid) return;
    setIsRestoring(true);
    try {
      await invoke("restore_power_plan", { previousGuid: prevPowerGuid });
      setPrevPowerGuid(null);
      setGameModeActive(false);
      setSteps((prev) => prev.map((s) => ({ ...s, status: "idle", result: undefined })));
    } catch (e) {
      console.error("Failed to restore power plan:", e);
    } finally {
      setIsRestoring(false);
    }
  };

  const totalMemory = bloatwareProcesses.reduce((sum, p) => sum + p.memory_mb, 0);

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
            <Gamepad2 className="text-cyan-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ゲームモード</h1>
            <p className="text-sm text-muted-foreground">
              不要プロセスを停止してリソースを最大化
            </p>
          </div>
        </div>
        {gameModeActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium text-green-400">有効</span>
          </div>
        )}
      </div>

      {/* Detected Processes */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-muted-foreground" />
            <span className="text-sm font-semibold">検出されたプロセス</span>
            {bloatwareProcesses.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-destructive/20 text-destructive rounded-full font-medium">
                {bloatwareProcesses.length} 件
              </span>
            )}
          </div>
          <button
            onClick={scanProcesses}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-muted-foreground rounded-md transition-colors"
          >
            <RefreshCw size={12} className={isScanning ? "animate-spin" : ""} />
            スキャン
          </button>
        </div>

        {isScanning ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">スキャン中...</span>
          </div>
        ) : bloatwareProcesses.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <CheckCircle2 size={16} className="text-green-400" />
            <span className="text-sm">不要プロセスは検出されませんでした</span>
          </div>
        ) : (
          <>
            <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
              <AnimatePresence>
                {bloatwareProcesses.map((proc) => (
                  <motion.div
                    key={proc.pid}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                      <span className="text-sm font-medium">{proc.name}</span>
                      <span className="text-xs text-muted-foreground">PID: {proc.pid}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatMemory(proc.memory_mb)}
                      </span>
                      <span className="text-xs text-yellow-400 tabular-nums">
                        {proc.cpu_percent.toFixed(1)}%
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="px-4 py-2 bg-destructive/5 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                合計メモリ使用量: <span className="text-foreground font-medium">{formatMemory(totalMemory)}</span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Optimization Steps */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-muted-foreground" />
            <span className="text-sm font-semibold">最適化ステップ</span>
          </div>
        </div>
        <div className="divide-y divide-border/50">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 px-4 py-3">
              <StepIcon status={step.status} />
              <div className="flex-1">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="text-xs text-muted-foreground">
                  {step.result ?? step.description}
                </p>
              </div>
              {step.status === "running" && (
                <div className="w-24">
                  <ProgressBar value={50} colorByValue={false} showLabel={false} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={runOptimization}
          disabled={isOptimizing || isRestoring}
          className={`
            flex-1 py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-3
            ${isOptimizing || isRestoring
              ? "bg-primary/20 text-primary/60 cursor-not-allowed border border-primary/20"
              : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] glow-cyan border border-primary/20"
            }
          `}
        >
          {isOptimizing ? (
            <>
              <Loader2 size={22} className="animate-spin" />
              最適化中...
            </>
          ) : (
            <>
              <Gamepad2 size={22} />
              ワンクリック最適化
            </>
          )}
        </button>

        {prevPowerGuid && (
          <button
            type="button"
            onClick={restoreOptimization}
            disabled={isOptimizing || isRestoring}
            className={`
              px-5 py-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 border
              ${isOptimizing || isRestoring
                ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              }
            `}
          >
            {isRestoring ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
            復元
          </button>
        )}
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 size={18} className="text-cyan-400 animate-spin shrink-0" />;
    case "success":
      return <CheckCircle2 size={18} className="text-green-400 shrink-0" />;
    case "error":
      return <XCircle size={18} className="text-destructive shrink-0" />;
    default:
      return (
        <div className="w-[18px] h-[18px] rounded-full border-2 border-border shrink-0" />
      );
  }
}
