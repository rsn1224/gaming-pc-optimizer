/**
 * RollbackEntryPoint — 全画面共通の「復元」導線ボタン
 *
 * 任意の画面フッターや実行後カードに配置し、
 * ロールバックセンターへ1クリックで到達できる導線を提供する。
 *
 * [Phase C] UI/IA 再編 Phase C で導入。
 * Phase D で Optimize / Presets / Windows の実行後エリアに組み込む。
 *
 * 使用例:
 *   <RollbackEntryPoint sessionCount={2} />
 *   <RollbackEntryPoint sessionCount={0} compact />
 */

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { useSafetyStore } from "@/stores/useSafetyStore";

interface RollbackEntryPointProps {
  /**
   * 表示する復元可能セッション数。省略時は useSafetyStore から自動取得。
   */
  sessionCount?: number;
  /**
   * compact=true のとき、テキストを省略してアイコン+バッジのみ表示。
   */
  compact?: boolean;
  className?: string;
}

export function RollbackEntryPoint({ sessionCount, compact = false, className }: RollbackEntryPointProps) {
  const { setActivePage } = useAppStore();
  const { sessions } = useSafetyStore();

  const count = sessionCount ?? sessions.filter((s) => s.status === "applied").length;

  return (
    <button
      type="button"
      onClick={() => setActivePage("rollback")}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors",
        className
      )}
      title="復元センターへ"
    >
      <RotateCcw size={12} className="shrink-0" />
      {!compact && <span>復元センター</span>}
      {count > 0 && (
        <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full px-1.5 text-[10px] tabular-nums leading-4">
          {count}
        </span>
      )}
    </button>
  );
}
