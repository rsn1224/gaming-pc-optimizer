import { cn, getUsageBarColor } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
  showLabel?: boolean;
  colorByValue?: boolean;
  color?: string;
}

export function ProgressBar({
  value,
  className,
  showLabel = true,
  colorByValue = true,
  color,
}: ProgressBarProps) {
  const barColor = color ?? (colorByValue ? getUsageBarColor(value) : "bg-cyan-500");
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
          {clamped.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
