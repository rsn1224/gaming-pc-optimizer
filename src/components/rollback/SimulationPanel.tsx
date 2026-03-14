import { invoke } from "@tauri-apps/api/core";
import { Zap, X, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMetricsStore } from "@/stores/useMetricsStore";
import { useSafetyStore } from "@/stores/useSafetyStore";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { RiskSummary } from "@/components/ui/RiskSummary";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "@/stores/useToastStore";
import type { AllOptimizationResult } from "@/types";

// ── Main panel ────────────────────────────────────────────────────────────────

export function SimulationPanel() {
  const { simulation, setSimulation, executing, setExecuting, setLastOptResult } =
    useMetricsStore();
  const { beginnerMode } = useSafetyStore();

  if (!simulation) return null;

  const hasRisky = simulation.caution_count > 0 || simulation.advanced_count > 0;
  const visibleChanges = beginnerMode
    ? simulation.changes.filter((c) => c.risk_level === "safe")
    : simulation.changes;
  const hiddenCount = simulation.changes.length - visibleChanges.length;

  const handleCancel = () => {
    setSimulation(null);
  };

  const handleConfirm = async () => {
    setExecuting(true);
    try {
      const result = await invoke<AllOptimizationResult>("apply_all_optimizations");
      setLastOptResult(result);
      useAppStore.getState().setGameModeActive(true);
      useAppStore.getState().setFreedMemoryMb(result.process_freed_mb);
      toast.success(
        `最適化完了 — プロセス停止: ${result.process_killed}件, ${result.process_freed_mb.toFixed(0)}MB 解放`
      );
      setSimulation(null);
    } catch (e) {
      toast.error(`最適化失敗: ${e}`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[#07090e] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden">
        {/* Top accent */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
              <Zap size={18} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-100">
                最適化プレビュー
              </h2>
              <p className="text-[11px] text-muted-foreground/50">
                適用前に変更内容を確認してください
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-muted-foreground/55 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Risk summary */}
        <div className="px-5 pb-3">
          <RiskSummary
            safe={simulation.safe_count}
            caution={simulation.caution_count}
            advanced={simulation.advanced_count}
          />
        </div>

        {/* Warning banner */}
        {hasRisky && (
          <div className="mx-5 mb-3 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-300/80">
              注意・上級レベルの変更が含まれています。管理者権限が必要な操作や、
              設定の変更が行われます。ロールバックセンターから元に戻せます。
            </p>
          </div>
        )}

        {/* Beginner mode hidden items notice */}
        {beginnerMode && hiddenCount > 0 && (
          <div className="mx-5 mb-3 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <p className="text-[11px] text-muted-foreground/50">
              初心者モード: 注意・上級の変更 {hiddenCount}件 は非表示です
              （適用は行われます）
            </p>
          </div>
        )}

        {/* Change list */}
        <div className="px-5 pb-3 space-y-2 max-h-52 overflow-y-auto">
          {visibleChanges.map((c, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 rounded-xl border",
                c.will_apply
                  ? "bg-white/[0.02] border-white/[0.06]"
                  : "bg-white/[0.01] border-white/[0.03] opacity-50"
              )}
            >
              <RiskBadge level={c.risk_level} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-200">
                    {c.target}
                  </span>
                  {!c.will_apply && (
                    <span className="text-[10px] text-muted-foreground/55">
                      既に最適化済み
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-relaxed">
                  {c.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="px-5 pb-5 pt-3 border-t border-white/[0.05] flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={executing}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.12] text-[13px] font-medium text-muted-foreground/70 hover:text-slate-200 hover:border-white/[0.15] transition-colors disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={executing}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all",
              executing
                ? "bg-cyan-500/10 text-cyan-400/50 cursor-not-allowed"
                : hasRisky
                ? "bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110"
            )}
          >
            {executing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                実行中...
              </>
            ) : (
              <>
                <Zap size={14} />
                {hasRisky ? "リスクを確認して実行" : "実行"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
