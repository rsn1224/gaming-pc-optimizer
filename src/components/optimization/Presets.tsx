import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Zap,
  Radio,
  Volume2,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useSafetyStore } from "@/stores/useSafetyStore";
import { toast } from "@/stores/useToastStore";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";
import type { PresetInfo, PresetResult } from "@/types";

// ── Preset icon map ────────────────────────────────────────────────────────────

function PresetIcon({ id, size = 20 }: { id: string; size?: number }) {
  switch (id) {
    case "esports":
      return <Zap size={size} />;
    case "streaming":
      return <Radio size={size} />;
    case "quiet":
      return <Volume2 size={size} />;
    default:
      return <Zap size={size} />;
  }
}

// ── Accent colours per preset ─────────────────────────────────────────────────

const ACCENT: Record<string, { bg: string; border: string; icon: string; btn: string; btnHover: string }> = {
  esports: {
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/25",
    icon: "text-cyan-400",
    btn: "bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950",
    btnHover: "hover:brightness-110",
  },
  streaming: {
    bg: "bg-purple-500/8",
    border: "border-purple-500/25",
    icon: "text-purple-400",
    btn: "bg-purple-500/15 border border-purple-500/30 text-purple-300",
    btnHover: "hover:bg-purple-500/25",
  },
  quiet: {
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/25",
    icon: "text-emerald-400",
    btn: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300",
    btnHover: "hover:bg-emerald-500/25",
  },
};

// ── Preset card ────────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  applying,
  lastApplied,
  onApply,
}: {
  preset: PresetInfo;
  applying: string | null;
  lastApplied: string | null;
  onApply: (id: string) => void;
}) {
  const accent = ACCENT[preset.id] ?? ACCENT.esports;
  const isApplying = applying === preset.id;
  const isApplied = lastApplied === preset.id;
  const disabled = applying !== null;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 p-5 rounded-2xl border transition-all",
        accent.bg,
        accent.border,
        isApplied && "ring-1 ring-offset-1 ring-offset-transparent ring-white/10"
      )}
    >
      {/* Applied badge */}
      {isApplied && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
          <CheckCircle2 size={12} />
          適用済み
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            accent.bg,
            "border",
            accent.border
          )}
        >
          <span className={accent.icon}>
            <PresetIcon id={preset.id} size={18} />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-slate-100">
              {preset.name}
            </span>
            <RiskBadge level={preset.risk_level} />
          </div>
          <p className="text-[12px] text-muted-foreground/60 mt-0.5 leading-relaxed">
            {preset.description}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {preset.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] text-muted-foreground/60"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Steps */}
      <ul className="space-y-1.5">
        {preset.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground/70">
            <ChevronRight size={13} className="mt-0.5 shrink-0 text-muted-foreground/55" />
            {step}
          </li>
        ))}
      </ul>

      {/* Apply button */}
      <button
        type="button"
        onClick={() => onApply(preset.id)}
        disabled={disabled}
        className={cn(
          "mt-auto w-full py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all",
          accent.btn,
          !disabled && accent.btnHover,
          disabled && "opacity-40 cursor-not-allowed"
        )}
      >
        {isApplying ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            適用中...
          </>
        ) : (
          <>
            <PresetIcon id={preset.id} size={14} />
            このプリセットを適用
          </>
        )}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function Presets() {
  const { rollbackEnabled } = useSafetyStore();
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PresetResult | null>(null);

  useEffect(() => {
    invoke<PresetInfo[]>("list_presets").then(setPresets).catch(console.error);
  }, []);

  async function handleApply(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;

    const confirmMsg =
      preset.risk_level === "advanced"
        ? `「${preset.name}」を適用します。\nネットワークレジストリも変更されます（管理者権限が必要）。\n続行しますか？`
        : `「${preset.name}」を適用しますか？`;

    if (!window.confirm(confirmMsg)) return;

    setApplying(id);
    try {
      const result = await invoke<PresetResult>("apply_preset", { preset: id });
      setLastResult(result);
      setLastApplied(id);

      const freed = result.process_freed_mb.toFixed(0);
      const errs = result.errors.length;
      if (errs > 0) {
        toast.info(
          `「${preset.name}」適用完了（一部エラー: ${errs}件）— ${freed}MB 解放`
        );
      } else {
        toast.success(
          `「${preset.name}」適用完了 — プロセス停止: ${result.process_killed}件, ${freed}MB 解放`
        );
      }
    } catch (e) {
      toast.error(`プリセット適用失敗: ${e}`);
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Zap size={16} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-slate-100">
                最適化プリセット
              </h1>
              <p className="text-[11px] text-muted-foreground/50">
                用途に合わせてワンクリックで最適化
              </p>
            </div>
          </div>
          <RollbackEntryPoint compact />
        </div>

        {rollbackEnabled && (
          <p className="mt-3 text-[11px] text-muted-foreground/55">
            スナップショット自動作成が有効 — ロールバックセンターから元に戻せます
          </p>
        )}
      </div>

      {/* Preset cards */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-4 max-w-3xl">
          {presets.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              applying={applying}
              lastApplied={lastApplied}
              onApply={handleApply}
            />
          ))}
        </div>

        {/* Last result summary */}
        {lastResult && lastResult.errors.length > 0 && (
          <div className="mt-4 max-w-3xl p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <p className="text-[12px] text-amber-400 font-semibold mb-2">
              一部エラーが発生しました
            </p>
            <ul className="space-y-1">
              {lastResult.errors.map((e, i) => (
                <li key={i} className="text-[11px] text-muted-foreground/60">
                  • {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
