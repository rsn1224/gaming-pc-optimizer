import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ShieldCheck,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSafetyStore } from "@/stores/useSafetyStore";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { toast } from "@/stores/useToastStore";
import type { OptimizationSession, SessionStatus, SessionMetrics } from "@/types";
import { TelemetryViewer } from "@/components/ui/TelemetryViewer";

// ── Before/After metric delta ─────────────────────────────────────────────────

function MetricsDelta({
  before,
  after,
}: {
  before: SessionMetrics;
  after: SessionMetrics;
}) {
  const procDelta = after.process_count - before.process_count;
  const memFreed = before.memory_used_mb - after.memory_used_mb;

  const fmt = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

  return (
    <div className="mt-2 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
      <p className="text-[10px] text-emerald-400/60 uppercase tracking-wide mb-2">
        Before / After
      </p>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <span className="text-muted-foreground/50">プロセス数</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-slate-300">{before.process_count}</span>
            <span className="text-muted-foreground/30">→</span>
            <span className="text-slate-300">{after.process_count}</span>
            {procDelta !== 0 && (
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  procDelta < 0 ? "text-emerald-400" : "text-amber-400"
                )}
              >
                ({procDelta > 0 ? "+" : ""}
                {procDelta})
              </span>
            )}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground/50">メモリ使用</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-slate-300">{fmt(before.memory_used_mb)}</span>
            <span className="text-muted-foreground/30">→</span>
            <span className="text-slate-300">{fmt(after.memory_used_mb)}</span>
            {memFreed > 50 && (
              <span className="text-[11px] font-semibold text-emerald-400">
                ({fmt(memFreed)} 解放)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusIcon({ status }: { status: SessionStatus }) {
  switch (status) {
    case "applied":
      return <CheckCircle2 size={14} className="text-cyan-400" />;
    case "restored":
      return <CheckCircle2 size={14} className="text-emerald-400" />;
    case "partial_restore":
      return <AlertCircle size={14} className="text-amber-400" />;
    case "failed":
      return <XCircle size={14} className="text-red-400" />;
  }
}

function StatusLabel({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, string> = {
    applied: "適用済み",
    restored: "復元済み",
    partial_restore: "一部復元",
    failed: "失敗",
  };
  return <span>{map[status]}</span>;
}

// ── Session Row ────────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onRestore,
  onDelete,
}: {
  session: OptimizationSession;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canRestore = session.status === "applied" || session.status === "partial_restore";

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.02]">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground/60 hover:text-slate-300 transition-colors"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <StatusIcon status={session.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-slate-200">
              一括最適化セッション
            </span>
            <StatusLabel status={session.status} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground/50">
            <Clock size={10} />
            <span>{formatDate(session.started_at)}</span>
            {session.ended_at && (
              <>
                <span>→</span>
                <span>{formatDate(session.ended_at)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canRestore && (
            <button
              type="button"
              onClick={() => onRestore(session.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[12px] font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <RotateCcw size={12} />
              復元
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(session.id)}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && session.changes.length > 0 && (
        <div className="border-t border-white/[0.05] px-4 py-3 space-y-2">
          <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wide mb-2">
            変更項目
          </p>
          {session.changes.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-[12px] py-1.5 border-b border-white/[0.03] last:border-0"
            >
              <RiskBadge level={c.risk_level} />
              <span className="text-slate-300 font-medium min-w-[110px]">
                {c.target}
              </span>
              <span
                className={cn(
                  "ml-auto text-[11px] font-medium",
                  c.applied ? "text-emerald-400" : "text-muted-foreground/40"
                )}
              >
                {c.applied ? "適用" : "スキップ"}
              </span>
            </div>
          ))}

          {/* Before/After metrics */}
          {session.metrics_before && session.metrics_after && (
            <MetricsDelta
              before={session.metrics_before}
              after={session.metrics_after}
            />
          )}

          {/* [Sprint 3] Telemetry timeline */}
          <TelemetryViewer sessionId={session.id} />

          {/* Snapshot power plan */}
          {session.snapshot.power_plan_guid && (
            <p className="text-[11px] text-muted-foreground/40 mt-2">
              復元先電源プラン GUID:{" "}
              <code className="text-slate-400">
                {session.snapshot.power_plan_guid}
              </code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RollbackCenter() {
  const { sessions, setSessions, loading, setLoading, rollbackEnabled, setRollbackEnabled, beginnerMode, setBeginnerMode } =
    useSafetyStore();

  async function loadSessions() {
    setLoading(true);
    try {
      const data = await invoke<OptimizationSession[]>("list_sessions");
      setSessions(data);
    } catch (e) {
      toast.error(`セッション読み込み失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestore(id: string) {
    const confirmed = window.confirm(
      "このセッションの状態に復元しますか？\n現在の設定が上書きされます。"
    );
    if (!confirmed) return;
    try {
      await invoke("restore_session", { id });
      toast.success("セッションを復元しました");
      loadSessions();
    } catch (e) {
      toast.error(`復元失敗: ${e}`);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_session", { id });
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (e) {
      toast.error(`削除失敗: ${e}`);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <ShieldCheck size={16} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-slate-100">
                ロールバックセンター
              </h1>
              <p className="text-[11px] text-muted-foreground/50">
                最適化履歴の管理と復元
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadSessions}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-[12px] text-muted-foreground/70 hover:text-slate-200 hover:border-white/[0.15] transition-colors"
          >
            更新
          </button>
        </div>

        {/* Feature flags */}
        <div className="mt-4 flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rollbackEnabled}
              onChange={(e) => setRollbackEnabled(e.target.checked)}
              className="accent-cyan-400"
            />
            <span className="text-[12px] text-muted-foreground/70">
              スナップショット自動作成
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={beginnerMode}
              onChange={(e) => setBeginnerMode(e.target.checked)}
              className="accent-amber-400"
            />
            <span className="text-[12px] text-muted-foreground/70">
              初心者モード（安全項目のみ表示）
            </span>
          </label>
        </div>
      </div>

      {/* Risk level legend */}
      <div className="px-6 py-3 flex items-center gap-4 border-b border-white/[0.04]">
        <span className="text-[11px] text-muted-foreground/40">リスク:</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <RiskBadge level="safe" />
            <span className="text-[11px] text-muted-foreground/50">
              安全（プロセス停止）
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <RiskBadge level="caution" />
            <span className="text-[11px] text-muted-foreground/50">
              注意（電源・Windows設定）
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <RiskBadge level="advanced" />
            <span className="text-[11px] text-muted-foreground/50">
              上級（ネットワーク・レジストリ）
            </span>
          </div>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <p className="text-[13px] text-muted-foreground/40 text-center py-8">
            読み込み中…
          </p>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-16">
            <ShieldCheck
              size={36}
              className="text-muted-foreground/20 mx-auto mb-3"
            />
            <p className="text-[13px] text-muted-foreground/40">
              最適化セッションがありません
            </p>
            <p className="text-[11px] text-muted-foreground/30 mt-1">
              一括最適化を実行するとスナップショットが自動保存されます
            </p>
          </div>
        )}

        {!loading &&
          sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onRestore={handleRestore}
              onDelete={handleDelete}
            />
          ))}
      </div>
    </div>
  );
}
