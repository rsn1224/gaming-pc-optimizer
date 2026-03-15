/**
 * RollbackLogsHub — ロールバック + イベントログ 統合ページ
 * 統合効果: 最終最適化セッション後にエラーが発生していた場合、
 *           「このセッションが原因の可能性」をアラートで提示 → ロールバック提案
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { RollbackCenter } from "@/components/rollback/RollbackCenter";
import { EventLog } from "@/components/notifications/EventLog";
import { useSafetyStore } from "@/stores/useSafetyStore";
import type { OptimizationSession, EventEntry } from "@/types";
import { ShieldAlert, RotateCcw, CheckCircle2, ShieldCheck } from "lucide-react";

const TABS = [
  { id: "rollback", label: "ロールバック" },
  { id: "log", label: "イベントログ" },
];

interface Correlation {
  session: OptimizationSession;
  errorCount: number;
  firstError: EventEntry;
}

export function RollbackLogsHub() {
  const [tab, setTab] = useState("rollback");
  const { sessions, setSessions } = useSafetyStore();
  const [, setEvents] = useState<EventEntry[]>([]);
  const [correlation, setCorrelation] = useState<Correlation | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [sess, evts] = await Promise.all([
      invoke<OptimizationSession[]>("list_sessions").catch(() => [] as OptimizationSession[]),
      invoke<EventEntry[]>("get_event_log").catch(() => [] as EventEntry[]),
    ]);
    const sessArr = sess as OptimizationSession[];
    const evtArr = evts as EventEntry[];
    setSessions(sessArr);
    setEvents(evtArr);

    // Find latest applied session
    const applied = [...sessArr]
      .filter((s) => s.status === "applied")
      .sort((a, b) => b.started_at.localeCompare(a.started_at));

    if (applied.length > 0) {
      const latest = applied[0];
      // Errors after this session (timestamp in ms, started_at is ISO string)
      const sessionTs = new Date(latest.started_at).getTime();
      const errorsAfter = evtArr.filter(
        (e) => e.event_type === "error" && e.timestamp * 1000 > sessionTs
      );
      if (errorsAfter.length > 0) {
        setCorrelation({
          session: latest,
          errorCount: errorsAfter.length,
          firstError: errorsAfter[0],
        });
      }
    }
    setLoaded(true);
  }, [setSessions]);

  useEffect(() => { load(); }, [load]);

  const appliedCount = sessions.filter((s) => s.status === "applied").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <ShieldCheck size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">ロールバック＆ログ</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">変更履歴 · 復元 · イベントログ</p>
        </div>
      </div>
      {/* ── Insight Panel ── */}
      {loaded && (
        <div className="shrink-0 mx-4 mb-1 space-y-2">
          {/* Correlation alert */}
          {!dismissed && correlation ? (
            <div className="bg-[#141414] border border-amber-500/25 rounded-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldAlert size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-300">最適化後にエラーを検出</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    最終セッション（{new Date(correlation.session.started_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）後に
                    <span className="text-amber-300 font-medium mx-1">{correlation.errorCount} 件</span>
                    のエラーが記録されています。
                  </p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5 truncate">
                    最初のエラー: {correlation.firstError.title}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setTab("rollback")}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25 transition-colors"
                    >
                      <RotateCcw size={10} />
                      ロールバックを確認
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("log")}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground/60 border border-white/[0.06] hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      ログを確認
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissed(true)}
                      className="ml-auto text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Clean state */
            <div className="bg-[#141414] border border-white/[0.10] rounded-xl px-4 py-2.5 flex items-center gap-3">
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
              <p className="text-xs text-muted-foreground/60">
                最適化後のエラーは検出されていません
              </p>
              {appliedCount > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground/40">
                  ロールバック可能: {appliedCount} セッション
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "rollback" && <RollbackCenter />}
        {tab === "log" && <EventLog />}
      </div>
    </div>
  );
}
