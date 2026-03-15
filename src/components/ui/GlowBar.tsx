import { cn } from "@/lib/utils";

type BarAccent = "orange" | "cyan" | "green" | "amber" | "red";

interface GlowBarProps {
  value: number;
  max?: number;
  accent?: BarAccent;
  /** bar height in px */
  height?: number;
  className?: string;
  label?: string;
  showPct?: boolean;
  /** Animate glow when value > 0 */
  glow?: boolean;
}

/**
 * Division 2 progress bar — sharp edges, orange glow
 */
export function GlowBar({
  value,
  max = 100,
  accent = "orange",
  height = 4,
  className,
  label,
  showPct = false,
  glow = false,
}: GlowBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  /* cyan → orange compat */
  const resolvedAccent = accent === "cyan" ? "orange" : accent;

  /* Map numeric height to Tailwind class — avoids inline style */
  const heightClass =
    height <= 2 ? "h-0.5"
    : height <= 4 ? "h-1"
    : height <= 6 ? "h-1.5"
    : "h-2";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="hud-label">{label}</span>
          {showPct && (
            <span className="text-[10px] font-mono tabular-nums text-white/50 tracking-wider">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div className={cn("progress-track w-full", heightClass)}>
        <div
          className={cn(
            "progress-fill",
            `progress-fill-${resolvedAccent}`,
            glow && pct > 0 && "animate-glow-pulse"
          )}
          ref={(el) => { if (el) el.style.width = `${pct}%`; }}
        />
      </div>
    </div>
  );
}
