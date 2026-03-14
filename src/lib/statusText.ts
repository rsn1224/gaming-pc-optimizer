/**
 * statusText — ステータス文言の統一定数
 *
 * UI全体で「実行中」「適用しました」「失敗しました」の表現を統一する。
 * 新しいコンポーネントはこれを参照し、独自文言を定義しないこと。
 *
 * [Phase C] UI/IA 再編 Phase C で導入。
 */

export const STATUS_TEXT = {
  // ── 汎用状態 ────────────────────────────────────────────────────────────────
  running:   "実行中",
  success:   "適用しました",
  error:     "失敗しました",
  idle:      "",

  // ── 操作別 ──────────────────────────────────────────────────────────────────
  restoring: "復元中",
  restored:  "復元しました",
  scanning:  "スキャン中",
  testing:   "テスト中",
  applying:  "適用中",
  loading:   "読み込み中",
} as const;

export type StatusKey = keyof typeof STATUS_TEXT;
