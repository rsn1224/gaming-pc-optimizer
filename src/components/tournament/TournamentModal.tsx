/**
 * TournamentModal — 試合前チェックリスト (ENABLE_TOURNAMENT_MODE)
 *
 * run_tournament_checklist を呼び出し、5項目のシステム状態を
 * Pass / Warn / Fail インジケーター付きで表示する。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trophy,
  RefreshCw,
  Cpu,
  MemoryStick,
  Layers,
  HardDrive,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TournamentResult, TournamentStep, StepStatus } from "@/types";

// ── Step icon mapping ─────────────────────────────────────────────────────────

const STEP_ICONS: Record<string, React.ElementType> = {
  cpu_usage:     Cpu,
  memory_free:   MemoryStick,
  process_count: Layers,
  disk_space:    HardDrive,
  network_latency: Wifi,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 16 }: { status: StepStatus; size?: number }) {
  if (status === "Pass")
    return <CheckCircle2 size={size} className="text-emerald-400 shrink-0" />;
  if (status === "Warn")
    return <AlertTriangle size={size} className="text-amber-400 shrink-0" />;
  return <XCircle size={size} className="text-rose-400 shrink-0" />;
}

function StepRow({ step }: { step: TournamentStep }) {
  const Icon = STEP_ICONS[step.id] ?? Cpu;
  const borderColor =
    step.status === "Pass"
      ? "border-emerald-500/20"
      : step.status === "Warn"
      ? "border-amber-500/20"
      : "border-rose-500/20";

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl border bg-white/[0.02]",
        borderColor,
      )}
    >
      <div className="shrink-0 mt-0.5">
        <Icon size={14} className="text-muted-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-white truncate">{step.name}</p>
          <StatusIcon status={step.status} size={14} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{step.message}</p>
      </div>
      {step.value && (
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground/70 tabular-nums whitespace-nowrap">
          {step.value}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TournamentModalProps {
  onClose: () => void;
}

export function TournamentModal({ onClose }: TournamentModalProps) {
  const [result, setResult] = useState<TournamentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<TournamentResult>("run_tournament_checklist");
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-run on first open
  if (!result && !loading && !error) {
    runCheck();
  }

  const overallColor = result?.overallReady ? "text-emerald-400" : "text-rose-400";
  const overallBg    = result?.overallReady
    ? "bg-emerald-500/10 border-emerald-500/30"
    : "bg-rose-500/10 border-rose-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-md bg-[#05080c] border border-white/[0.12] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Trophy size={14} className="text-amber-400" />
            </div>
            <h2 className="text-[15px] font-semibold text-white">試合前チェックリスト</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground/55 hover:text-muted-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[13px]">システムをチェック中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <XCircle size={28} className="text-rose-400" />
              <p className="text-[13px] text-rose-300 text-center">{error}</p>
              <button
                type="button"
                onClick={runCheck}
                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-white/[0.12] text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                <RefreshCw size={11} /> 再試行
              </button>
            </div>
          ) : result ? (
            <>
              {/* Overall badge */}
              <div className={cn("flex items-center gap-2 p-3 rounded-xl border", overallBg)}>
                <Trophy size={14} className={overallColor} />
                <p className={cn("text-[13px] font-semibold flex-1", overallColor)}>
                  {result.overallReady ? "出撃準備OK！" : "いくつか問題があります"}
                </p>
                <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                  {result.passCount}✓ {result.warnCount}△ {result.failCount}✗
                </span>
              </div>

              {/* Steps */}
              {result.steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}

              {/* Timestamp + re-run */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground/55">
                  {result.checkedAt.replace("T", " ").replace("Z", " UTC")}
                </span>
                <button
                  type="button"
                  onClick={runCheck}
                  disabled={loading}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <RefreshCw size={10} /> 再チェック
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-[12px] rounded-lg border border-white/[0.12] text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
