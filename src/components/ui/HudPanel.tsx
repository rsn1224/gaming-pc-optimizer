import { cn } from "@/lib/utils";

type HudAccent = "orange" | "cyan" | "emerald" | "amber" | "red" | "violet" | "none";
/** cut prop kept for API compat — visually ignored in Division style */
type HudCut = "cross" | "tr" | "none";

interface HudPanelProps {
  label?: string;
  /** Right-side decal text (e.g. "// MONITORING") */
  labelRight?: string;
  accent?: HudAccent;
  /** @deprecated clip-path removed; kept for compat */
  cut?: HudCut;
  children: React.ReactNode;
  className?: string;
  /** Show 4-corner bracket marks */
  corners?: boolean;
}

const BORDER_CLASS: Record<HudAccent, string> = {
  orange:  "panel-border-orange",
  cyan:    "panel-border-orange",   /* compat → orange */
  emerald: "panel-border-green",
  amber:   "panel-border-amber",
  red:     "panel-border-red",
  violet:  "panel-border-default",
  none:    "panel-border-default",
};

/**
 * Division 2 SHD — Glass AR Panel
 * backdrop-blur glassmorphism / orange corner brackets / HUD header
 */
export function HudPanel({
  label,
  labelRight,
  accent = "none",
  cut: _cut,
  children,
  className,
  corners = false,
}: HudPanelProps) {
  return (
    <div
      className={cn(
        "panel-hud panel-shadow",
        BORDER_CLASS[accent],
        className
      )}
    >
      {/* Corner brackets */}
      {corners && (
        <>
          <span className="bracket bracket-tl" />
          <span className="bracket bracket-tr" />
          <span className="bracket bracket-bl" />
          <span className="bracket bracket-br" />
        </>
      )}

      {/* Header label row */}
      {label && (
        <div className="panel-hud-label">
          <span className="hud-label">{label}</span>
          {labelRight && (
            <span className="ml-auto text-[8px] font-mono text-white/20 tracking-wider select-none">
              {labelRight}
            </span>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
