/**
 * SafeApplyButton — 安全な最適化適用ボタン (Sprint 2 / S2-05)
 *
 * クリック → プリチェック実行 → 確認ダイアログ (PreCheckPanel 表示) → 適用
 * のフローを実装する。
 *
 * ENABLE_SAFETY_KERNEL=true の場合: safe_apply_optimizations コマンドを呼ぶ
 * ENABLE_SAFETY_KERNEL=false の場合: apply_all_optimizations コマンドにフォールスルー
 *
 * 使用例:
 *   <SafeApplyButton onComplete={(result) => ...} />
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldCheck, Zap, X, Loader2, AlertTriangle } from "lucide-react";
import type { PreCheckResult, AllOptimizationResult } from "@/types";
import { PreCheckPanel } from "./PreCheckPanel";
import { useOptimizeStore } from "@/stores/useOptimizeStore";
import { toast } from "@/stores/useToastStore";

// ── Feature flag (mirrors Rust) ───────────────────────────────────────────────
export const ENABLE_SAFETY_KERNEL_UI = true;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  label?: string;
  onComplete?: (result: AllOptimizationResult) => void;
  className?: string;
  compact?: boolean;
}

type Step = "idle" | "checking" | "confirming" | "applying" | "done";

// ── Component ─────────────────────────────────────────────────────────────────

export function SafeApplyButton({
  label = "最適化を実行",
  onComplete,
  className = "",
  compact = false,
}: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [preCheck, setPreCheck] = useState<PreCheckResult | null>(null);
  const { setPhase, setPreCheckResult } = useOptimizeStore();

  const handleClick = async () => {
    if (step !== "idle") return;

    if (!ENABLE_SAFETY_KERNEL_UI) {
      // ── フォールスルー: 直接適用 ────────────────────────────────────────
      setStep("applying");
      setPhase("applying");
      try {
        const result = await invoke<AllOptimizationResult>(
          "apply_all_optimizations"
        );
        setStep("done");
        setPhase("done");
        onComplete?.(result);
        setTimeout(() => setStep("idle"), 2000);
      } catch (e) {
        toast.error("最適化に失敗しました: " + String(e));
        setStep("idle");
        setPhase("idle");
      }
      return;
    }

    // ── Safety Kernel フロー ─────────────────────────────────────────────
    // Phase 1: プリチェック
    setStep("checking");
    setPhase("prechecking");
    try {
      const result = await invoke<PreCheckResult>("run_safety_prechecks");
      setPreCheck(result);
      setPreCheckResult(result);
      setStep("confirming");
    } catch (e) {
      toast.error("プリチェックに失敗しました: " + String(e));
      setStep("idle");
      setPhase("idle");
    }
  };

  const handleConfirm = async () => {
    setStep("applying");
    setPhase("applying");
    try {
      const result = await invoke<AllOptimizationResult>(
        "safe_apply_optimizations"
      );
      setStep("done");
      setPhase("done");
      onComplete?.(result);
      setTimeout(() => {
        setStep("idle");
        setPhase("idle");
      }, 2000);
    } catch (e) {
      toast.error("最適化に失敗しました: " + String(e));
      setStep("idle");
      setPhase("idle");
    }
  };

  const handleCancel = () => {
    setStep("idle");
    setPhase("idle");
    setPreCheck(null);
    setPreCheckResult(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = step === "checking" || step === "applying";
  const isDone = step === "done";

  return (
    <>
      {/* トリガーボタン */}
      <button
        onClick={handleClick}
        disabled={step !== "idle"}
        className={`flex items-center gap-2 font-medium rounded-lg transition-all
          disabled:opacity-50 disabled:cursor-not-allowed
          ${
            compact
              ? "px-3 py-1.5 text-xs bg-violet-500/20 hover:bg-violet-500/30 text-violet-300"
              : "px-5 py-2.5 text-sm bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30"
          }
          ${isDone ? "bg-emerald-600 hover:bg-emerald-500 !opacity-100" : ""}
          ${className}`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isDone ? (
          <ShieldCheck className="w-4 h-4" />
        ) : ENABLE_SAFETY_KERNEL_UI ? (
          <ShieldCheck className="w-4 h-4" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        <span>
          {step === "checking"
            ? "チェック中..."
            : step === "applying"
            ? "適用中..."
            : isDone
            ? "完了"
            : label}
        </span>
      </button>

      {/* 確認ダイアログ (Safety Kernel 有効時のみ) */}
      {step === "confirming" && preCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCancel}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-zinc-900 border border-white/10 shadow-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-violet-400" />
                <span>適用前チェック結果</span>
              </div>
              <button
                onClick={handleCancel}
                className="p-1 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* PreCheck result */}
            <PreCheckPanel result={preCheck} />

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCancel}
                className="flex-1 py-2 rounded-lg text-sm text-zinc-400 hover:text-white
                           hover:bg-white/[0.06] transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={!preCheck.passed}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                           bg-violet-600 hover:bg-violet-500 text-white
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {preCheck.passed ? (
                  "適用する"
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    適用不可
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
