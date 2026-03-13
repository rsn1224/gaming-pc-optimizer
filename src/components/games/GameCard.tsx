import { Loader2, Pencil, Play, Tag, Zap } from "lucide-react";
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
  // Show only last 2 path segments to keep the card compact
  const parts = exePath.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : exePath;
}

const LAUNCHER_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic",
  battlenet: "Battle.net",
  custom: "カスタム",
};

const MODE_CONFIG: Record<string, { label: string; className: string }> = {
  competitive: {
    label: "Competitive",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
  },
  balanced: {
    label: "Balanced",
    className: "bg-green-500/10 text-green-400 border-green-500/30",
  },
  quality: {
    label: "Quality",
    className: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface GameCardProps {
  profile: GameProfile;
  isActive: boolean;
  launching: boolean;
  onLaunchOptimize: () => void;
  onEdit: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GameCard({ profile, isActive, launching, onLaunchOptimize, onEdit }: GameCardProps) {
  const launcher = profile.launcher ?? (profile.exe_path ? detectLauncher(profile.exe_path) : "custom");
  const modeConfig = profile.recommended_mode ? MODE_CONFIG[profile.recommended_mode] : null;

  return (
    <div
      className={`bg-card border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
        isActive
          ? "border-cyan-500/50 shadow-[0_0_0_1px] shadow-cyan-500/20"
          : "border-border hover:border-primary/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm leading-tight truncate">{profile.name}</p>
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full px-2 py-0.5 shrink-0">
                <Zap size={9} />
                適用中
              </span>
            )}
            {/* Recommended mode badge */}
            {modeConfig && (
              <span
                className={`inline-flex items-center text-[10px] border rounded-full px-2 py-0.5 shrink-0 font-medium ${modeConfig.className}`}
                title={profile.recommended_reason}
              >
                {modeConfig.label}
              </span>
            )}
            {/* Launcher badge */}
            <span className="inline-flex items-center text-[10px] bg-secondary border border-border rounded-full px-2 py-0.5 shrink-0 text-muted-foreground">
              {LAUNCHER_LABELS[launcher] ?? launcher}
            </span>
          </div>

          {/* exe path */}
          {profile.exe_path && (
            <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
              {shortPath(profile.exe_path)}
            </p>
          )}
        </div>

        {/* Edit button */}
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="プロファイルを編集"
          aria-label="プロファイルを編集"
        >
          <Pencil size={14} />
        </button>
      </div>

      {/* Recommended reason */}
      {profile.recommended_reason && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {profile.recommended_reason}
        </p>
      )}

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
