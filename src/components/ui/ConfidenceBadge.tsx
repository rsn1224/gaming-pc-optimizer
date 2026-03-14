import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  confidence: number; // 0–100
  showLabel?: boolean;
  className?: string;
}

function confidenceColor(c: number) {
  if (c >= 80) return { dot: "bg-emerald-400", text: "text-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/8" };
  if (c >= 60) return { dot: "bg-amber-400",   text: "text-amber-400",   ring: "border-amber-500/30 bg-amber-500/8"   };
  return             { dot: "bg-red-400",       text: "text-red-400",     ring: "border-red-500/30 bg-red-500/8"       };
}

function confidenceLabel(c: number) {
  if (c >= 80) return "高信頼";
  if (c >= 60) return "中信頼";
  return "低信頼";
}

export function ConfidenceBadge({ confidence, showLabel = true, className }: ConfidenceBadgeProps) {
  const c = Math.max(0, Math.min(100, Math.round(confidence)));
  const { dot, text, ring } = confidenceColor(c);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold leading-none",
        ring,
        className
      )}
      title={`AI信頼度: ${c}%`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      <span className={text}>{c}%</span>
      {showLabel && <span className={cn("opacity-70", text)}>{confidenceLabel(c)}</span>}
    </span>
  );
}
