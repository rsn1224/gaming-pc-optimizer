/**
 * useMetricsStore — シミュレーション確認・実行状態
 *
 * 責務の区分:
 *   [編集状態 / Editing State]
 *     simulation   — 確認ダイアログに表示する「適用予定の変更プレビュー」。まだ適用されていない。
 *     onConfirm    — ユーザーが「実行」を押した時に呼ばれるコールバック。
 *   [実行状態 / Execution State]
 *     executing    — SimulationPanel の「実行中」スピナー制御フラグ。
 *     lastOptResult — 直近の最適化結果。Dashboard が結果表示に参照する。
 *
 * Note: 名前は "Metrics" だが、実態はシミュレーション確認フローの状態管理。
 *       Phase 3 以降でより明確な名前（useSimulationStore など）への移行を検討。
 */

import { create } from "zustand";
import type { SimulationResult, AllOptimizationResult } from "@/types";

interface MetricsStore {
  // ── 編集状態 (Editing State) ────────────────────────────────────────────────
  /** 確認ダイアログに渡す変更プレビュー。null = ダイアログ非表示 */
  simulation: SimulationResult | null;
  setSimulation: (s: SimulationResult | null) => void;
  /** simulation 確認後に実行する非同期コールバック */
  onConfirm: (() => Promise<void>) | null;
  setOnConfirm: (fn: (() => Promise<void>) | null) => void;

  // ── 実行状態 (Execution State) ──────────────────────────────────────────────
  /** 直近の最適化結果。Dashboard が useEffect で参照し、スコア表示を更新する */
  lastOptResult: AllOptimizationResult | null;
  setLastOptResult: (r: AllOptimizationResult | null) => void;
  /** SimulationPanel の「実行」ボタン無効化フラグ */
  executing: boolean;
  setExecuting: (v: boolean) => void;
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  simulation: null,
  setSimulation: (s) => set({ simulation: s }),
  onConfirm: null,
  setOnConfirm: (fn) => set({ onConfirm: fn }),

  lastOptResult: null,
  setLastOptResult: (r) => set({ lastOptResult: r }),

  executing: false,
  setExecuting: (v) => set({ executing: v }),
}));
