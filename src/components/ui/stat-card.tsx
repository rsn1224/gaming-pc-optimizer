import { cn, getUsageColor } from "@/lib/utils";
import { ProgressBar } from "./progress-bar";

interface StatCardProps {
  label: string;
  value: number;
  unit?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, unit = "%", subtitle, icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden flex flex-col card-glow",
        className
      )}
    >
      <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && <span className="text-cyan-400">{icon}</span>}
            <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">{label}</span>
          </div>
          <span className={cn("text-2xl font-bold tabular-nums", getUsageColor(value))}>
            {value.toFixed(1)}{unit}
          </span>
        </div>
        <ProgressBar value={value} />
        {subtitle && (
          <p className="text-xs text-muted-foreground/50 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
