import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard, Loader2, Info, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { HotkeyConfig } from "@/types";

type HotkeyKey = keyof HotkeyConfig;

interface HotkeyRow {
  key: HotkeyKey;
  label: string;
  description: string;
}

const ROWS: HotkeyRow[] = [
  { key: "toggle_game_mode", label: "ゲームモード切替", description: "ゲームモードのON/OFFを切り替えます" },
  { key: "open_app", label: "アプリを開く", description: "Gaming PC Optimizerを前面に表示" },
  { key: "quick_clean", label: "クイックメモリクリーン", description: "即座にメモリクリーンを実行" },
  { key: "toggle_overlay", label: "FPSオーバーレイ切替", description: "FPS表示オーバーレイのON/OFF" },
];

const DEFAULT_CONFIG: HotkeyConfig = {
  toggle_game_mode: "Ctrl+Shift+G",
  open_app: "Ctrl+Shift+O",
  quick_clean: "Ctrl+Shift+C",
  toggle_overlay: "Ctrl+Shift+F",
};

// ── Key display chip ──────────────────────────────────────────────────────────

function KeyChip({ combo }: { combo: string }) {
  const parts = combo.split("+");
  return (
    <div className="flex items-center gap-1">
      {parts.map((part, i) => (
        <span key={i} className="px-2 py-0.5 bg-white/[0.07] border border-white/[0.12] rounded-md text-[11px] font-mono font-semibold text-slate-200 shadow-sm">
          {part}
        </span>
      ))}
    </div>
  );
}

// ── Key capture modal ─────────────────────────────────────────────────────────

function KeyCaptureModal({
  label,
  onCapture,
  onCancel,
}: {
  label: string;
  onCapture: (combo: string) => void;
  onCancel: () => void;
}) {
  const [captured, setCaptured] = useState<string>("");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (e.metaKey) mods.push("Meta");

      const ignoreKeys = new Set([
        "Control", "Alt", "Shift", "Meta",
        "CapsLock", "NumLock", "ScrollLock",
      ]);

      if (!ignoreKeys.has(e.key)) {
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        const combo = [...mods, key].join("+");
        setCaptured(combo);
        // Short delay so user sees the captured combo
        setTimeout(() => onCapture(combo), 300);
      }
    },
    [onCapture]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-[#05080c] border border-white/[0.12] rounded-2xl p-8 flex flex-col items-center gap-5 w-80 shadow-2xl">
        <Keyboard size={24} className="text-cyan-400" />
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">新しいショートカットを押してください...</p>
        </div>
        <div className="w-full h-14 bg-white/[0.04] border border-white/[0.12] rounded-xl flex items-center justify-center">
          {captured ? (
            <KeyChip combo={captured} />
          ) : (
            <span className="text-[11px] text-muted-foreground/55 animate-pulse">キー入力待ち...</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-muted-foreground/50 hover:text-slate-300 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

export function HotkeySettings() {
  const [config, setConfig] = useState<HotkeyConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState<HotkeyKey | null>(null);

  useEffect(() => {
    invoke<HotkeyConfig>("get_hotkey_config")
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCapture = (key: HotkeyKey, combo: string) => {
    setConfig((prev) => ({ ...prev, [key]: combo }));
    setCapturing(null);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await invoke("apply_hotkeys", { app: undefined, config });
      toast.success("ホットキー設定を保存しました");
    } catch (e) {
      toast.error("保存に失敗しました: " + String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    toast.info("デフォルトに戻しました。「保存して適用」で確定してください。");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  const capturingRow = ROWS.find((r) => r.key === capturing);

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {capturing && capturingRow && (
        <KeyCaptureModal
          label={capturingRow.label}
          onCapture={(combo) => handleCapture(capturing, combo)}
          onCancel={() => setCapturing(null)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">ホットキー設定</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">グローバルショートカットキーの設定</p>
      </div>

      {/* Hotkey rows */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="divide-y divide-white/[0.04]">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground">{row.label}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{row.description}</p>
              </div>
              <KeyChip combo={config[row.key]} />
              <button
                type="button"
                onClick={() => setCapturing(row.key)}
                className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.09] rounded-lg text-[11px] font-medium text-muted-foreground/70 hover:text-slate-200 hover:bg-white/[0.08] transition-all shrink-0"
              >
                記録
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] border border-white/[0.12] rounded-xl text-[12px] font-medium text-muted-foreground/70 hover:text-slate-200 hover:bg-white/[0.07] transition-all"
        >
          <RotateCcw size={13} />
          デフォルトに戻す
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
            saving
              ? "bg-cyan-500/10 text-cyan-400/50 cursor-not-allowed border border-cyan-500/15"
              : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97]"
          )}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saving ? "保存中..." : "保存して適用"}
        </button>
      </div>

      {/* Note */}
      <div className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
        <Info size={13} className="text-cyan-400/70 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          ショートカットはアプリ起動中のみ有効です。
          グローバルショートカットプラグインは将来のバージョンで有効化されます。
        </p>
      </div>
    </div>
  );
}
