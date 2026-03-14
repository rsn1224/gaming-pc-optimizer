import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { ScheduleConfig, ScheduledTask } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGERS = [
  { id: "daily",    label: "毎日" },
  { id: "weekly",   label: "毎週" },
  { id: "onlogon",  label: "ログオン時" },
  { id: "onboot",   label: "起動時" },
] as const;

const PRESETS = [
  { id: "esports",   label: "エスポーツ",   desc: "遅延・ブルームを最小化" },
  { id: "streaming", label: "ストリーミング", desc: "配信品質を優先" },
  { id: "quiet",     label: "静音",          desc: "ファン・電力を抑制" },
  { id: "all",       label: "全最適化",      desc: "すべての最適化を実行" },
] as const;

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

const DEFAULT_CONFIG: ScheduleConfig = {
  enabled: true,
  trigger: "daily",
  time: "03:00",
  day_of_week: 1,
  preset: "all",
  run_as_admin: true,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TaskStatus({ task }: { task: ScheduledTask }) {
  const active = task.enabled && task.status.toLowerCase() !== "disabled";
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-xl px-4 py-2.5 border text-sm font-medium",
      active
        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        : "bg-white/5 border-white/[0.06] text-muted-foreground"
    )}>
      {active
        ? <CheckCircle2 size={15} className="shrink-0" />
        : <Calendar size={15} className="shrink-0" />}
      <span>スケジュール: {active ? "有効" : "無効"}</span>
      {task.status && <span className="ml-1 opacity-60">({task.status})</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Scheduler() {
  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingTask, setLoadingTask] = useState(true);

  const fetchTask = useCallback(async () => {
    setLoadingTask(true);
    try {
      const t = await invoke<ScheduledTask | null>("get_schedule");
      setTask(t);
    } catch {
      setTask(null);
    } finally {
      setLoadingTask(false);
    }
  }, []);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await invoke("create_schedule", { config });
      toast.success("スケジュールを作成しました");
      await fetchTask();
    } catch (e) {
      toast.error(`作成失敗: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await invoke("delete_schedule");
      toast.success("スケジュールを削除しました");
      setTask(null);
    } catch (e) {
      toast.error(`削除失敗: ${e}`);
    } finally {
      setDeleting(false);
    }
  };

  const set = <K extends keyof ScheduleConfig>(key: K, val: ScheduleConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: val }));

  const showTimePicker = config.trigger === "daily" || config.trigger === "weekly";
  const showDayPicker  = config.trigger === "weekly";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">最適化スケジューラー</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Current task status */}
        {!loadingTask && (
          task
            ? <TaskStatus task={task} />
            : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-xs text-muted-foreground">
                スケジュールは未設定です
              </div>
            )
        )}

        {/* Task run times */}
        {task && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">次回実行</p>
              <p className="text-sm text-white">{task.next_run || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">前回実行</p>
              <p className="text-sm text-white">{task.last_run || "—"}</p>
            </div>
          </div>
        )}

        {/* Configure form */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-5">
          <p className="text-sm font-medium text-white">スケジュール設定</p>

          {/* Trigger */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">実行タイミング</p>
            <div className="grid grid-cols-4 gap-2">
              {TRIGGERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set("trigger", t.id)}
                  className={cn(
                    "py-2 rounded-xl border text-xs font-medium transition-all",
                    config.trigger === t.id
                      ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                      : "bg-white/[0.03] border-white/[0.06] text-muted-foreground hover:text-slate-300 hover:bg-white/[0.06]"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time picker */}
          {showTimePicker && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">実行時刻 (HH:MM)</p>
              <label htmlFor="schedule-time" className="sr-only">実行時刻</label>
              <input
                id="schedule-time"
                type="time"
                title="実行時刻 (HH:MM)"
                aria-label="実行時刻"
                value={config.time}
                onChange={(e) => set("time", e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40 w-36"
              />
            </div>
          )}

          {/* Day of week */}
          {showDayPicker && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">曜日</p>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => set("day_of_week", i)}
                    className={cn(
                      "w-8 h-8 rounded-lg border text-xs font-medium transition-all",
                      config.day_of_week === i
                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                        : "bg-white/[0.03] border-white/[0.06] text-muted-foreground hover:text-slate-300 hover:bg-white/[0.06]"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preset selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">最適化プリセット</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set("preset", p.id)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    config.preset === p.id
                      ? "bg-cyan-500/10 border-cyan-500/30"
                      : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                  )}
                >
                  <p className={cn("text-xs font-medium", config.preset === p.id ? "text-cyan-400" : "text-slate-300")}>
                    {p.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Admin warning */}
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-2.5">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400/80">
            管理者権限が必要な場合があります。スケジュール作成時にUACプロンプトが表示されることがあります。
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            <Plus size={15} />
            {creating ? "作成中..." : task ? "スケジュールを更新" : "スケジュールを作成"}
          </button>

          {task && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Trash2 size={15} />
              {deleting ? "削除中..." : "削除"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
