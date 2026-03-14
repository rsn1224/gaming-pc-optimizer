/**
 * BeforeAfterCard — 最適化前後の比較カード
 *
 * RollbackCenter にしかなかった Before/After 比較を、
 * GameMode・Presets の実行後にも表示できる共通コンポーネント。
 *
 * [Phase C] UI/IA 再編 Phase C で導入。
 * Phase D で GameMode / Presets の実行後カードに組み込む。
 */

import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionMetrics } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function DeltaBadge({ delta, unit, lowerIsBetter = true }: { delta: number; unit: string; lowerIsBetter?: boolean }) {
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const neutral  = delta === 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
      neutral  ? "text-muted-foreground/50" :
      improved ? "text-emerald-400" : "text-amber-400"
    )}>
      {!neutral && (improved
        ? <TrendingDown size={11} />
        : <TrendingUp   size={11} />
      )}
      {delta > 0 ? "+" : ""}{unit === "MB" ? fmt(Math.abs(delta)) : `${delta}${unit}`}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({
  label,
  before,
  after,
  delta,
  unit,
  lowerIsBetter,
}: {
  label: string;
  before: string;
  after: string;
  delta: number;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-muted-foreground/70 w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 text-xs tabular-nums">
        <span className="text-muted-foreground/50">{before}</span>
        <ArrowRight size={11} className="text-muted-foreground/30 shrink-0" />
        <span className="text-foreground font-medium">{after}</span>
      </div>
      <DeltaBadge delta={delta} unit={unit} lowerIsBetter={lowerIsBetter} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface BeforeAfterCardProps {
  before: SessionMetrics;
  after: SessionMetrics;
  className?: string;
}

export function BeforeAfterCard({ before, after, className }: BeforeAfterCardProps) {
  const memDelta   = after.memory_used_mb - before.memory_used_mb;
  const procDelta  = after.process_count  - before.process_count;
  const pctDelta   = Math.round(after.memory_percent - before.memory_percent);

  return (
    <div className={cn("bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden", className)}>
      <div className="px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.04]/30">
        <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
          最適化前 → 後
        </p>
      </div>
      <div className="px-4 py-2">
        <Row
          label="使用メモリ"
          before={fmt(before.memory_used_mb)}
          after={fmt(after.memory_used_mb)}
          delta={memDelta}
          unit="MB"
          lowerIsBetter
        />
        <Row
          label="メモリ使用率"
          before={`${before.memory_percent.toFixed(0)}%`}
          after={`${after.memory_percent.toFixed(0)}%`}
          delta={pctDelta}
          unit="%"
          lowerIsBetter
        />
        <Row
          label="プロセス数"
          before={`${before.process_count}`}
          after={`${after.process_count}`}
          delta={procDelta}
          unit="個"
          lowerIsBetter
        />
      </div>
    </div>
  );
}
