import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bell,
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventEntry } from "@/types";

// ── Icon map ──────────────────────────────────────────────────────────────────

function EventIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "success":
      return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
    case "warning":
      return <AlertTriangle size={14} className="text-amber-400 shrink-0" />;
    case "error":
      return <XCircle size={14} className="text-red-400 shrink-0" />;
    default:
      return <Info size={14} className="text-cyan-400 shrink-0" />;
  }
}

function iconBg(kind: string) {
  switch (kind) {
    case "success": return "bg-emerald-500/10 border-emerald-500/20";
    case "warning": return "bg-amber-500/10 border-amber-500/20";
    case "error":   return "bg-red-500/10 border-red-500/20";
    default:        return "bg-cyan-500/10 border-cyan-500/20";
  }
}

// ── Timestamp formatter ────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}日前`;
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Event type label ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  optimization_run: "全最適化",
  profile_applied:  "プロファイル",
  preset_applied:   "プリセット",
  restore:          "復元",
  error:            "エラー",
};

// ── Main component ─────────────────────────────────────────────────────────────

export function EventLog() {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = () => {
    setLoading(true);
    invoke<EventEntry[]>("get_event_log")
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleClear = async () => {
    if (!window.confirm("イベントログをすべて削除しますか？")) return;
    await invoke("clear_event_log").catch(console.error);
    setEvents([]);
  };

  const filterTypes = ["all", "optimization_run", "profile_applied", "preset_applied", "restore", "error"];

  const filtered = filter === "all"
    ? events
    : events.filter((e) => e.event_type === filter);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Bell size={16} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-slate-100">通知センター</h1>
              <p className="text-[11px] text-muted-foreground/50">
                最適化イベントの履歴
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="p-2 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <RefreshCw size={13} className="text-muted-foreground/60" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={events.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-red-500/10 hover:border-red-500/20 text-[12px] text-muted-foreground/60 hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 size={12} />
              クリア
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-1.5 flex-wrap">
          {filterTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                filter === t
                  ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300"
                  : "bg-white/[0.03] border border-white/[0.07] text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-white/[0.06]"
              )}
            >
              {t === "all" ? "すべて" : (TYPE_LABELS[t] ?? t)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground/50">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">読み込み中...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground/55">
            <Bell size={28} />
            <p className="text-[13px]">イベントがありません</p>
            <p className="text-[11px]">最適化を実行するとここに記録されます</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <div className={cn("p-1.5 rounded-lg border shrink-0 mt-0.5", iconBg(entry.icon_kind))}>
                  <EventIcon kind={entry.icon_kind} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-slate-200 truncate">
                      {entry.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground/55 shrink-0 tabular-nums">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  {entry.detail && (
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-relaxed">
                      {entry.detail}
                    </p>
                  )}
                  <span className="mt-1.5 inline-block px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] text-muted-foreground/55 uppercase tracking-wide">
                    {TYPE_LABELS[entry.event_type] ?? entry.event_type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
