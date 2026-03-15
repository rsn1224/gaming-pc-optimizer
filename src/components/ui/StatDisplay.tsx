import { cn } from "@/lib/utils";

type StatAccent = "orange" | "cyan" | "green" | "amber" | "red" | "white" | "ar";
type StatSize   = "xs" | "sm" | "md" | "lg" | "xl";

interface StatDisplayProps {
  value: string | number;
  unit?: string;
  label?: string;
  accent?: StatAccent;
  size?: StatSize;
  className?: string;
  /** Pulse animation on the number */
  live?: boolean;
}

/**
 * Division 2 display scale:
 * xl: 56px / font-light — hero metric
 * lg: 32px / font-light — section metric
 * Values use AR-tinted near-white for hologram feel
 */
const SIZE_MAP: Record<StatSize, string> = {
  xs: "text-sm font-medium",
  sm: "text-base font-normal",
  md: "text-xl font-light",
  lg: "text-[32px] font-light tracking-tight",
  xl: "text-[56px] font-light tracking-tight",
};

const ACCENT_MAP: Record<StatAccent, string> = {
  orange: "text-orange-400 text-glow-orange",
  cyan:   "text-orange-400 text-glow-orange",   /* compat */
  green:  "text-emerald-400 text-glow-green",
  amber:  "text-amber-300 text-glow-amber",
  red:    "text-red-400 text-glow-red",
  white:  "text-white/85",
  ar:     "text-ar-data",   /* rgba(255,235,210,0.90) — AR hologram white */
};

export function StatDisplay({
  value,
  unit,
  label,
  accent = "ar",
  size = "md",
  className,
  live = false,
}: StatDisplayProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {label && (
        <span className="hud-label">{label}</span>
      )}
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "stat-number",
            SIZE_MAP[size],
            ACCENT_MAP[accent],
            live && "animate-status-tick"
          )}
        >
          {value}
        </span>
        {unit && (
          <span className={cn(
            "font-light text-white/35 uppercase tracking-wider",
            size === "xl" ? "text-sm"
            : size === "lg" ? "text-xs"
            : "text-[10px]"
          )}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
