import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Monitor,
  Zap,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { WindowsSettings as WS } from "@/types";
import { Toggle } from "@/components/ui/toggle";

// ── SettingRow ──────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ── VisualFXSelector ────────────────────────────────────────────────────────

const VISUAL_FX_OPTIONS = [
  { value: 0, label: "自動" },
  { value: 1, label: "見た目優先" },
  { value: 2, label: "パフォーマンス優先" },
];

function VisualFXSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {VISUAL_FX_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`
            px-3 py-1.5 text-xs rounded-md border transition-all
            ${value === opt.value
              ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-medium"
              : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }
            ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

type ActionStatus = "idle" | "running" | "success" | "error";

export function WindowsSettings() {
  const [settings, setSettings] = useState<WS | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [hasBackup, setHasBackup] = useState(false);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [s, backup] = await Promise.all([
        invoke<WS>("get_windows_settings"),
        invoke<boolean>("has_windows_settings_backup"),
      ]);
      setSettings(s);
      setHasBackup(backup);
    } catch (e) {
      console.error("Failed to load Windows settings:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Individual toggle handlers — optimistic update + backend write
  const handleToggle = async (
    command: string,
    key: keyof WS,
    value: boolean | number
  ) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, [key]: value });
    try {
      await invoke(command, { [key]: value });
    } catch (e) {
      setSettings(prev); // rollback
      console.error(e);
    }
  };

  const handleVisualFX = async (mode: number) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, visual_fx: mode });
    try {
      await invoke("set_visual_fx", { mode });
    } catch (e) {
      setSettings(prev);
    }
  };

  const applyGaming = async () => {
    setActionStatus("running");
    setActionMessage("");
    try {
      const result = await invoke<WS>("apply_gaming_windows_settings");
      setSettings(result);
      setHasBackup(true);
      setActionStatus("success");
      setActionMessage("ゲーミング最適化を適用しました");
    } catch (e) {
      setActionStatus("error");
      setActionMessage(String(e));
    }
  };

  const restoreDefaults = async () => {
    setActionStatus("running");
    setActionMessage("");
    try {
      const result = await invoke<WS>("restore_windows_settings");
      setSettings(result);
      setHasBackup(false);
      setActionStatus("success");
      setActionMessage(
        hasBackup ? "バックアップから復元しました" : "デフォルト値に戻しました"
      );
    } catch (e) {
      setActionStatus("error");
      setActionMessage(String(e));
    }
  };

  const isApplying = actionStatus === "running";

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
          <Monitor className="text-violet-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Windows設定</h1>
          <p className="text-sm text-muted-foreground">
            視覚効果・透明効果・Game DVR のON/OFF
          </p>
        </div>
        {hasBackup && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-medium text-cyan-400">最適化済み</span>
          </div>
        )}
      </div>

      {/* Settings Card */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Zap size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">個別設定</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">読み込み中...</span>
          </div>
        ) : settings ? (
          <div className="divide-y divide-border/50">
            {/* Visual FX */}
            <div className="px-4 py-3">
              <p className="text-sm font-medium mb-1">視覚効果</p>
              <p className="text-xs text-muted-foreground mb-2">
                Windowsのアニメーション・影・フォントスムージング
              </p>
              <VisualFXSelector
                value={settings.visual_fx}
                onChange={handleVisualFX}
                disabled={isApplying}
              />
            </div>

            <SettingRow
              label="透明効果"
              description="タスクバー・スタートメニューの半透明効果"
              checked={settings.transparency}
              onChange={(v) =>
                handleToggle("set_transparency", "transparency", v)
              }
              disabled={isApplying}
            />

            <SettingRow
              label="Game DVR / Xbox Game Bar"
              description="ゲームプレイの録画・スクリーンショット機能"
              checked={settings.game_dvr}
              onChange={(v) => handleToggle("set_game_dvr", "game_dvr", v)}
              disabled={isApplying}
            />

            <SettingRow
              label="ウィンドウアニメーション"
              description="ウィンドウの最小化・最大化アニメーション"
              checked={settings.animate_windows}
              onChange={(v) =>
                handleToggle("set_animate_windows", "animate_windows", v)
              }
              disabled={isApplying}
            />

            {/* Menu Show Delay */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">メニュー表示遅延</p>
                <span className="text-xs font-mono text-cyan-400">
                  {settings.menu_show_delay} ms
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                コンテキストメニューの表示待ち時間（0 = 即時）
              </p>
              <input
                type="range"
                min={0}
                max={400}
                step={50}
                value={settings.menu_show_delay}
                disabled={isApplying}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!settings) return;
                  setSettings({ ...settings, menu_show_delay: v });
                }}
                onMouseUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  invoke("set_menu_show_delay", { delay_ms: v }).catch(
                    console.error
                  );
                }}
                className="w-full accent-cyan-500 disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0 (即時)</span>
                <span>400 (デフォルト)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <XCircle size={16} className="text-destructive" />
            <span className="text-sm">設定の読み込みに失敗しました</span>
          </div>
        )}
      </div>

      {/* Status feedback */}
      <AnimatePresence>
        {actionStatus !== "idle" && actionMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`
              flex items-center gap-2 px-4 py-3 rounded-lg border text-sm
              ${actionStatus === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : actionStatus === "error"
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-secondary border-border text-muted-foreground"
              }
            `}
          >
            {actionStatus === "success" && <CheckCircle2 size={16} />}
            {actionStatus === "error" && <XCircle size={16} />}
            {actionStatus === "running" && (
              <Loader2 size={16} className="animate-spin" />
            )}
            {actionMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={applyGaming}
          disabled={isApplying || !settings}
          className={`
            flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2
            ${isApplying || !settings
              ? "bg-primary/20 text-primary/60 cursor-not-allowed border border-primary/20"
              : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] glow-cyan border border-primary/20"
            }
          `}
        >
          {isApplying ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              適用中...
            </>
          ) : (
            <>
              <Zap size={18} />
              ゲーミング最適化を適用
            </>
          )}
        </button>

        <button
          onClick={restoreDefaults}
          disabled={isApplying || !settings}
          className={`
            px-5 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 border
            ${isApplying || !settings
              ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }
          `}
        >
          <RotateCcw size={16} />
          {hasBackup ? "復元" : "デフォルト"}
        </button>
      </div>
    </div>
  );
}
