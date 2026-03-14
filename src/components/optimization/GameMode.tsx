import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, Zap, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2, RotateCcw, ShieldCheck, AlertTriangle, ShieldOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/useAppStore";
import { ProgressBar } from "@/components/ui/progress-bar";
import { toast } from "@/stores/useToastStore";
import type { ProcessInfo, KillResult, AnnotatedProcess, ProcessRiskLevel, SystemInfo, SessionMetrics } from "@/types";
import { formatMemory } from "@/lib/utils";
import { findAnnotation } from "@/data/process_knowledge";
import { BeforeAfterCard } from "@/components/ui/BeforeAfterCard";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";

// ── [Phase D] Feature flag ─────────────────────────────────────────────────────
// Set to `true` to show BeforeAfterCard + RollbackEntryPoint after optimization.
// Default: false — no visible change.
const ENABLE_OPTIMIZE_RESULT_CARD = true;

type StepStatus = "idle" | "running" | "success" | "error";

interface OptimizationStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  result?: string;
}

// ── Risk badge ────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<
  ProcessRiskLevel,
  { label: string; icon: React.ReactNode; cls: string; dotCls: string }
> = {
  safe_to_kill: {
    label: "停止OK",
    icon: <ShieldCheck size={10} />,
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dotCls: "bg-emerald-400 shadow-[0_0_5px_rgba(34,197,94,0.6)]",
  },
  caution: {
    label: "注意",
    icon: <AlertTriangle size={10} />,
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dotCls: "bg-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.5)]",
  },
  keep: {
    label: "維持推奨",
    icon: <ShieldOff size={10} />,
    cls: "bg-white/5 text-muted-foreground border-white/10",
    dotCls: "bg-muted-foreground/40",
  },
};

function RiskBadge({ level }: { level: ProcessRiskLevel }) {
  const cfg = RISK_CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 shrink-0 ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Process icon ──────────────────────────────────────────────────────────────

const PROC_ICON_COLORS = [
  "bg-cyan-500/20 text-cyan-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-violet-500/20 text-violet-400",
  "bg-amber-500/20 text-amber-400",
  "bg-blue-500/20 text-blue-400",
  "bg-rose-500/20 text-rose-400",
  "bg-orange-500/20 text-orange-400",
  "bg-teal-500/20 text-teal-400",
] as const;

function procIconColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROC_ICON_COLORS[Math.abs(hash) % PROC_ICON_COLORS.length];
}

// ── Exe icon cache (shared across rows, avoids repeated PowerShell calls) ──────

const exeIconCache = new Map<string, string | null>();

// ── Process row ───────────────────────────────────────────────────────────────

