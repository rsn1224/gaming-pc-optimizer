import { Loader2, Play, Tag, Zap } from "lucide-react";
import type { GameProfile } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function detectLauncher(exePath: string): "steam" | "epic" | "battlenet" | "custom" {
  const lower = exePath.toLowerCase();
  if (lower.includes("steam")) return "steam";
  if (lower.includes("epic games")) return "epic";
  if (lower.includes("battle.net") || lower.includes("battlenet")) return "battlenet";
  return "custom";
}

function shortPath(exePath: string): string {
  const parts = exePath.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : exePath;
}

const LAUNCHER_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic",
  battlenet: "Battle.net",
  custom: "カスタム",
};

const LAUNCHER_COLORS: Record<string, string> = {
  steam:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  epic:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  battlenet: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  custom:    "bg-white/[0.06] text-muted-foreground border-white/10",
};

// ── Mode config ───────────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "competitive", label: "Competitive" },
  { value: "balanced",    label: "Balanced" },
  { value: "quality",     label: "Quality" },
] as const;

const MODE_BADGE_CLASS: Record<string, string> = {
  competitive: "bg-red-500/10 text-red-400 border-red-500/30",
  balanced:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  quality:     "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface GameCardProps {
  profile: GameProfile;
  isActive: boolean;
  launching: boolean;
  onLaunchOptimize: () => void;
  onModeChange: (mode: "competitive" | "balanced" | "quality") => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GameCard({
  profile,
  isActive,
  launching,
  onLaunchOptimize,
  onModeChange,
}: GameCardProps) {
  const launcher =
    profile.launcher ?? (profile.exe_path ? detectLauncher(profile.exe_path) : "custom");

  return (
    <div
      className={`bg-[#05080c] border rounded-xl overflow-hidden flex flex-col transition-all ${
        isActive
          ? "card-active-border"
          : "border-white/[0.08] hover:border-cyan-500/30 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.15),0_4px_20px_rgba(34,211,238,0.05)]"
      }`}
    >
      {/* Top accent line */}
      <div className={`h-[1px] ${isActive ? "bg-gradient-to-r from-cyan-500/50 via-emerald-500/50 to-transparent" : "bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"}`} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header: title + launcher badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate text-foreground">{profile.name}</p>
            {profile.exe_path && (
              <p className="text-[10px] text-muted-foreground/40 font-mono truncate mt-0.5">
                {shortPath(profile.exe_path)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full px-2 py-0.5 shrink-0">
                <Zap size={9} />
                適用中
              </span>
            )}
            <span className={`inline-flex items-center text-[10px] border rounded-full px-2 py-0.5 shrink-0 ${LAUNCHER_COLORS[launcher] ?? LAUNCHER_COLORS.custom}`}>
              {LAUNCHER_LABELS[launcher] ?? launcher}
            </span>
          </div>
        </div>

        {/* Middle: mode selector + tags */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/50 shrink-0 uppercase tracking-wider">モード</span>
            <select
              aria-label="最適化モードを選択"
              value={profile.recommended_mode ?? ""}
              onChange={(e) => {
                const v = e.target.value as "competitive" | "balanced" | "quality";
                if (v) onModeChange(v);
              }}
              className={`flex-1 appearance-none bg-[#07090e] border rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary/60 transition-colors cursor-pointer ${
                profile.recommended_mode
                  ? `${MODE_BADGE_CLASS[profile.recommended_mode]} border`
                  : "border-amber-500/25 text-amber-400/80 bg-amber-500/8"
              }`}
            >
              {!profile.recommended_mode && (
                <option value="" disabled>AI未設定</option>
              )}
              {MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#05080c] text-foreground">
                  {opt.label}
                </option>
              ))}
            </select>
            {profile.recommended_reason && (
              <span
                className="text-[10px] text-muted-foreground/40 truncate max-w-[80px] cursor-help"
                title={profile.recommended_reason}
              >
                {profile.recommended_reason}
              </span>
            )}
          </div>

          {profile.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {profile.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[10px] bg-white/[0.04] border border-white/[0.07] rounded-full px-2 py-0.5 text-muted-foreground/60"
                >
                  <Tag size={9} />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full-width launch button — solid gradient */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onLaunchOptimize}
          disabled={launching}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
        >
          {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {launching ? "起動中…" : profile.exe_path ? "最適化して起動" : "最適化を適用"}
        </button>
      </div>
    </div>
  );
}
