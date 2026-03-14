/**
 * recommendationService.ts — 推奨エンジン V2 サービス層
 *
 * Tauri コマンドの invoke ラッパー。
 * エラーは呼び出し元（store）に伝播する。
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  RecommendationInput,
  RecommendationResult,
  MetricsSummary,
} from "@/types";

/**
 * 最適化推奨事項を生成する。
 * ENABLE_RECOMMENDATION_V2 が false の場合は Tauri 側で Err を返す。
 */
export async function generateRecommendation(
  input: RecommendationInput
): Promise<RecommendationResult> {
  return invoke<RecommendationResult>("generate_recommendation", {
    payload: input,
  });
}

/**
 * モデル別メトリクスサマリーを取得する。
 * @param rangeHours 集計対象の時間幅（デフォルト 24h）
 */
export async function getRecommendationMetrics(
  rangeHours?: number
): Promise<MetricsSummary> {
  return invoke<MetricsSummary>("get_recommendation_metrics", {
    rangeHours: rangeHours ?? 24,
  });
}
