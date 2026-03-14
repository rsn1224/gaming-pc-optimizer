/** Shared circular progress ring for optimization score display. */

interface HealthRingProps {
  score: number;
  /** Ring diameter in px (default 96) */
  size?: 96 | 112;
}

const SIZE_CONFIG = {
  96:  { cx: 48,  cy: 48,  r: 38, strokeW: 6,  strokeGlow: 10, textSize: "text-2xl", labelSize: "text-[8px]" },
  112: { cx: 56,  cy: 56,  r: 38, strokeW: 7,  strokeGlow: 11, textSize: "text-3xl", labelSize: "text-[10px]" },
} as const;

export function HealthRing({ score, size = 96 }: HealthRingProps) {
  const { cx, cy, r, strokeW, strokeGlow, textSize, labelSize } = SIZE_CONFIG[size];
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const colorClass =
    score >= 75 ? "text-cyan-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor"
          strokeWidth={strokeW} className="text-white/[0.05]" />
        {/* Glow */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor"
          strokeWidth={strokeGlow} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={`${colorClass} opacity-20 blur-[3px]`} />
        {/* Progress */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor"
          strokeWidth={strokeW} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={`${colorClass} [transition:stroke-dasharray_0.8s_ease]`} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`font-bold leading-none tabular-nums ${colorClass} ${textSize}`}>
          {score}
        </span>
        <span className={`text-muted-foreground/50 mt-1 tracking-widest uppercase ${labelSize}`}>
          score
        </span>
      </div>
    </div>
  );
}
