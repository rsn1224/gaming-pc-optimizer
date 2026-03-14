/**
 * PerformanceCoach — セッション後 AI コーチングモーダル (S10-02)
 *
 * 呼び出し方:
 *   <PerformanceCoach sessionId="..." gameName="..." onClose={() => ...} />
 *
 * フロー:
 *   mount → generate_performance_coaching(session_id) → レポート表示
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X, Loader2, Bot, Star, TrendingUp, TrendingDown,
  CheckCircle2, AlertTriangle, Lightbulb, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PerformanceCoachReport } from "@/types";

// ── Star rating ───────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={cn(
            n <= rating ? "text-amber-400 fill-amber-400" : "text-white/20"
          )}
        />
      ))}
    </div>
  );
}

// ── Score delta badge ─────────────────────────────────────────────────────────

function ScoreDelta({ before, after, delta }: { before: number; after: number; delta: number }) {
  const color = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground/50";
  const Icon  = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <div className="flex items-center gap-3">
      <div className="text-center">
        <p className="text-[10px] text-muted-foreground/50 mb-0.5">Before</p>
        <p className="text-2xl font-bold tabular-nums text-slate-300">{before}</p>
      </div>
      <div className={cn("flex flex-col items-center gap-0.5", color)}>
        <Icon size={16} />
        <span className="text-xs font-bold tabular-nums">{delta > 0 ? "+" : ""}{delta}</span>
      </div>
      <div className="text-center">
        <p className="text-[10px] text-muted-foreground/50 mb-0.5">After</p>
        <p className={cn("text-2xl font-bold tabular-nums",
          after >= 80 ? "text-emerald-400" : after >= 60 ? "text-amber-400" : "text-red-400"
        )}>{after}</p>
      </div>
    </div>
  );
}

// ── List section ─────────────────────────────────────────────────────────────

function ReportSection({ icon, label, items, color }: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  color: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={cn("flex items-center gap-2 mb-2 text-xs font-semibold", color)}>
        {icon}
        {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground/70">
            <span className={cn("mt-0.5 shrink-0 text-[10px]", color)}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PerformanceCoachProps {
  sessionId: string;
  gameName: string;
  scoreBefore?: number | null;
  scoreAfter?: number;
  durationMinutes?: number | null;
  onClose: () => void;
}

export function PerformanceCoach({
  sessionId, gameName, scoreBefore, scoreAfter, durationMinutes, onClose,
}: PerformanceCoachProps) {
  const [report, setReport] = useState<PerformanceCoachReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<PerformanceCoachReport>("generate_performance_coaching", { sessionId })
      .then(setReport)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const r = report;
  const displayBefore = r?.score_before ?? scoreBefore ?? 0;
  const displayAfter  = r?.score_after  ?? scoreAfter  ?? 0;
  const displayDelta  = r?.score_delta  ?? (displayAfter - displayBefore);
  const displayDuration = r?.duration_minutes ?? durationMinutes;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-[#05080c] border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.8)] max-h-[90vh] flex flex-col">
        {/* Top accent */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-amber-500/60 to-transparent shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/15 border border-amber-500/25 rounded-xl">
              <Bot size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">パフォーマンスコーチ</h2>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5 truncate max-w-[260px]">
                {gameName}
                {displayDuration != null && (
                  <span className="ml-1.5 text-muted-foreground/40">· {displayDuration}分</span>
                )}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"
            className="text-muted-foreground/40 hover:text-white transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 size={28} className="text-amber-400 animate-spin" />
              <p className="text-sm text-muted-foreground/60">AI がセッションを分析中...</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-2.5 p-4 bg-red-500/8 border border-red-500/20 rounded-xl">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">分析に失敗しました</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  AI API キーが設定されていることを確認してください（設定 → AI 設定）。
                </p>
              </div>
            </div>
          )}

          {/* Report */}
          {!loading && r && (
            <>
              {/* Score delta + rating */}
              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                <ScoreDelta before={displayBefore} after={displayAfter} delta={displayDelta} />
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground/50 mb-1">総合評価</p>
                  <StarRating rating={r.rating} />
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/8 border border-amber-500/15 rounded-xl">
                <Bot size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground/80 leading-relaxed">{r.summary}</p>
              </div>

              {/* Achievements */}
              <ReportSection
                icon={<CheckCircle2 size={12} />}
                label="良かった点"
                items={r.achievements}
                color="text-emerald-400"
              />

              {/* Improvements */}
              <ReportSection
                icon={<AlertTriangle size={12} />}
                label="改善できる点"
                items={r.improvements}
                color="text-amber-400"
              />

              {/* Next tips */}
              <ReportSection
                icon={<Lightbulb size={12} />}
                label="次セッション前のヒント"
                items={r.next_tips}
                color="text-cyan-400"
              />
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="px-6 pb-5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold bg-gradient-to-r from-amber-500/80 to-cyan-500/80 hover:from-amber-500 hover:to-cyan-500 text-slate-950 rounded-xl transition-all active:scale-[0.97]"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
