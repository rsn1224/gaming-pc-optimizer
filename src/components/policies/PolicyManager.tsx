/**
 * PolicyManager — ポリシー管理画面 (Sprint 3 / S3-03)
 *
 * 有効化されたポリシーの一覧表示・toggle・新規作成・削除を提供する。
 * ポリシーエンジンの設定は ENABLE_POLICY_ENGINE=false の間も
 * UI から事前設定しておくことができる（flip 後に自動発火）。
 */
import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus, Trash2, Play, ToggleLeft, ToggleRight,
  RefreshCw, Bot, Zap, ShieldCheck, Settings2, Library, X, Download,
} from "lucide-react";
import type { Policy, PolicyTrigger, PolicyAction } from "@/types";
import { usePolicyStore } from "@/stores/usePolicyStore";
import { toast } from "@/stores/useToastStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerLabel(t: PolicyTrigger): string {
  switch (t.kind) {
    case "on_game_start":  return "ゲーム起動時";
    case "on_score_below": return `スコア < ${t.threshold ?? "?"}`;
    case "on_schedule":    return `スケジュール: ${t.cron ?? "?"}`;
    case "on_manual":      return "手動";
  }
}

function actionLabel(a: PolicyAction): string {
  switch (a.kind) {
    case "apply_preset":      return `プリセット適用: ${a.params.preset_id ?? "?"}`;
    case "kill_bloatware":    return "ブロートウェア停止";
    case "set_power_plan":    return `電源プラン: ${a.params.plan ?? "?"}`;
    case "apply_graph_nodes": return `グラフノード適用`;
    case "apply_all":         return "全最適化実行";
  }
}

const TRIGGER_COLOR: Record<string, string> = {
  on_game_start:  "bg-violet-500/10 text-violet-300 border-violet-500/20",
  on_score_below: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  on_schedule:    "bg-blue-500/10 text-blue-300 border-blue-500/20",
  on_manual:      "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
};

// ── Built-in policy templates (S7-01) ────────────────────────────────────────

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  tag: string;
  tagColor: string;
  trigger: PolicyTrigger;
  action: PolicyAction;
  priority: number;
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "tpl_game_start_all",
    name: "ゲーム起動時 全最適化",
    description: "ゲームプロセスを検知したら即座に全最適化を実行。FPS 最大化に最適。",
    tag: "ゲーム",
    tagColor: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    trigger: { kind: "on_game_start" },
    action: { kind: "apply_all", params: {} },
    priority: 5,
  },
  {
    id: "tpl_score_drop",
    name: "スコア低下時 自動最適化",
    description: "最適化スコアが 50 を下回ったら自動で全最適化を実行。",
    tag: "自動",
    tagColor: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    trigger: { kind: "on_score_below", threshold: 50 },
    action: { kind: "apply_all", params: {} },
    priority: 10,
  },
  {
    id: "tpl_nightly_clean",
    name: "深夜2時 ブロートウェア停止",
    description: "毎日深夜2時にバックグラウンドで不要プロセスを停止。翌朝の起動を快適に。",
    tag: "スケジュール",
    tagColor: "bg-blue-500/15 text-blue-300 border-blue-500/25",
    trigger: { kind: "on_schedule", cron: "0 2 * * *" },
    action: { kind: "kill_bloatware", params: {} },
    priority: 30,
  },
  {
    id: "tpl_weekly_power",
    name: "週次 電源プラン最適化",
    description: "毎週月曜朝9時に Ultimate Performance に切り替え。週の始まりを高速に。",
    tag: "スケジュール",
    tagColor: "bg-blue-500/15 text-blue-300 border-blue-500/25",
    trigger: { kind: "on_schedule", cron: "0 9 * * 1" },
    action: { kind: "set_power_plan", params: { plan: "ultimate" } },
    priority: 30,
  },
  {
    id: "tpl_manual_network",
    name: "手動 ネットワーク最適化",
    description: "ボタン1つでネットワーク + DNS を同時最適化。対戦前の一発チューン。",
    tag: "手動",
    tagColor: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
    trigger: { kind: "on_manual" },
    action: { kind: "apply_graph_nodes", params: { node_ids: "network_gaming,dns_gaming" } },
    priority: 50,
  },
  {
    id: "tpl_game_start_network",
    name: "ゲーム起動時 ネットワーク優先",
    description: "ゲーム起動を検知したら eスポーツ向けプリセットを適用。",
    tag: "ゲーム",
    tagColor: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    trigger: { kind: "on_game_start" },
    action: { kind: "apply_preset", params: { preset_id: "esports" } },
    priority: 5,
  },
];