function ProcessRow({ proc }: { proc: AnnotatedProcess }) {
  const ann = proc.annotation;
  const dotCls = ann ? RISK_CONFIG[ann.risk_level].dotCls : "bg-destructive/60";
  const letter = (proc.name[0] ?? "?").toUpperCase();

  const [icon, setIcon] = useState<string | null>(
    proc.exe_path ? (exeIconCache.get(proc.exe_path) ?? undefined) ?? null : null
  );

  useEffect(() => {
    if (!proc.exe_path) return;
    if (exeIconCache.has(proc.exe_path)) {
      setIcon(exeIconCache.get(proc.exe_path) ?? null);
      return;
    }
    invoke<string>("get_exe_icon_base64", { exePath: proc.exe_path })
      .then((b64) => {
        exeIconCache.set(proc.exe_path, b64);
        setIcon(b64);
      })
      .catch(() => {
        exeIconCache.set(proc.exe_path, null);
      });
  }, [proc.exe_path]);

  return (
    <motion.div
      key={proc.pid}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex flex-col px-3 py-2.5 gap-1 hover:bg-white/[0.025] transition-colors border-b border-white/[0.04] last:border-0"
    >
      {/* Top line: name + resources + badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Exe icon or letter avatar fallback */}
          {icon ? (
            <img
              src={`data:image/png;base64,${icon}`}
              alt=""
              aria-hidden
              className="w-6 h-6 rounded-md shrink-0 object-contain"
            />
          ) : (
            <span className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold ${procIconColor(proc.name)}`}>
              {letter}
            </span>
          )}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
          <span className="text-sm font-medium truncate">
            {ann ? ann.display_name : proc.name}
          </span>
          <span className="text-[10px] text-muted-foreground/40 shrink-0 font-mono">PID {proc.pid}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground/60 tabular-nums">
            {formatMemory(proc.memory_mb)}
          </span>
          <span className="text-xs text-amber-400/80 tabular-nums w-10 text-right">
            {proc.cpu_percent.toFixed(1)}%
          </span>
          {ann && <RiskBadge level={ann.risk_level} />}
        </div>
      </div>
      {/* Bottom line: description */}
      {ann && (
        <div className="pl-3.5 flex flex-col gap-0.5">
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
            {ann.description}
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            <span className="font-medium text-muted-foreground/60">推奨: </span>{ann.recommended_action}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function ProcessSummary({ procs }: { procs: AnnotatedProcess[] }) {
  const safe = procs.filter((p) => p.annotation?.risk_level === "safe_to_kill").length;
  const caution = procs.filter((p) => p.annotation?.risk_level === "caution").length;
  const unknown = procs.filter((p) => !p.annotation).length;

  return (
    <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.05] flex items-center gap-4 flex-wrap">
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">AI推奨</span>
      {safe > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <ShieldCheck size={11} />
          停止OK {safe}件
        </span>
      )}
      {caution > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-amber-400">
          <AlertTriangle size={11} />
          注意 {caution}件
        </span>
      )}
      {unknown > 0 && (
        <span className="text-xs text-muted-foreground/40">
          未分類 {unknown}件
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GameMode() {
  const {
    bloatwareProcesses,
    setBloatwareProcesses,
    setGameModeActive,
    setFreedMemoryMb,
    gameModeActive,
    disabledProcesses,
  } = useAppStore();

  const [annotatedProcs, setAnnotatedProcs] = useState<AnnotatedProcess[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [metricsBefore, setMetricsBefore] = useState<SessionMetrics | null>(null);
  const [metricsAfter, setMetricsAfter] = useState<SessionMetrics | null>(null);
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
    {
      id: "windows",
      label: "Windows ゲーミング設定",
      description: "視覚効果・Game DVR・アニメーションを最適化",
      status: "idle",
    },
    {
      id: "network",
      label: "ネットワーク最適化",
      description: "NetworkThrottlingIndex・TCP/IP を最適値に変更",
      status: "idle",
    },
  ]);

  // Merge raw processes with knowledge base
  const mergeAnnotations = useCallback((procs: ProcessInfo[]): AnnotatedProcess[] => {
    return procs.map((p) => ({
      ...p,
      annotation: findAnnotation(p.name),
    }));
  }, []);

  const scanProcesses = useCallback(async () => {
    setIsScanning(true);
    try {
      const procs = await invoke<ProcessInfo[]>("get_running_processes");
      setBloatwareProcesses(procs);
      setAnnotatedProcs(mergeAnnotations(procs));
    } catch (e) {
      console.error("Failed to scan processes:", e);
    } finally {
      setIsScanning(false);
    }
  }, [setBloatwareProcesses, mergeAnnotations]);

  useEffect(() => {
    scanProcesses();
  }, [scanProcesses]);

  const updateStep = (id: string, updates: Partial<OptimizationStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const captureMetrics = async (): Promise<SessionMetrics | null> => {
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      return {
        process_count: bloatwareProcesses.length,
        memory_used_mb: info.memory_used_mb,
        memory_total_mb: info.memory_total_mb,
        memory_percent: info.memory_percent,
        captured_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  };

  const runOptimization = async () => {
    setIsOptimizing(true);
    setMetricsBefore(null);
    setMetricsAfter(null);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "idle", result: undefined })));

    const before = ENABLE_OPTIMIZE_RESULT_CARD ? await captureMetrics() : null;
    if (before) setMetricsBefore(before);

    // Step 1: Kill bloatware processes
    updateStep("processes", { status: "running" });
    try {
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
      await invoke<string>("set_ultimate_performance");
      updateStep("power", { status: "success", result: "Ultimate Performance に切り替えました" });
    } catch (e) {
      updateStep("power", { status: "error", result: String(e) });
    }

    // Step 3: Windows gaming settings
    updateStep("windows", { status: "running" });
    try {
      await invoke("apply_gaming_windows_settings");
      updateStep("windows", { status: "success", result: "視覚効果・Game DVR を最適化しました" });
    } catch (e) {
      updateStep("windows", { status: "error", result: String(e) });
    }

    // Step 4: Network gaming tweaks
    updateStep("network", { status: "running" });
    try {
      await invoke("apply_network_gaming");
      updateStep("network", { status: "success", result: "TCP/IP・NetworkThrottlingIndex を最適化しました" });
    } catch (e) {
      updateStep("network", { status: "error", result: String(e) });
    }

    await scanProcesses();
    if (ENABLE_OPTIMIZE_RESULT_CARD) {
      const after = await captureMetrics();
      if (after) setMetricsAfter(after);
    }
    setGameModeActive(true);
    setIsOptimizing(false);
  };

  const restoreOptimization = async () => {
    setIsRestoring(true);
    try {
      await invoke("restore_all");
      setGameModeActive(false);
      setSteps((prev) => prev.map((s) => ({ ...s, status: "idle", result: undefined })));
    } catch (e) {
      toast.error("復元に失敗しました: " + String(e));
    } finally {
      setIsRestoring(false);
    }
  };

  const totalMemory = bloatwareProcesses.reduce((sum, p) => sum + p.memory_mb, 0);

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <Gamepad2 className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ゲームモード</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              不要プロセスを停止してリソースを最大化
            </p>
          </div>
        </div>
        {gameModeActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wide">有効</span>
          </div>
        )}
      </div>

      {/* 2-column layout for xl screens — Left: Steps+CTA, Right: Processes */}
      <div className="flex-1 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">

        {/* Left — Steps + CTA */}
        <div className="flex flex-col gap-4">
          {/* Optimization Steps */}
          <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden card-glow">
            <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                  <Zap size={13} className="text-cyan-400" />
                </div>
                <span className="text-sm font-semibold">最適化ステップ</span>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3 px-4 py-3.5">
                  <StepIcon status={step.status} index={idx + 1} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className={`text-xs truncate mt-0.5 ${step.status === "success" ? "text-emerald-400" : step.status === "error" ? "text-red-400" : "text-muted-foreground"}`}>
                      {step.result ?? step.description}
                    </p>
                  </div>
                  {step.status === "running" && (
                    <div className="w-16 shrink-0">
                      <ProgressBar value={50} colorByValue={false} showLabel={false} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={runOptimization}
              disabled={isOptimizing || isRestoring}
              className={`
                w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-3
                ${isOptimizing || isRestoring
                  ? "bg-cyan-500/8 text-cyan-400/40 cursor-not-allowed border border-cyan-500/10"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97] glow-cyan"
                }
              `}
            >
              {isOptimizing ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  最適化中...
                </>
              ) : (
                <>
                  <Gamepad2 size={20} />
                  ワンクリック最適化
                </>
              )}
            </button>

            {gameModeActive && (
              <button
                type="button"
                onClick={restoreOptimization}
                disabled={isOptimizing || isRestoring}
                className={`
                  w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border
                  ${isOptimizing || isRestoring
                    ? "opacity-30 cursor-not-allowed border-white/[0.06] text-muted-foreground"
                    : "border-white/[0.10] bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground hover:border-white/20"
                  }
                `}
              >
                {isRestoring ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                設定を復元
              </button>
            )}
          </div>

          {/* [Phase D] Before/After result card + rollback entry point */}
          {ENABLE_OPTIMIZE_RESULT_CARD && metricsBefore && metricsAfter && (
            <BeforeAfterCard before={metricsBefore} after={metricsAfter} />
          )}
          {ENABLE_OPTIMIZE_RESULT_CARD && gameModeActive && (
            <div className="flex justify-end">
              <RollbackEntryPoint />
            </div>
          )}
        </div>

        {/* Right — Detected Processes */}
        <div className="bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col card-glow">
          {/* Card header */}
          <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-red-500/10 rounded-lg border border-red-500/20">
                <Trash2 size={13} className="text-red-400/70" />
              </div>
              <span className="text-sm font-semibold">検出されたプロセス</span>
              {bloatwareProcesses.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 rounded-full font-semibold">
                  {bloatwareProcesses.length} 件
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={scanProcesses}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-white/[0.07] hover:border-white/15 rounded-lg transition-colors"
            >
              <RefreshCw size={11} className={isScanning ? "animate-spin" : ""} />
              スキャン
            </button>
          </div>

          {isScanning ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 size={15} className="animate-spin text-cyan-400" />
              <span className="text-sm">スキャン中...</span>
            </div>
          ) : annotatedProcs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <CheckCircle2 size={20} className="text-emerald-400/60" />
              <span className="text-sm">不要プロセスは検出されませんでした</span>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence>
                  {annotatedProcs.map((proc) => (
                    <ProcessRow key={proc.pid} proc={proc} />
                  ))}
                </AnimatePresence>
              </div>
              <ProcessSummary procs={annotatedProcs} />
              <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.05] flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  合計メモリ: <span className="text-foreground font-medium">{formatMemory(totalMemory)}</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  switch (status) {
    case "running":
      return <Loader2 size={18} className="text-cyan-400 animate-spin shrink-0" />;
    case "success":
      return <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />;
    case "error":
      return <XCircle size={18} className="text-destructive shrink-0" />;
    default:
      return (
        <div className="step-number shrink-0">{index}</div>
      );
  }
}
