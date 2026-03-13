/**
 * Windows設定の差分計算ユーティリティ
 *
 * 2つの WindowsSettings を比較して、変更されたフィールドのみを
 * 人間が読みやすい形式で返します。
 */

import type { WindowsSettings as WS } from "@/types";

export interface WindowsSettingDiffItem {
  key: keyof WS;
  label: string;
  before: string;
  after: string;
}

export interface WindowsSettingsDiff {
  items: WindowsSettingDiffItem[];
  hasChanges: boolean;
}

// ── 人間向け表示値の変換 ────────────────────────────────────────────────────

const VISUAL_FX_LABELS: Record<number, string> = {
  0: "自動",
  1: "見た目優先",
  2: "パフォーマンス優先",
  3: "カスタム",
};

function humanReadableValue(key: keyof WS, value: WS[keyof WS]): string {
  switch (key) {
    case "visual_fx":
      return VISUAL_FX_LABELS[value as number] ?? String(value);
    case "transparency":
    case "game_dvr":
    case "animate_windows":
      return (value as boolean) ? "有効" : "無効";
    case "menu_show_delay":
      return value === 0 ? "0ms（即時）" : `${value}ms`;
    default:
      return String(value);
  }
}

const SETTING_LABELS: Record<keyof WS, string> = {
  visual_fx: "視覚効果",
  transparency: "透明効果",
  game_dvr: "Game DVR",
  menu_show_delay: "メニュー表示遅延",
  animate_windows: "ウィンドウアニメーション",
};

// ── 差分計算 ────────────────────────────────────────────────────────────────

export function diffWindowsSettings(current: WS, target: WS): WindowsSettingsDiff {
  const keys = Object.keys(current) as (keyof WS)[];
  const items: WindowsSettingDiffItem[] = [];

  for (const key of keys) {
    if (current[key] !== target[key]) {
      items.push({
        key,
        label: SETTING_LABELS[key] ?? key,
        before: humanReadableValue(key, current[key]),
        after: humanReadableValue(key, target[key]),
      });
    }
  }

  return { items, hasChanges: items.length > 0 };
}