function PolicyTemplateGallery({
  onImport,
  onClose,
}: {
  onImport: (tpl: PolicyTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-[#07090e] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library size={15} className="text-violet-400" />
          <span className="text-sm font-semibold text-white">テンプレートライブラリ</span>
          <span className="text-[10px] text-muted-foreground/55">{POLICY_TEMPLATES.length} 件</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground/50 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {POLICY_TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="flex flex-col gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-violet-500/25 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white leading-tight">{tpl.name}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-relaxed">{tpl.description}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tpl.tagColor}`}>
                {tpl.tag}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TRIGGER_COLOR[tpl.trigger.kind] ?? TRIGGER_COLOR.on_manual}`}>
                  {triggerLabel(tpl.trigger)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {actionLabel(tpl.action)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onImport(tpl)}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium
                           bg-violet-600/80 hover:bg-violet-500 text-white transition-colors"
              >
                <Download size={10} />
                使う
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Default new policy template ───────────────────────────────────────────────

function newPolicyTemplate(): Policy {
  return {
    id: crypto.randomUUID(),
    name: "新しいポリシー",
    enabled: false,
    priority: 50,
    trigger: { kind: "on_score_below", threshold: 50 },
    action: { kind: "apply_all", params: {} },
    last_fired_at: null,
    fire_count: 0,
  };
}

// ── PolicyCard ────────────────────────────────────────────────────────────────

function PolicyCard({
  policy,
  onToggle,
  onDelete,
  onFire,
  onEdit,
}: {
  policy: Policy;
  onToggle: () => void;
  onDelete: () => void;
  onFire: () => void;
  onEdit: () => void;
}) {
  const triggerCls = TRIGGER_COLOR[policy.trigger.kind] ?? TRIGGER_COLOR.on_manual;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-colors
        ${policy.enabled
          ? "bg-white/[0.04] border-white/[0.12]"
          : "bg-white/[0.02] border-white/[0.04] opacity-60"
        }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{policy.name}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            優先度 {policy.priority}
            {policy.fire_count > 0 && (
              <span className="ml-2 text-zinc-600">
                発火 {policy.fire_count} 回
                {policy.last_fired_at && (
                  <> — 最終: {policy.last_fired_at.replace("T", " ").replace("Z", "")}</>
                )}
              </span>
            )}
          </p>
        </div>

        {/* Toggle */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 text-zinc-400 hover:text-white transition-colors"
          title={policy.enabled ? "無効化" : "有効化"}
        >
          {policy.enabled
            ? <ToggleRight className="w-5 h-5 text-emerald-400" />
            : <ToggleLeft className="w-5 h-5" />
          }
        </button>
      </div>

      {/* Trigger + Action */}
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border ${triggerCls}`}>
          <Zap className="w-3 h-3" />
          {triggerLabel(policy.trigger)}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium
                         bg-zinc-800 text-zinc-300 border border-zinc-700">
          <Bot className="w-3 h-3" />
          {actionLabel(policy.action)}
        </span>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-zinc-400
                     hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Settings2 className="w-3 h-3" />
          編集
        </button>
        {policy.trigger.kind === "on_manual" && (
          <button
            onClick={onFire}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-violet-400
                       hover:text-violet-300 hover:bg-violet-500/10 transition-colors"
          >
            <Play className="w-3 h-3" />
            今すぐ実行
          </button>
        )}
        <span className="flex-1" />
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-zinc-600
                     hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          削除
        </button>
      </div>
    </div>
  );
}

// ── PolicyEditPanel ───────────────────────────────────────────────────────────

function PolicyEditPanel({
  policy,
  onSave,
  onCancel,
}: {
  policy: Policy;
  onSave: (p: Policy) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Policy>({ ...policy });

  const setField = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setDraft((p) => ({ ...p, [key]: value }));

  const setTriggerKind = (kind: PolicyTrigger["kind"]) => {
    const defaults: Record<PolicyTrigger["kind"], PolicyTrigger> = {
      on_game_start:  { kind: "on_game_start" },
      on_score_below: { kind: "on_score_below", threshold: 50 },
      on_schedule:    { kind: "on_schedule", cron: "0 */6 * * *" },
      on_manual:      { kind: "on_manual" },
    };
    setField("trigger", defaults[kind]);
  };

  const setActionKind = (kind: PolicyAction["kind"]) => {
    const defaults: Record<PolicyAction["kind"], PolicyAction> = {
      apply_preset:      { kind: "apply_preset", params: { preset_id: "esports" } },
      kill_bloatware:    { kind: "kill_bloatware", params: {} },
      set_power_plan:    { kind: "set_power_plan", params: { plan: "ultimate" } },
      apply_graph_nodes: { kind: "apply_graph_nodes", params: { node_ids: "" } },
      apply_all:         { kind: "apply_all", params: {} },
    };
    setField("action", defaults[kind]);
  };

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-4">
      <p className="text-sm font-semibold text-white flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-violet-400" />
        ポリシー編集
      </p>

      {/* Name */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">名前</label>
        <input
          value={draft.name}
          onChange={(e) => setField("name", e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.12]
                     text-sm text-white focus:outline-none focus:border-violet-500/50"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">
          優先度 (0=最優先, {draft.priority})
        </label>
        <input
          type="range" min={0} max={100} value={draft.priority}
          onChange={(e) => setField("priority", Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </div>

      {/* Trigger kind */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">トリガー</label>
        <select
          value={draft.trigger.kind}
          onChange={(e) => setTriggerKind(e.target.value as PolicyTrigger["kind"])}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.12]
                     text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="on_game_start">ゲーム起動時</option>
          <option value="on_score_below">スコア低下時</option>
          <option value="on_schedule">スケジュール</option>
          <option value="on_manual">手動</option>
        </select>

        {draft.trigger.kind === "on_score_below" && (
          <div className="mt-2">
            <label className="block text-xs text-zinc-500 mb-1">
              閾値 ({draft.trigger.threshold})
            </label>
            <input
              type="range" min={10} max={90} value={draft.trigger.threshold ?? 50}
              onChange={(e) =>
                setField("trigger", { kind: "on_score_below", threshold: Number(e.target.value) })
              }
              className="w-full accent-amber-500"
            />
          </div>
        )}

        {draft.trigger.kind === "on_schedule" && (
          <div className="mt-2">
            <label className="block text-xs text-zinc-500 mb-1">Cron 式</label>
            <input
              value={draft.trigger.cron ?? ""}
              onChange={(e) =>
                setField("trigger", { kind: "on_schedule", cron: e.target.value })
              }
              placeholder="0 */6 * * *"
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.12]
                         text-sm text-white font-mono focus:outline-none focus:border-violet-500/50"
            />
          </div>
        )}
      </div>

      {/* Action kind */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">アクション</label>
        <select
          value={draft.action.kind}
          onChange={(e) => setActionKind(e.target.value as PolicyAction["kind"])}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.12]
                     text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="apply_all">全最適化実行</option>
          <option value="kill_bloatware">ブロートウェア停止</option>
          <option value="apply_preset">プリセット適用</option>
          <option value="set_power_plan">電源プラン切替</option>
          <option value="apply_graph_nodes">グラフノード適用</option>
        </select>

        {draft.action.kind === "apply_preset" && (
          <div className="mt-2">
            <select
              value={draft.action.params.preset_id ?? "esports"}
              onChange={(e) =>
                setField("action", { kind: "apply_preset", params: { preset_id: e.target.value } })
              }
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.12]
                         text-sm text-white focus:outline-none focus:border-violet-500/50"
            >
              <option value="esports">eスポーツ</option>
              <option value="streaming">配信</option>
              <option value="quiet">静音</option>
            </select>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white
                     hover:bg-white/[0.06] transition-colors"
        >
          キャンセル
        </button>
        <button
          onClick={() => onSave(draft)}
          className="flex-1 py-1.5 rounded-lg text-sm font-medium
                     bg-violet-600 hover:bg-violet-500 text-white transition-colors"
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ── PolicyManager ─────────────────────────────────────────────────────────────

export function PolicyManager() {
  const { policies, setPolicies, updatePolicy, removePolicy, loading, setLoading,
          editingPolicy, setEditingPolicy } = usePolicyStore();
  const [showTemplates, setShowTemplates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<Policy[]>("list_policies");
      setPolicies(list);
    } catch (e) {
      toast.error("ポリシー読み込みエラー: " + String(e));
    } finally {
      setLoading(false);
    }
  }, [setPolicies, setLoading]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (policy: Policy) => {
    const next = { ...policy, enabled: !policy.enabled };
    updatePolicy(next);
    try {
      await invoke("toggle_policy", { id: policy.id, enabled: next.enabled });
    } catch (e) {
      updatePolicy(policy); // rollback
      toast.error(String(e));
    }
  };

  const handleDelete = async (id: string) => {
    removePolicy(id);
    try {
      await invoke("delete_policy", { id });
      toast.success("ポリシーを削除しました");
    } catch (e) {
      toast.error(String(e));
      load(); // reload to restore
    }
  };

  const handleFire = async (id: string) => {
    try {
      await invoke("fire_policy_manual", { id });
      toast.success("ポリシーを実行しました");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleImportTemplate = async (tpl: PolicyTemplate) => {
    const policy: Policy = {
      id: crypto.randomUUID(),
      name: tpl.name,
      enabled: false,
      priority: tpl.priority,
      trigger: tpl.trigger,
      action: tpl.action,
      last_fired_at: null,
      fire_count: 0,
    };
    try {
      await invoke("save_policy", { policy });
      updatePolicy(policy);
      setShowTemplates(false);
      toast.success(`「${tpl.name}」をインポートしました`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSave = async (policy: Policy) => {
    updatePolicy(policy);
    setEditingPolicy(null);
    try {
      await invoke("save_policy", { policy });
      toast.success("ポリシーを保存しました");
    } catch (e) {
      toast.error(String(e));
      load();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-semibold text-white">ポリシーエンジン</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            トリガー + アクションの組み合わせで自動最適化を定義する
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white
                       transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => { setShowTemplates(v => !v); setEditingPolicy(null); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${showTemplates
                ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                : "border border-white/[0.12] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              }`}
          >
            <Library className="w-4 h-4" />
            テンプレート
          </button>
          <button
            onClick={() => { setEditingPolicy(newPolicyTemplate()); setShowTemplates(false); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                       bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            新規
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {/* Template gallery */}
        {showTemplates && (
          <PolicyTemplateGallery
            onImport={handleImportTemplate}
            onClose={() => setShowTemplates(false)}
          />
        )}

        {/* New/Edit panel */}
        {editingPolicy && (
          <PolicyEditPanel
            policy={editingPolicy}
            onSave={handleSave}
            onCancel={() => setEditingPolicy(null)}
          />
        )}

        {/* Policy cards */}
        {loading && policies.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            読み込み中...
          </div>
        ) : policies.length === 0 && !editingPolicy ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3
                          text-zinc-600 text-sm">
            <Bot className="w-8 h-8 opacity-30" />
            <p>ポリシーがありません</p>
            <button
              onClick={() => setEditingPolicy(newPolicyTemplate())}
              className="text-violet-400 hover:text-violet-300 text-xs underline"
            >
              最初のポリシーを作成する
            </button>
          </div>
        ) : (
          policies
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((p) => (
              <PolicyCard
                key={p.id}
                policy={p}
                onToggle={() => handleToggle(p)}
                onDelete={() => handleDelete(p.id)}
                onFire={() => handleFire(p.id)}
                onEdit={() => setEditingPolicy(p)}
              />
            ))
        )}
      </div>
    </div>
  );
}
