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
        "bg-card border border-border rounded-lg p-4 flex flex-col gap-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-cyan-400">{icon}</span>}
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <span className={cn("text-2xl font-bold tabular-nums", getUsageColor(value))}>
          {value.toFixed(1)}{unit}
        </span>
      </div>
      <ProgressBar value={value} />
      {subtitle && (
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      )}
    </div>
  );
}
