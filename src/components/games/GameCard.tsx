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

// ── Mode config ───────────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "competitive", label: "Competitive" },
  { value: "balanced",    label: "Balanced" },
  { value: "quality",     label: "Quality" },
] as const;

const MODE_BADGE_CLASS: Record<string, string> = {
  competitive: "bg-red-500/10 text-red-400 border-red-500/30",
  balanced:    "bg-green-500/10 text-green-400 border-green-500/30",
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
      className={`bg-card border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
        isActive
          ? "border-cyan-500/50 shadow-[0_0_0_1px] shadow-cyan-500/20"
          : "border-border hover:border-primary/30"
      }`}
    >
      {/* Header */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm leading-tight truncate">{profile.name}</p>
          {isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full px-2 py-0.5 shrink-0">
              <Zap size={9} />
              適用中
            </span>
          )}
          <span className="inline-flex items-center text-[10px] bg-secondary border border-border rounded-full px-2 py-0.5 shrink-0 text-muted-foreground">
            {LAUNCHER_LABELS[launcher] ?? launcher}
          </span>
        </div>
        {profile.exe_path && (
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
            {shortPath(profile.exe_path)}
          </p>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">モード</span>
        <select
          aria-label="最適化モードを選択"
          value={profile.recommended_mode ?? ""}
          onChange={(e) => {
            const v = e.target.value as "competitive" | "balanced" | "quality";
            if (v) onModeChange(v);
          }}
          className={`flex-1 appearance-none bg-secondary border rounded-md px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary/60 transition-colors cursor-pointer ${
            profile.recommended_mode
              ? `${MODE_BADGE_CLASS[profile.recommended_mode]} border`
              : "border-amber-500/30 text-amber-400 bg-amber-500/10"
          }`}
        >
          {!profile.recommended_mode && (
            <option value="" disabled>AI未設定</option>
          )}
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-card text-foreground">
              {opt.label}
            </option>
          ))}
        </select>
        {profile.recommended_reason && (
          <span
            className="text-xs text-muted-foreground truncate max-w-[100px] cursor-help"
            title={profile.recommended_reason}
          >
            {profile.recommended_reason}
          </span>
        )}
      </div>

      {/* Tags */}
      {profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 text-[10px] bg-secondary border border-border rounded-full px-2 py-0.5 text-muted-foreground"
            >
              <Tag size={9} />
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Launch button */}
      <button
        type="button"
        onClick={onLaunchOptimize}
        disabled={launching}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 transition-colors font-medium"
      >
        {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {launching ? "起動中…" : profile.exe_path ? "最適化して起動" : "最適化を適用"}
      </button>
    </div>
  );
}
