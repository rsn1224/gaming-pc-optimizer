/**
 * RiskSummary — safe/caution/advanced 件数の3色サマリー行
 *
 * SimulationPanel、Profiles の ApplyPreviewModal、GlobalRollbackHeader tooltip
 * など複数箇所で使われる共通コンポーネント。
 */

import { Shield, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskSummaryProps {
  safe: number;
  caution: number;
  advanced: number;
  /** ゼロ件時に表示するテキスト。falsy の場合は何も表示しない */
  emptyLabel?: string;
  className?: string;
}

export function RiskSummary({ safe, caution, advanced, emptyLabel, className }: RiskSummaryProps) {
  const total = safe + caution + advanced;

  if (total === 0) {
    if (!emptyLabel) return null;
    return (
      <span className={cn("text-xs text-muted-foreground/50", className)}>
        {emptyLabel}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 text-[12px]", className)}>
      {safe > 0 && (
        <span className="flex items-center gap-1.5 text-emerald-400">
          <Shield size={12} />
          安全 {safe}件
        </span>
      )}
      {caution > 0 && (
        <span className="flex items-center gap-1.5 text-amber-400">
          <AlertTriangle size={12} />
          注意 {caution}件
        </span>
      )}
      {advanced > 0 && (
        <span className="flex items-center gap-1.5 text-red-400">
          <ShieldAlert size={12} />
          上級 {advanced}件
        </span>
      )}
    </div>
  );
}
