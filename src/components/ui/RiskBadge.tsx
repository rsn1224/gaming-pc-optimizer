import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types";

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

const CONFIG: Record<RiskLevel, { label: string; classes: string }> = {
  safe: {
    label: "安全",
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  caution: {
    label: "注意",
    classes: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  advanced: {
    label: "上級",
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

export function RiskBadge({ level, className }: RiskBadgeProps) {
  const { label, classes } = CONFIG[level];
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide",
        classes,
        className
      )}
    >
      {label}
    </span>
  );
}
