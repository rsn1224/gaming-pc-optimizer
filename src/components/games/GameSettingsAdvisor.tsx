import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lightbulb, Loader2, Search, Zap, Target, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import type { GameSettingsAdvice } from "@/types";

// ── Preset accent colors ──────────────────────────────────────────────────────

function presetColor(preset: string) {
  switch (preset) {
    case "最高": return { badge: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300", dot: "bg-cyan-400" };
    case "高":   return { badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" };
    case "中":   return { badge: "bg-amber-500/15 border-amber-500/30 text-amber-300", dot: "bg-amber-400" };
    default:     return { badge: "bg-red-500/15 border-red-500/30 text-red-300", dot: "bg-red-400" };
  }
}

// ── Popular games quick-pick ──────────────────────────────────────────────────

const POPULAR_GAMES = [
  "Apex Legends", "VALORANT", "Counter-Strike 2", "Fortnite",
  "Elden Ring", "Cyberpunk 2077", "Red Dead Redemption 2", "Microsoft Flight Simulator",
];

// ── Main component ────────────────────────────────────────────────────────────

export function GameSettingsAdvisor() {
  const [gameName, setGameName] = useState("");
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<GameSettingsAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGetAdvice(name?: string) {
    const target = (name ?? gameName).trim();
    if (!target) return;
    if (name) setGameName(name);
    setLoading(true);
    setError(null);
    setAdvice(null);
    try {
      const result = await invoke<GameSettingsAdvice>("get_game_settings_advice", {
        gameName: target,
      });
      setAdvice(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const pc = advice ? presetColor(advice.overall_preset) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Lightbulb size={16} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-100">
              ゲーム設定アドバイザー
            </h1>
            <p className="text-[11px] text-muted-foreground/50">
              AIがあなたのスペックに合ったグラフィック設定を提案
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-4 flex gap-2">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGetAdvice()}
              placeholder="ゲーム名を入力... (例: Apex Legends)"
              className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-amber-500/40 focus:bg-white/[0.06] transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => handleGetAdvice()}
            disabled={!gameName.trim() || loading}
            className={cn(
              "px-4 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 transition-all shrink-0",
              gameName.trim() && !loading
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:brightness-110"
                : "bg-white/[0.04] border border-white/[0.08] text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Lightbulb size={13} />
            )}
            {loading ? "分析中..." : "アドバイス取得"}
          </button>
        </div>

        {/* Quick picks */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {POPULAR_GAMES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => handleGetAdvice(g)}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/[0.06] hover:border-white/[0.12] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground/50">
            <Loader2 size={24} className="animate-spin text-amber-400" />
            <p className="text-[13px]">AIが最適な設定を分析中...</p>
          </div>
        )}

        {/* Results */}
        {advice && pc && !loading && (
          <div className="flex flex-col gap-4 max-w-2xl">
            {/* Summary card */}
            <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#05080c]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[16px] font-bold text-slate-100">{advice.game_name}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn("px-2.5 py-1 rounded-lg border text-[12px] font-bold", pc.badge)}>
                      {advice.overall_preset} 設定
                    </span>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[12px] text-muted-foreground/70">
                      <Target size={11} />
                      目標 {advice.target_fps} FPS
                    </span>
                    <ConfidenceBadge confidence={advice.confidence} />
                  </div>
                </div>
                <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", pc.badge)}>
                  <SlidersHorizontal size={18} />
                </div>
              </div>

              {advice.notes && (
                <p className="mt-3 text-[12px] text-muted-foreground/60 leading-relaxed border-t border-white/[0.05] pt-3">
                  {advice.notes}
                </p>
              )}
            </div>

            {/* Settings table */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#05080c] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
                <Zap size={13} className="text-amber-400" />
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                  推奨設定一覧
                </p>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {advice.settings.map((item, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wide">
                        {item.category}
                      </p>
                      <p className="text-[13px] font-bold text-slate-100 mt-0.5">
                        {item.recommended}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[55%] text-right">
                      {item.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!advice && !loading && !error && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground/40">
            <Lightbulb size={32} />
            <p className="text-[13px]">ゲーム名を入力してアドバイスを取得</p>
          </div>
        )}
      </div>
    </div>
  );
}
