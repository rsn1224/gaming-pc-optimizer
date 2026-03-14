/**
 * useRecommendationStore — 推奨エンジン V2 状態管理
 *
 * 責務:
 *   - generate(): Tauri コマンドを呼び出し result を更新する
 *   - fetchMetrics(): メトリクスサマリーを取得する
 *   - history: 直近 10 件のレポートを保持する
 */
import { create } from "zustand";
import type {
  RecommendationInput,
  RecommendationResult,
  MetricsSummary,
} from "@/types";
import {
  generateRecommendation,
  getRecommendationMetrics,
} from "@/services/recommendationService";

interface RecommendationState {
  // ── Data ──────────────────────────────────────────────────────────────────
  result: RecommendationResult | null;
  metrics: MetricsSummary | null;
  history: RecommendationResult[];

  // ── Loading / error ───────────────────────────────────────────────────────
  loading: boolean;
  error: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  generate: (input: RecommendationInput) => Promise<void>;
  fetchMetrics: (rangeHours?: number) => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
}

export const useRecommendationStore = create<RecommendationState>(
  (set, _get) => ({
    result: null,
    metrics: null,
    history: [],
    loading: false,
    error: null,

    generate: async (input) => {
      set({ loading: true, error: null });
      try {
        const result = await generateRecommendation(input);
        set((state) => ({
          result,
          loading: false,
          // keep last 10 reports in history
          history: [result, ...state.history].slice(0, 10),
        }));
      } catch (e) {
        set({ error: String(e), loading: false });
      }
    },

    fetchMetrics: async (rangeHours) => {
      try {
        const metrics = await getRecommendationMetrics(rangeHours);
        set({ metrics });
      } catch {
        // metrics are optional — swallow error silently
      }
    },

    clearResult: () => set({ result: null }),
    clearError: () => set({ error: null }),
  })
);
