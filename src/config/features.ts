/**
 * features.ts — フロントエンドフィーチャーフラグ集約
 *
 * このファイルが唯一のフラグ定義箇所です。
 * 各コンポーネントはローカルで const を定義せずここから import します。
 *
 * Rust 側フラグは src-tauri/src/commands/*.rs を参照してください。
 */

// ── ダッシュボード ─────────────────────────────────────────────────────────────

/** HomeHub コンポーネントを表示する */
export const ENABLE_HOME_HUB = true;

/** スコア回帰検知バナーを表示する */
export const ENABLE_SCORE_REGRESSION_WATCH = true;

/** サーマル自動低減機能を有効にする */
export const ENABLE_THERMAL_AUTO_REDUCTION = true;

/** グローバルロールバックヘッダーを表示する */
export const ENABLE_GLOBAL_ROLLBACK_HEADER = false;

/** ポリシーエンジン UI を有効にする */
export const ENABLE_POLICY_ENGINE = true;

/** ゲーム起動監視を有効にする */
export const ENABLE_LAUNCH_MONITORING = true;

/** ハードウェア提案を表示する */
export const ENABLE_HARDWARE_SUGGESTIONS = true;

/** パフォーマンスコーチ機能を有効にする */
export const ENABLE_PERFORMANCE_COACH = true;

/** 推奨エンジン V2 の UI を表示する（Rust 側 ENABLE_RECOMMENDATION_V2 と連動） */
export const ENABLE_RECOMMENDATION_V2_UI = false;

/** 試合前チェックリスト UI を表示する（Rust 側 ENABLE_TOURNAMENT_MODE と連動） */
export const ENABLE_TOURNAMENT_MODE_UI = true;

/** フレームタイムオーバーレイ UI を表示する（Rust 側 ENABLE_FRAMETIME_OVERLAY と連動） */
export const ENABLE_FRAMETIME_OVERLAY_UI = false;

// ── ゲームライブラリ ──────────────────────────────────────────────────────────

/** プロファイル SSOT モードを有効にする */
export const ENABLE_PROFILE_SSOT = false;

/** マルチランチャー（Epic / GOG / Xbox）対応を有効にする */
export const ENABLE_MULTI_LAUNCHER = false;

// ── プロファイル ──────────────────────────────────────────────────────────────

/** AI プロファイルジェネレーターを表示する */
export const ENABLE_AI_PROFILE_GENERATOR = true;

/** プロファイルプレビューを表示する */
export const ENABLE_PROFILE_PREVIEW = false;

// ── 最適化 ────────────────────────────────────────────────────────────────────

/** 最適化結果カードを表示する */
export const ENABLE_OPTIMIZE_RESULT_CARD = true;

/** 検証バナーを表示する */
export const ENABLE_VERIFY_BANNER = true;

// ── ネットワーク ──────────────────────────────────────────────────────────────

/** ネットワークタブ分割表示を有効にする */
export const ENABLE_NETWORK_TAB_SPLIT = true;

// ── ベンチマーク ──────────────────────────────────────────────────────────────

/** ベンチマーク履歴機能を有効にする */
export const ENABLE_BENCHMARK_HISTORY = false;

// ── 設定 ──────────────────────────────────────────────────────────────────────

/** HAGS / 表示Hz / Defender除外最適化を表示する */
export const ENABLE_HAGS_DISPLAY_OPTIMIZER = false;

/** 監査ログ UI を表示する */
export const ENABLE_AUDIT_LOG = true;

/** テレメトリー UI を表示する */
export const ENABLE_TELEMETRY_UI = true;

/** セーフティカーネル UI を有効にする */
export const ENABLE_SAFETY_KERNEL_UI = true;
