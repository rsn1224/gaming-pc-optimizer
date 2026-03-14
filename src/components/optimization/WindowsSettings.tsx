import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/useAppStore";
import {
  Monitor,
  Zap,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  Brain,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { WindowsSettings as WS, WindowsPreset, AiWindowsRecommendation } from "@/types";
import { Toggle } from "@/components/ui/toggle";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { BUILTIN_WINDOWS_PRESETS } from "@/data/windows_presets";
import { diffWindowsSettings } from "@/lib/windows_diff";

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
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`
            px-3 py-1.5 text-xs rounded-lg border transition-all
            ${value === opt.value
              ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-medium"
              : "bg-white/[0.04] border-white/[0.10] text-muted-foreground hover:text-foreground"
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

// ── Preset Card ─────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  isSelected,
  isCurrent,
  onClick,
}: {
  preset: WindowsPreset;
  isSelected: boolean;
  isCurrent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-left rounded-lg border px-3 py-2.5 transition-all ${
        isSelected
          ? "bg-primary/10 border-primary/40 text-primary"
          : "bg-[#05080c] border-white/[0.12] text-foreground hover:border-primary/30 hover:bg-white/[0.04]/50"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-semibold leading-tight">{preset.label}</p>
        {isCurrent && !isSelected && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">現在</span>
        )}
        {isSelected && !isCurrent && (
          <ChevronRight size={12} className="text-primary shrink-0" />
        )}
        {isSelected && isCurrent && (
          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
        {preset.description}
      </p>
    </button>
  );
}

// ── Diff Table ───────────────────────────────────────────────────────────────

function DiffTable({ diff }: { diff: ReturnType<typeof diffWindowsSettings> }) {
  if (!diff.hasChanges) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-400 px-1">
        <CheckCircle2 size={14} />
        現在の設定と同じです
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/[0.10] overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.04]/50 border-b border-white/[0.08]">
          <tr>
            <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">設定項目</th>
            <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">現在</th>
            <th className="px-3 py-1.5 text-center text-muted-foreground font-medium w-6">→</th>
            <th className="px-3 py-1.5 text-left text-primary font-medium">変更後</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {diff.items.map((item) => (
            <tr key={item.key}>
              <td className="px-3 py-2 font-medium">{item.label}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.before}</td>
              <td className="px-3 py-2 text-center text-muted-foreground/50">→</td>
              <td className="px-3 py-2 text-primary font-medium">{item.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

type ActionStatus = "idle" | "running" | "success" | "error";

export function WindowsSettings() {
  const { hasApiKey } = useAppStore();
  const [settings, setSettings] = useState<WS | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [hasBackup, setHasBackup] = useState(false);

  // Preset state
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiRec, setAiRec] = useState<AiWindowsRecommendation | null>(null);
  const [aiError, setAiError] = useState("");

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

  // Detect which preset currently matches live settings
  const currentPresetId = useMemo(() => {
    if (!settings) return null;
    for (const p of BUILTIN_WINDOWS_PRESETS) {
      const s = p.settings;
      if (
        s.visual_fx === settings.visual_fx &&
        s.transparency === settings.transparency &&
        s.game_dvr === settings.game_dvr &&
        s.menu_show_delay === settings.menu_show_delay &&
        s.animate_windows === settings.animate_windows
      ) {
        return p.id;
      }
    }
    return null;
  }, [settings]);

  const selectedPreset = useMemo(
    () => BUILTIN_WINDOWS_PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId]
  );

  const diff = useMemo(() => {
    if (!settings || !selectedPreset) return null;
    return diffWindowsSettings(settings, selectedPreset.settings);
  }, [settings, selectedPreset]);

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
      setSettings(prev);
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

  // Apply selected preset via single Rust call
  const applyPreset = async () => {
    if (!selectedPreset) return;
    setActionStatus("running");
    setActionMessage("");
    try {
      const result = await invoke<WS>("apply_windows_preset", {
        settings: selectedPreset.settings,
      });
      setSettings(result);
      setHasBackup(true);
      setActionStatus("success");
      setActionMessage(`「${selectedPreset.label}」プリセットを適用しました`);
      setSelectedPresetId(null);
    } catch (e) {
      setActionStatus("error");
      setActionMessage(String(e));
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

  const handleAiRecommend = async () => {
    setIsAiLoading(true);
    setAiRec(null);
    setAiError("");
    try {
      const rec = await invoke<AiWindowsRecommendation>("get_ai_windows_recommendation");
      setAiRec(rec);
      setSelectedPresetId(rec.preset_id);
    } catch (e) {
      setAiError(String(e));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopyContext = async () => {
    try {
      const json = await invoke<string>("export_windows_settings_context");
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const isApplying = actionStatus === "running";

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/30 rounded-xl shadow-[0_0_12px_rgba(139,92,246,0.1)]">
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

      {/* Preset Selector */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-violet-400" />
            <span className="text-sm font-semibold">プリセット</span>
            {currentPresetId && (
              <span className="text-[11px] text-muted-foreground/70">
                — 現在:{" "}
                {BUILTIN_WINDOWS_PRESETS.find((p) => p.id === currentPresetId)?.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAiRecommend}
              disabled={isLoading || isAiLoading || actionStatus === "running" || !hasApiKey}
              title={!hasApiKey ? "設定ページでAPIキーを登録してください" : undefined}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border rounded-lg transition-colors disabled:opacity-40
                ${isAiLoading
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                  : "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                }`}
            >
              {isAiLoading ? <Loader2 size={11} className="animate-spin" /> : <Brain size={11} />}
              {isAiLoading ? "AI分析中..." : "AIに推奨してもらう"}
            </button>
            <button
              type="button"
              onClick={handleCopyContext}
              disabled={isLoading}
              title="AIでプリセットを生成するためのコンテキストJSONをコピー"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-white/[0.10] hover:border-muted-foreground rounded-lg transition-colors disabled:opacity-40"
            >
              {copied ? (
                <Check size={11} className="text-emerald-400" />
              ) : (
                <Copy size={11} />
              )}
              {copied ? "コピー済み" : "コンテキストをコピー"}
            </button>
          </div>
        </div>

        <div className="p-3 flex gap-2">
          {BUILTIN_WINDOWS_PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              isCurrent={currentPresetId === preset.id}
              onClick={() =>
                setSelectedPresetId((prev) =>
                  prev === preset.id ? null : preset.id
                )
              }
            />
          ))}
        </div>

        {/* AI error */}
        {aiError && (
          <p className="mx-3 mb-1 text-xs text-destructive flex items-center gap-1">
            <XCircle size={11} /> {aiError}
          </p>
        )}

        {/* AI recommendation banner */}
        {aiRec && !aiError && (
          <div className="mx-3 mb-2 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-start gap-2">
            <Brain size={12} className="text-purple-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[11px] font-semibold text-purple-300">AI推奨: {BUILTIN_WINDOWS_PRESETS.find((p) => p.id === aiRec.preset_id)?.label}</p>
                {aiRec.confidence > 0 && <ConfidenceBadge confidence={aiRec.confidence} />}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{aiRec.explanation}</p>
            </div>
          </div>
        )}

        {/* Diff preview + explanation + apply */}
        <AnimatePresence>
          {selectedPreset && diff && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="px-4 py-3 flex flex-col gap-3">
                <DiffTable diff={diff} />
                {selectedPreset.explanation && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedPreset.explanation}
                  </p>
                )}
                {diff.hasChanges && (
                  <button
                    type="button"
                    onClick={applyPreset}
                    disabled={isApplying}
                    className="self-start flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {isApplying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Zap size={14} />
                    )}
                    「{selectedPreset.label}」を適用
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Individual Settings Card */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-2">
          <Zap size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">個別設定</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">読み込み中...</span>
          </div>
        ) : settings ? (
          <div className="divide-y divide-white/[0.05]">
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
              onChange={(v) => handleToggle("set_transparency", "transparency", v)}
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
                aria-label="メニュー表示遅延"
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
                  invoke("set_menu_show_delay", { delay_ms: v }).catch(console.error);
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
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : actionStatus === "error"
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-white/[0.04] border-white/[0.10] text-muted-foreground"
              }
            `}
          >
            {actionStatus === "success" && <CheckCircle2 size={16} />}
            {actionStatus === "error" && <XCircle size={16} />}
            {actionStatus === "running" && <Loader2 size={16} className="animate-spin" />}
            {actionMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
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
          type="button"
          onClick={restoreDefaults}
          disabled={isApplying || !settings}
          className={`
            px-5 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 border
            ${isApplying || !settings
              ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
              : "border-white/[0.10] text-muted-foreground hover:text-foreground hover:border-white/[0.20]"
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
