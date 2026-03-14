import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  Trash2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Activity,
  Bot,
} from "lucide-react";
import { PerformanceCoach } from "@/components/gamelog/PerformanceCoach";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { GameSession, GameStats } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function ScoreDelta({
  before,
  after,
}: {
  before: number | null;
  after: number | null;
}) {
  if (before === null) return <span className="text-muted-foreground">—</span>;
  if (after === null) {
    return (
      <span className="text-cyan-300 font-medium tabular-nums">{before}</span>
    );
  }
  const delta = after - before;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color =
    delta > 0
      ? "text-emerald-400"
      : delta < 0
      ? "text-rose-400"
      : "text-muted-foreground";

  return (
    <span className="flex items-center gap-1 tabular-nums text-[12px]">
      <span className="text-muted-foreground">{before}</span>
      <span className="text-muted-foreground/50">→</span>
      <span className={color}>{after}</span>
      {delta !== 0 && (
        <span className={cn("flex items-center gap-0.5", color)}>
          <Icon size={10} />
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

// ── Sparkline (SVG) ───────────────────────────────────────────────────────────

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 80;
  const h = 28;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const points = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * w;
      const y = h - ((s - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(34,211,238,0.7)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatsCard({
  stats,
  sessions,
}: {
  stats: GameStats;
  sessions: GameSession[];
}) {
  const gameSessions = sessions
    .filter((s) => s.game_name === stats.game_name)
    .slice(0, 10);
  const scores = gameSessions
    .map((s) => s.score_before)
    .filter((s): s is number => s !== null)
    .reverse();

  const avgColor =
    stats.avg_score >= 70
      ? "text-emerald-400"
      : stats.avg_score >= 40
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-white truncate max-w-[140px]">
            {stats.game_name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {stats.total_sessions}セッション · {stats.total_hours.toFixed(1)}h
          </p>
        </div>
        <span
          className={cn(
            "text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-lg border",
            stats.avg_score >= 70
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : stats.avg_score >= 40
              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400",
            avgColor
          )}
        >
          {stats.avg_score.toFixed(0)}
        </span>
      </div>
      {scores.length >= 2 && <Sparkline scores={scores} />}
      <p className="text-[11px] text-muted-foreground">
        最終: {formatDate(stats.last_played)}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GamePerformanceLog() {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [stats, setStats] = useState<GameStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterGame, setFilterGame] = useState<string>("all");
  const [confirmClear, setConfirmClear] = useState(false);
  // S10 coaching
  const [coachSession, setCoachSession] = useState<GameSession | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([
        invoke<GameSession[]>("get_game_log"),
        invoke<GameStats[]>("get_game_stats"),
      ]);
      setSessions(s);
      setStats(st);
    } catch (e) {
      toast.error(`データ取得失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleClearLog() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    try {
      await invoke("clear_game_log");
      toast.success("ゲームログをクリアしました");
      setSessions([]);
      setStats([]);
      setConfirmClear(false);
    } catch (e) {
      toast.error(`クリア失敗: ${String(e)}`);
    }
  }

  async function handleDeleteSession(id: string) {
    try {
      await invoke("delete_game_session", { id });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      // refresh stats
      const st = await invoke<GameStats[]>("get_game_stats");
      setStats(st);
    } catch (e) {
      toast.error(`削除失敗: ${String(e)}`);
    }
  }

  const gameNames = Array.from(new Set(sessions.map((s) => s.game_name)));

  const filteredSessions =
    filterGame === "all"
      ? sessions
      : sessions.filter((s) => s.game_name === filterGame);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <BarChart3 size={14} className="text-cyan-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">ゲームパフォーマンスログ</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.05] border border-white/[0.06] disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(loading && "animate-spin")} />
            更新
          </button>
          <button
            type="button"
            onClick={handleClearLog}
            className={cn(
              "flex items-center gap-1.5 text-[12px] transition-colors px-3 py-1.5 rounded-lg border",
              confirmClear
                ? "bg-rose-500/20 border-rose-500/30 text-rose-300"
                : "text-muted-foreground hover:text-white hover:bg-white/[0.05] border-white/[0.06]"
            )}
          >
            <Trash2 size={12} />
            {confirmClear ? "本当にクリア？" : "ログをクリア"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[13px]">読み込み中...</span>
          </div>
        ) : (
          <>
            {/* Stats summary */}
            {stats.length > 0 && (
              <section>
                <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  統計サマリー
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {stats.map((s) => (
                    <StatsCard key={s.game_name} stats={s} sessions={sessions} />
                  ))}
                </div>
              </section>
            )}

            {/* Session history */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                  セッション履歴
                </h2>
                {gameNames.length > 1 && (
                  <select
                    value={filterGame}
                    onChange={(e) => setFilterGame(e.target.value)}
                    className="text-[12px] bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1 text-muted-foreground focus:outline-none focus:border-cyan-500/40"
                  >
                    <option value="all">すべてのゲーム</option>
                    {gameNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {filteredSessions.length === 0 ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
                  <Activity size={24} className="text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-[13px] text-muted-foreground">
                    セッション履歴がありません
                  </p>
                  <p className="text-[12px] text-muted-foreground/60 mt-1">
                    プロファイルを適用してゲームをプレイすると自動的に記録されます
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSessions.map((session) => {
                    const isActive = session.ended_at === null;
                    return (
                      <div
                        key={session.id}
                        className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center gap-4"
                      >
                        {/* Status indicator */}
                        <div className="shrink-0">
                          {isActive ? (
                            <span className="relative flex w-2 h-2">
                              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                              <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
                            </span>
                          ) : (
                            <CheckCircle2
                              size={14}
                              className="text-muted-foreground/50"
                            />
                          )}
                        </div>

                        {/* Game info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-medium text-white truncate">
                              {session.game_name}
                            </p>
                            {isActive && (
                              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">
                                プレイ中
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">
                              {formatDate(session.started_at)}
                            </span>
                            {session.duration_minutes !== null && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock size={10} />
                                {formatDuration(session.duration_minutes)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] text-muted-foreground mb-0.5">スコア</p>
                          <ScoreDelta
                            before={session.score_before}
                            after={session.score_after}
                          />
                        </div>

                        {/* Coach button */}
                        {!isActive && session.ended_at !== null && (
                          <button
                            type="button"
                            onClick={() => setCoachSession(session)}
                            className="shrink-0 text-muted-foreground/40 hover:text-amber-400 transition-colors"
                            title="AIコーチングを見る"
                          >
                            <Bot size={13} />
                          </button>
                        )}

                        {/* Delete */}
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session.id)}
                            className="shrink-0 text-muted-foreground/40 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* S10: PerformanceCoach modal from session row */}
      {coachSession && (
        <PerformanceCoach
          sessionId={coachSession.id}
          gameName={coachSession.game_name}
          scoreBefore={coachSession.score_before ?? null}
          scoreAfter={coachSession.score_after ?? undefined}
          durationMinutes={coachSession.duration_minutes ?? null}
          onClose={() => setCoachSession(null)}
        />
      )}
    </div>
  );
}
