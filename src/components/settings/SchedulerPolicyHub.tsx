/**
 * SchedulerPolicyHub — スケジューラー + ポリシーエンジン 統合ページ
 * 統合効果: アクティブポリシー数 + 次回スケジュール実行時刻を一目で表示
 *           ポリシーのスケジュールトリガーをそのままスケジューラーに反映
 *           自然言語入力 → AI ルールベースパーサー → ポリシー自動生成
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { Scheduler } from "./Scheduler";
import { PolicyManager } from "@/components/policies/PolicyManager";
import type { Policy, ScheduledTask } from "@/types";
import { Calendar, Bot, Clock, Zap, CheckCircle2, Sparkles, Loader2, X } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "scheduler", label: "スケジューラー" },
  { id: "policy", label: "ポリシー" },
];

// ── NL Policy Parser ──────────────────────────────────────────────────────────

type TriggerKind = "on_game_start" | "on_schedule" | "on_score_below" | "on_manual";
type PolicyActionKind = "apply_preset" | "kill_bloatware" | "set_power_plan" | "apply_graph_nodes" | "apply_all";

interface ParsedTrigger {
  kind: TriggerKind;
  cron?: string;
  threshold?: number;
}
interface ParsedAction {
  kind: PolicyActionKind;
  params: Record<string, string>;
}
interface DraftPolicy {
  name: string;
  trigger: ParsedTrigger;
  action: ParsedAction;
  triggerLabel: string;
  actionLabel: string;
}

function parseCronFromText(text: string): string | null {
  // "毎朝8時" "毎日22時" "22:00" etc.
  const hourMatch = text.match(/(?:毎日|毎朝|毎晩|毎夜)?[^\d]*(\d{1,2})時/);
  if (hourMatch) {
    const h = parseInt(hourMatch[1]);
    if (h >= 0 && h <= 23) return `0 ${h} * * *`;
  }
  const hmMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (hmMatch) {
    return `${parseInt(hmMatch[2])} ${parseInt(hmMatch[1])} * * *`;
  }
  return null;
}

function buildTriggerLabel(t: ParsedTrigger): string {
  if (t.kind === "on_game_start") return "ゲーム起動時";
  if (t.kind === "on_score_below") return `スコア ${t.threshold ?? 50} 以下で`;
  if (t.kind === "on_schedule" && t.cron) {
    const m = t.cron.match(/^(\d+) (\d+) \* \* \*$/);
    return m ? `毎日 ${m[2]}:${m[1].padStart(2, "0")}` : `スケジュール (${t.cron})`;
  }
  return "手動実行";
}

function buildActionLabel(a: ParsedAction): string {
  if (a.kind === "apply_preset") return `「${a.params.preset_id ?? ""}」プリセットを適用`;
  if (a.kind === "kill_bloatware") return "ブロートウェアを終了";
  if (a.kind === "set_power_plan") return `電源プラン: ${a.params.plan ?? ""}`;
  if (a.kind === "apply_all") return "全最適化を実行";
  return a.kind;
}

function parseNLPolicy(input: string): DraftPolicy | null {
  const t = input.trim();
  if (!t) return null;

  // ── Trigger detection ──────────────────────────────────────────────────────
  let trigger: ParsedTrigger;
  if (/ゲーム起動|ゲームが起動|game.start/i.test(t)) {
    trigger = { kind: "on_game_start" };
  } else if (/スコアが?(下がったら|低く|(\d+)以下)/.test(t)) {
    const scoreMatch = t.match(/(\d+)/);
    trigger = { kind: "on_score_below", threshold: scoreMatch ? parseInt(scoreMatch[1]) : 50 };
  } else {
    const cron = parseCronFromText(t);
    if (cron) {
      trigger = { kind: "on_schedule", cron };
    } else if (/毎日|毎朝|定期|スケジュール/.test(t)) {
      trigger = { kind: "on_schedule", cron: "0 22 * * *" }; // default 22:00
    } else {
      trigger = { kind: "on_manual" };
    }
  }

  // ── Action detection ───────────────────────────────────────────────────────
  let action: ParsedAction;
  if (/esports|eスポーツ|fps|ゲームモード|競技/i.test(t)) {
    action = { kind: "apply_preset", params: { preset_id: "esports" } };
  } else if (/配信|streaming|stream|実況/i.test(t)) {
    action = { kind: "apply_preset", params: { preset_id: "streaming" } };
  } else if (/静音|省電力|バランス|節電|quiet/i.test(t)) {
    action = { kind: "set_power_plan", params: { plan: "balanced" } };
  } else if (/高パフォーマンス|ultimate|performance|パワー/i.test(t)) {
    action = { kind: "set_power_plan", params: { plan: "ultimate_performance" } };
  } else if (/ブロートウェア|不要プロセス|bloat|終了|kill/i.test(t)) {
    action = { kind: "kill_bloatware", params: {} };
  } else if (/全最適化|全部|apply.all|すべて最適化/i.test(t)) {
    action = { kind: "apply_all", params: {} };
  } else if (/最適化|オプティマイズ|optimize/i.test(t)) {
    action = { kind: "apply_all", params: {} };
  } else {
    // Not enough info
    return null;
  }

  const triggerLabel = buildTriggerLabel(trigger);
  const actionLabel = buildActionLabel(action);
  const name = t.length > 28 ? t.slice(0, 28) + "…" : t;

  return { name, trigger, action, triggerLabel, actionLabel };
}

// ── NL Policy Input Panel ─────────────────────────────────────────────────────

function NLPolicyPanel({ onSaved }: { onSaved: () => void }) {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<DraftPolicy | null>(null);
  const [parseError, setParseError] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    const result = parseNLPolicy(input);
    if (result) {
      setDraft(result);
      setParseError(false);
    } else {
      setDraft(null);
      setParseError(true);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const policy: Policy = {
        id: `nl_${Date.now()}`,
        name: draft.name,
        enabled: true,
        priority: 50,
        trigger: draft.trigger,
        action: draft.action,
        last_fired_at: null,
        fire_count: 0,
      };
      await invoke("save_policy", { policy });
      toast.success(`ポリシー「${draft.name}」を保存しました`);
      setInput("");
      setDraft(null);
      onSaved();
    } catch (e) {
      toast.error(`保存失敗: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#141414] border border-violet-500/20 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={11} className="text-violet-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">AI ポリシー生成 — 自然言語入力</span>
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setParseError(false); setDraft(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleParse(); }}
          placeholder="例: 毎日22時にEsportsプリセットを適用"
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/40 transition-colors"
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={!input.trim()}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/15 border border-violet-500/25 text-violet-400 hover:bg-violet-500/25 disabled:opacity-40 transition-colors"
        >
          <Bot size={10} />
          解析
        </button>
      </div>

      {/* Hint examples */}
      {!draft && !parseError && (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {[
            "ゲーム起動時にEsportsモード",
            "毎朝8時に最適化",
            "スコアが50以下でブロートウェア終了",
          ].map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => { setInput(hint); setParseError(false); }}
              className="text-[10px] text-muted-foreground/35 hover:text-violet-400 transition-colors"
            >
              {hint} ↗
            </button>
          ))}
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <p className="text-[11px] text-amber-400/80 mt-2">
          解析できませんでした。アクション（例: Esportsプリセット、最適化、ブロートウェア終了）を含む文を入力してください。
        </p>
      )}

      {/* Draft preview */}
      {draft && (
        <div className="mt-2 bg-white/[0.03] border border-violet-500/20 rounded-lg px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{draft.name}</p>
              <p className="text-[10px] text-muted-foreground/55 mt-0.5">
                <span className="text-cyan-400/70">{draft.triggerLabel}</span>
                <span className="mx-1.5 text-muted-foreground/30">→</span>
                <span className="text-emerald-400/70">{draft.actionLabel}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
              >
                <X size={10} />
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                  "bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 disabled:opacity-50"
                )}
              >
                {saving && <Loader2 size={9} className="animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SchedulerPolicyHub() {
  const [tab, setTab] = useState("scheduler");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      invoke<Policy[]>("list_policies").catch(() => [] as Policy[]),
      invoke<ScheduledTask | null>("get_schedule").catch(() => null),
    ]);
    setPolicies(p as Policy[]);
    setTask(t as ScheduledTask | null);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const enabledPolicies = policies.filter((p) => p.enabled);
  const cronPolicies = enabledPolicies.filter((p) => p.trigger.kind === "on_schedule");
  const hasSchedule = task?.enabled && task.next_run;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Calendar size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">スケジューラー</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">自動最適化 · AIポリシー生成</p>
        </div>
      </div>
      {/* ── Insight Panel ── */}
      {loaded && (
        <div className="shrink-0 mx-4 mb-1 bg-[#141414] border border-white/[0.10] rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Active policies */}
          <div className="flex items-center gap-2">
            <Bot size={13} className={enabledPolicies.length > 0 ? "text-violet-400" : "text-muted-foreground/40"} />
            <div>
              <p className="text-[10px] text-muted-foreground/50">アクティブポリシー</p>
              <p className="text-sm font-bold text-white">
                {enabledPolicies.length}
                <span className="text-[10px] font-normal text-muted-foreground/50 ml-1">/ {policies.length} 件</span>
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-white/[0.06]" />

          {/* Next schedule */}
          <div className="flex items-center gap-2">
            <Clock size={13} className={hasSchedule ? "text-cyan-400" : "text-muted-foreground/40"} />
            <div>
              <p className="text-[10px] text-muted-foreground/50">次回スケジュール</p>
              <p className="text-xs font-semibold text-white">
                {hasSchedule
                  ? new Date(task!.next_run).toLocaleString("ja-JP", {
                      month: "numeric", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : "未設定"}
              </p>
            </div>
          </div>

          {/* Cron policies hint */}
          {cronPolicies.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Calendar size={13} className="text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground/50">cronトリガー付きポリシー</p>
                  <p className="text-xs text-amber-300 truncate">
                    {cronPolicies.map((p) => p.name).join("、")}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Quick action: if no schedule but there are policies */}
          {!hasSchedule && enabledPolicies.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => setTab("scheduler")}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
              >
                <Zap size={10} />
                スケジュール設定
              </button>
            </>
          )}

          {/* All good state */}
          {hasSchedule && enabledPolicies.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={12} />
                <span className="text-[11px]">自動化が稼働中</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── NL Policy Generator ── */}
      {loaded && (
        <div className="shrink-0 mx-4 mb-1">
          <NLPolicyPanel onSaved={load} />
        </div>
      )}

      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "scheduler" && <Scheduler />}
        {tab === "policy" && <PolicyManager />}
      </div>
    </div>
  );
}
