import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";
import { RiskBadge } from "@/components/ui/RiskBadge";
import type { RegTweak, RegTweakResult } from "@/types";
import { DatabaseZap, RefreshCw, Zap, RotateCcw, AlertTriangle } from "lucide-react";

type CategoryFilter = "all" | "gaming" | "network" | "system" | "visual";
type RiskFilter = "all" | "safe" | "caution" | "advanced";

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "すべて",
  gaming: "ゲーム",
  network: "ネットワーク",
  system: "システム",
  visual: "ビジュアル",
};

const RISK_LABELS: Record<RiskFilter, string> = {
  all: "すべて",
  safe: "安全",
  caution: "注意",
  advanced: "上級",
};


export function RegistryOptimizer() {
  const [tweaks, setTweaks] = useState<RegTweak[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

  const loadTweaks = async () => {
    setLoading(true);
    try {
      const result = await invoke<RegTweak[]>("get_registry_tweaks");
      setTweaks(result);
    } catch (e) {
      toast.error(`読み込み失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTweaks();
  }, []);

  const handleApply = async (tweak: RegTweak) => {
    setApplying(tweak.id);
    try {
      await invoke("apply_registry_tweak", { id: tweak.id });
      toast.success(`適用完了: ${tweak.name} を適用しました`);
      await loadTweaks();
    } catch (e) {
      toast.error(`適用失敗: ${String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  const handleRevert = async (tweak: RegTweak) => {
    setApplying(tweak.id);
    try {
      await invoke("revert_registry_tweak", { id: tweak.id });
      toast.success(`元に戻しました: ${tweak.name} をデフォルトに戻しました`);
      await loadTweaks();
    } catch (e) {
      toast.error(`復元失敗: ${String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  const handleApplyAllSafe = async () => {
    setBulkApplying(true);
    try {
      const result = await invoke<RegTweakResult>("apply_all_safe_tweaks");
      toast.success(`一括適用完了: ${result.applied.length} 件適用 / ${result.failed.length} 件失敗`);
      await loadTweaks();
    } catch (e) {
      toast.error(`一括適用失敗: ${String(e)}`);
    } finally {
      setBulkApplying(false);
    }
  };

  const filtered = tweaks.filter((t) => {
    const catOk = categoryFilter === "all" || t.category === categoryFilter;
    const riskOk = riskFilter === "all" || t.risk_level === riskFilter;
    return catOk && riskOk;
  });

  const appliedCount = tweaks.filter((t) => t.is_applied).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <DatabaseZap size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">レジストリ最適化</h1>
          <span className="text-xs text-muted-foreground bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-lg">
            {appliedCount} / {tweaks.length} 項目適用済み
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTweaks}
            disabled={loading}
            title="再読み込み"
            className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-all"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={handleApplyAllSafe}
            disabled={bulkApplying || loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-xl text-cyan-300 text-sm font-medium transition-all disabled:opacity-50"
          >
            <Zap size={14} />
            {bulkApplying ? "適用中..." : "安全な設定をすべて適用"}
          </button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
        <AlertTriangle size={14} className="shrink-0" />
        変更には再起動が必要な場合があります。重要な設定を変更する前にバックアップをお勧めします。
      </div>

      {/* Filters */}
      <div className="px-6 pt-4 flex flex-col gap-3">
        {/* Category tabs */}
        <div className="flex gap-1">
          {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                categoryFilter === cat
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "text-muted-foreground hover:text-slate-200 hover:bg-white/[0.04]"
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        {/* Risk filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">リスク:</span>
          <div className="flex gap-1">
            {(Object.keys(RISK_LABELS) as RiskFilter[]).map((risk) => (
              <button
                key={risk}
                type="button"
                onClick={() => setRiskFilter(risk)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                  riskFilter === risk
                    ? "bg-white/[0.08] text-white border border-white/[0.12]"
                    : "text-muted-foreground hover:text-slate-200 hover:bg-white/[0.04]"
                )}
              >
                {RISK_LABELS[risk]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tweak list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            読み込み中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            該当する項目がありません
          </div>
        ) : (
          filtered.map((tweak) => (
            <div
              key={tweak.id}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-start gap-4"
            >
              {/* Applied indicator */}
              <div
                className={cn(
                  "mt-0.5 w-2 h-2 rounded-full shrink-0",
                  tweak.is_applied
                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                    : "bg-white/20"
                )}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white">{tweak.name}</span>
                  <RiskBadge level={tweak.risk_level} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tweak.description}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono bg-white/[0.04] px-1.5 py-0.5 rounded">
                    現在: {tweak.current_value}
                  </span>
                  <span>→</span>
                  <span className="font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                    推奨: {tweak.recommended_value}
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                {tweak.is_applied ? (
                  <button
                    type="button"
                    onClick={() => handleRevert(tweak)}
                    disabled={applying === tweak.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] rounded-xl text-muted-foreground text-xs font-medium transition-all disabled:opacity-50"
                  >
                    <RotateCcw size={12} />
                    {applying === tweak.id ? "処理中..." : "元に戻す"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApply(tweak)}
                    disabled={applying === tweak.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-xl text-cyan-300 text-xs font-medium transition-all disabled:opacity-50"
                  >
                    <Zap size={12} />
                    {applying === tweak.id ? "適用中..." : "適用"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
