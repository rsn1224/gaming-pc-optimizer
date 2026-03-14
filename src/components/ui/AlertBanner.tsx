/**
 * AlertBanner — dismissible state banner for HomeHub / Dashboard.
 * Replaces the 5 ad-hoc inline banners with inconsistent styles.
 *
 * Variants map to the design token state colors:
 *   error   → red   (score < 50, regression)
 *   warning → amber (score 50–74, session ended)
 *   success → emerald (game launched, optimization done)
 *   info    → cyan
 */
import type { ReactNode } from "react";

export type AlertVariant = "error" | "warning" | "success" | "info";

export interface AlertBannerProps {
  variant: AlertVariant;
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

const STYLES: Record<AlertVariant, { wrap: string; iconWrap: string; action: string }> = {
  error: {
    wrap:     "bg-red-500/10 border-red-500/30 text-red-300",
    iconWrap: "bg-red-500/15 border-red-500/25",
    action:   "bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-300",
  },
  warning: {
    wrap:     "bg-amber-500/10 border-amber-500/25 text-amber-300",
    iconWrap: "bg-amber-500/15 border-amber-500/20",
    action:   "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/25 text-amber-300",
  },
  success: {
    wrap:     "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
    iconWrap: "bg-emerald-500/15 border-emerald-500/20",
    action:   "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/25 text-emerald-300",
  },
  info: {
    wrap:     "bg-cyan-500/10 border-cyan-500/25 text-cyan-300",
    iconWrap: "bg-cyan-500/15 border-cyan-500/20",
    action:   "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/25 text-cyan-300",
  },
};

export function AlertBanner({
  variant,
  icon,
  title,
  detail,
  action,
  onDismiss,
}: AlertBannerProps) {
  const s = STYLES[variant];
  return (
    <div className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${s.wrap}`}>
      <div className={`p-1.5 border rounded-lg shrink-0 ${s.iconWrap}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {detail && (
          <p className="text-xs text-muted-foreground/60 mt-0.5 leading-snug">{detail}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-colors ${s.action}`}
          >
            {action.label} →
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground/50 hover:text-muted-foreground text-xs transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
