/**
 * AuditLogTab — 監査ログ表示 (Sprint 1 / S1-08)
 *
 * ENABLE_AUDIT_LOG = false の間は SettingsHub に組み込まれない。
 * true になると「監査ログ」タブが設定画面に表示され、
 * 全アクション履歴 (actor / action / result / timestamp) を一覧する。
 */
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Trash2, ShieldCheck, Bot, User, Rss } from "lucide-react";
import type { AuditLogEntry, AuditActor } from "@/types";
import { toast } from "@/stores/useToastStore";

// ── Feature flag ──────────────────────────────────────────────────────────────
// Sprint 2 で true に切り替える
export const ENABLE_AUDIT_LOG = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTOR_META: Record<
  AuditActor,
  { label: string; icon: React.ReactNode; color: string }
> = {
  user: {
    label: "ユーザー",
    icon: <User className="w-3.5 h-3.5" />,
    color: "text-blue-400",
  },
  policy_engine: {
    label: "ポリシー",
    icon: <Bot className="w-3.5 h-3.5" />,
    color: "text-purple-400",
  },
  safety_kernel: {
    label: "Safety",
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    color: "text-emerald-400",
  },
  watcher: {
    label: "Watcher",
    icon: <Rss className="w-3.5 h-3.5" />,
    color: "text-amber-400",
  },
};

const RESULT_STYLE: Record<string, string> = {
  success: "text-emerald-400 bg-emerald-400/10",
  failure: "text-red-400 bg-red-400/10",
  skipped: "text-zinc-400 bg-zinc-700/40",
};

function formatTs(ts: string): string {
  // ts は ISO 8601 形式 "2026-03-14T12:34:56Z"
  return ts.replace("T", " ").replace("Z", "");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditLogTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<AuditActor | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const log = await invoke<AuditLogEntry[]>("get_audit_log");
      // 新しい順に表示
      setEntries([...log].reverse());
    } catch (e) {
      toast.error("監査ログの読み込みに失敗しました: " + String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleClear = async () => {
    try {
      await invoke("clear_audit_log");
      setEntries([]);
      toast.success("監査ログを消去しました");
    } catch (e) {
      toast.error("消去に失敗しました: " + String(e));
    }
  };

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.actor === filter);

  return (
    <div className="h-full flex flex-col overflow-hidden p-6 gap-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">監査ログ</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            全自動アクションの実行記録 — 直近 500 件
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white
                       transition-colors disabled:opacity-40"
            title="更新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg hover:bg-red-400/10 text-zinc-400 hover:text-red-400
                       transition-colors"
            title="ログを消去"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* アクターフィルター */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "user", "policy_engine", "safety_kernel", "watcher"] as const).map(
          (a) => (
            <button
              key={a}
              onClick={() => setFilter(a)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                ${
                  filter === a
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-white/[0.06]"
                }`}
            >
              {a === "all" ? "すべて" : ACTOR_META[a].label}
            </button>
          )
        )}
      </div>

      {/* ログ一覧 */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            {loading ? "読み込み中..." : "ログがありません"}
          </div>
        ) : (
          visible.map((entry) => {
            const actor = ACTOR_META[entry.actor] ?? ACTOR_META.user;
            const resultCls =
              RESULT_STYLE[entry.result] ?? RESULT_STYLE.skipped;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg
                           bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
              >
                {/* アクターアイコン */}
                <span className={`mt-0.5 flex-shrink-0 ${actor.color}`}>
                  {actor.icon}
                </span>

                {/* メイン */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-white/80 truncate">
                      {entry.action}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${resultCls}`}
                    >
                      {entry.result}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-[10px] ${actor.color}`}>
                      {actor.label}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {formatTs(entry.timestamp)}
                    </span>
                    {entry.session_id && (
                      <span className="text-[10px] text-zinc-600 font-mono truncate max-w-[120px]">
                        sid: {entry.session_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
