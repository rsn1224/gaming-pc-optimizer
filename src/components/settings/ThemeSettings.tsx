import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Palette, Check, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { AppearanceSettings } from "@/types";

const ACCENT_COLORS = [
  { id: "cyan",   label: "シアン",    hex: "#22d3ee", glow: "rgba(34,211,238,0.4)" },
  { id: "purple", label: "パープル",  hex: "#a78bfa", glow: "rgba(167,139,250,0.4)" },
  { id: "orange", label: "オレンジ",  hex: "#fb923c", glow: "rgba(251,146,60,0.4)" },
  { id: "green",  label: "グリーン",  hex: "#34d399", glow: "rgba(52,211,153,0.4)" },
  { id: "pink",   label: "ピンク",    hex: "#e879f9", glow: "rgba(232,121,249,0.4)" },
] as const;

const FONT_SIZES = [
  { id: "small",  label: "小 (13px)" },
  { id: "medium", label: "中 (15px)" },
  { id: "large",  label: "大 (17px)" },
] as const;

const DEFAULT_SETTINGS: AppearanceSettings = {
  accent_color: "cyan",
  font_size: "medium",
  sidebar_compact: false,
  animations_enabled: true,
};

function applyToDocument(settings: AppearanceSettings) {
  document.documentElement.setAttribute("data-accent", settings.accent_color);
  document.documentElement.setAttribute("data-font-size", settings.font_size);
}

export function ThemeSettings() {
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<AppearanceSettings>("get_appearance")
      .then((s) => setSettings(s))
      .catch(() => {});
  }, []);

  function handleAccentChange(color: string) {
    const next = { ...settings, accent_color: color };
    setSettings(next);
    applyToDocument(next);
  }

  function handleFontSizeChange(size: string) {
    const next = { ...settings, font_size: size };
    setSettings(next);
    applyToDocument(next);
  }

  function handleToggle(key: "sidebar_compact" | "animations_enabled") {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await invoke("save_appearance", { settings });
      applyToDocument(settings);
      toast.success("外観設定を保存しました");
    } catch (e) {
      toast.error(`保存に失敗しました: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSettings(DEFAULT_SETTINGS);
    applyToDocument(DEFAULT_SETTINGS);
  }

  const currentColor = ACCENT_COLORS.find((c) => c.id === settings.accent_color) ?? ACCENT_COLORS[0];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Palette size={18} className="text-cyan-400" />
          テーマ・外観設定
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw size={13} />
            デフォルトに戻す
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? "保存中…" : "設定を保存"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Live Preview — uses CSS variables set by data-accent on documentElement */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            プレビュー
          </p>
          <div
            className="rounded-xl p-4 border"
            style={{
              background: currentColor.glow.replace("0.2)", "0.06)"),
              borderColor: currentColor.glow,
              boxShadow: `0 0 18px ${currentColor.glow}`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: currentColor.glow.replace("0.2)", "0.15)"),
                  border: `1px solid ${currentColor.glow.replace("0.2)", "0.4)")}`,
                }}
              >
                <Palette size={16} style={{ color: currentColor.hex }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">アクセントカラー</p>
                <p className="text-xs" style={{ color: currentColor.hex }}>{currentColor.label}</p>
              </div>
              <div className="ml-auto">
                <span
                  className="text-xs font-medium px-2 py-1 rounded-lg"
                  style={{
                    background: currentColor.glow.replace("0.2)", "0.15)"),
                    color: currentColor.hex,
                    border: `1px solid ${currentColor.glow.replace("0.2)", "0.35)")}`,
                  }}
                >
                  {settings.font_size === "small" ? "小" : settings.font_size === "large" ? "大" : "中"} テキスト
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Accent Color Picker */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-4 uppercase tracking-wider">
            アクセントカラー
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {ACCENT_COLORS.map((color) => {
              const isSelected = settings.accent_color === color.id;
              return (
                <button
                  type="button"
                  key={color.id}
                  onClick={() => handleAccentChange(color.id)}
                  className="flex flex-col items-center gap-1.5 group"
                  title={color.label}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center",
                      isSelected ? "ring-2 ring-offset-2 ring-offset-background scale-110" : "hover:scale-105",
                    )}
                    style={{
                      background: color.hex,
                      boxShadow: isSelected
                        ? `0 0 18px ${color.glow}, 0 0 0 2px #09090d, 0 0 0 4px ${color.hex}`
                        : undefined,
                    }}
                  >
                    {isSelected && <Check size={16} className="text-black/80" strokeWidth={3} />}
                  </div>
                  <span className={cn("text-[10px]", isSelected ? "text-white" : "text-muted-foreground/60")}>
                    {color.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Size */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-4 uppercase tracking-wider">
            フォントサイズ
          </p>
          <div className="flex gap-3">
            {FONT_SIZES.map((size) => {
              const isSelected = settings.font_size === size.id;
              return (
                <button
                  type="button"
                  key={size.id}
                  onClick={() => handleFontSizeChange(size.id)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    isSelected
                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                      : "bg-white/[0.03] text-muted-foreground border-white/[0.06] hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  {size.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggles */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            その他の設定
          </p>

          {/* Sidebar compact */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">コンパクトサイドバー</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">アイコンのみ表示（将来実装予定）</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.sidebar_compact ? "true" : "false"}
              title={settings.sidebar_compact ? "コンパクトサイドバーを無効化" : "コンパクトサイドバーを有効化"}
              onClick={() => handleToggle("sidebar_compact")}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                settings.sidebar_compact ? "bg-cyan-500/60" : "bg-white/[0.1]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  settings.sidebar_compact ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Animations */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">アニメーション</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">UIトランジションとアニメーションを有効化</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.animations_enabled ? "true" : "false"}
              title={settings.animations_enabled ? "アニメーションを無効化" : "アニメーションを有効化"}
              onClick={() => handleToggle("animations_enabled")}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                settings.animations_enabled ? "bg-cyan-500/60" : "bg-white/[0.1]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  settings.animations_enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
