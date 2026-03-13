/**
 * Windows設定プリセット 知識ベース
 *
 * 組み込みプリセットをここで定義します。
 *
 * カスタムプリセットの追加方法:
 *   1. `export_windows_settings_context` Tauri コマンドで現在のコンテキストJSONをコピー
 *   2. Claude Code に自然言語で要望を伝えてプリセットを生成してもらう
 *   3. 生成された WindowsPreset オブジェクトを BUILTIN_WINDOWS_PRESETS に追加
 *      （または将来的な JSON 外部化対応まで、このファイルを直接編集）
 *
 * 将来的に custom_windows_presets.json への分離・外部化も想定しています。
 */

import type { WindowsPreset } from "@/types";

export const BUILTIN_WINDOWS_PRESETS: WindowsPreset[] = [
  {
    id: "default",
    label: "標準",
    description: "見た目とアニメーションを重視したWindows標準の設定。デスクトップ作業・普段使いに最適。",
    settings: {
      visual_fx: 0,
      transparency: true,
      game_dvr: true,
      menu_show_delay: 400,
      animate_windows: true,
    },
    explanation:
      "視覚効果を自動設定に戻し、透明効果・Game DVR・ウィンドウアニメーションをすべて有効にした標準状態です。",
  },
  {
    id: "gaming",
    label: "ゲーミング最適化",
    description: "見た目を削ってレスポンスとFPSを最優先にした設定。ゲームプレイ中はこちらを推奨。",
    settings: {
      visual_fx: 2,
      transparency: false,
      game_dvr: false,
      menu_show_delay: 0,
      animate_windows: false,
    },
    explanation:
      "視覚効果をパフォーマンス優先に変更し、透明効果・ウィンドウアニメーションを無効化。Game DVRも停止してCPU・GPU負荷を削減します。メニュー表示を即時にすることでOS操作のレスポンスも向上します。",
  },
  {
    id: "balanced",
    label: "バランス",
    description: "見た目を多少残しつつパフォーマンスも確保する折衷設定。動画視聴しながらゲームするときなどに。",
    settings: {
      visual_fx: 0,
      transparency: false,
      game_dvr: false,
      menu_show_delay: 100,
      animate_windows: true,
    },
    explanation:
      "透明効果とGame DVRを無効にしてGPU負荷を軽減しつつ、ウィンドウアニメーションは維持します。視覚効果は自動設定のためPCスペックに応じて最適化されます。",
  },
];

/**
 * ID でプリセットを検索するユーティリティ
 */
export function findPreset(id: string): WindowsPreset | undefined {
  return BUILTIN_WINDOWS_PRESETS.find((p) => p.id === id);
}
