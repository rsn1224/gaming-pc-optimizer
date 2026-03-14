import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { StartupEntry } from "@/types";

type FilterTab = "all" | "enabled" | "disabled";

function Toggle({
  enabled,
  disabled: isDisabled,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isDisabled}
      aria-label={enabled ? "無効化" : "有効化"}
      className={cn(
        "relative w-10 h-5 rounded-full transition-colors shrink-0",
        enabled ? "bg-cyan-500" : "bg-white/10",
        isDisabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
          enabled ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function StartupManager() {
  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<StartupEntry[]>("get_startup_entries");
      setEntries(data);
    } catch (e) {
      toast.error(`スタートアップ情報の読み込みに失敗しました: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = useCallback(async (entry: StartupEntry) => {
    if (entry.source !== "HKCU_Run") return;
    const key = `${entry.source}::${entry.name}`;
    if (toggling) return;
    setToggling(key);
    try {
      if (entry.enabled) {
        await invoke("disable_startup_entry", { name: entry.name, source: entry.source });
        toast.success(`「${entry.name}」を無効化しました`);
      } else {
        await invoke("enable_startup_entry", { name: entry.name, source: entry.source });
        toast.success(`「${entry.name}」を有効化しました`);
      }
      await load();
    } catch (e) {
      toast.error(`変更に失敗しました: ${e}`);
    } finally {
      setToggling(null);
    }
  }, [toggling, load]);

  const filtered = entries.filter((e) => {
    if (filter === "enabled") return e.enabled;
    if (filter === "disabled") return !e.enabled;
    return true;
  });

  const enabledCount = entries.filter((e) => e.enabled).length;
  const disabledCount = entries.filter((e) => !e.enabled).length;

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "全て", count: entries.length },
    { id: "enabled", label: "有効", count: enabledCount },
    { id: "disabled", label: "無効", count: disabledCount },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-semibold text-white">スタートアップ管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {entries.length} 件 · 有効 {enabledCount} / 無効 {disabledCount}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          更新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Warning banner */}
        <div className="mx-6 mt-4 flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-300/80">
            スタートアップの変更は次回起動時に反映されます。HKLM エントリは管理者権限が必要なため変更できません。
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-6 mt-4">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filter === tab.id
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "text-muted-foreground hover:text-slate-200 hover:bg-white/[0.04] border border-transparent",
              )}
            >
              {tab.label}
              <span className={cn(
                "text-[10px] px-1 rounded",
                filter === tab.id ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.06] text-muted-foreground/60",
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Entry list */}
        <div className="p-6 pt-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-cyan-400/50" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              エントリが見つかりません
            </div>
          ) : (
            filtered.map((entry) => {
              const isHklm = entry.source === "HKLM_Run";
              const key = `${entry.source}::${entry.name}`;
              const isToggling = toggling === key;

              return (
                <div
                  key={key}
                  className={cn(
                    "bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-4",
                    !entry.enabled && "opacity-60",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200 truncate max-w-[200px]">
                        {entry.name}
                      </span>
                      {/* Source badge */}
                      <span className={cn(
                        "text-[10px] font-medium border px-1.5 py-0.5 rounded-full shrink-0",
                        isHklm
                          ? "bg-white/5 text-muted-foreground border-white/10"
                          : "bg-cyan-500/10 text-cyan-400/80 border-cyan-500/20",
                      )}>
                        {isHklm ? "HKLM" : "HKCU"}
                      </span>
                      {isHklm && (
                        <span className="text-[10px] text-muted-foreground/50 border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 rounded-full shrink-0">
                          読み取り専用
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-1 truncate font-mono">
                      {entry.command.length > 80
                        ? entry.command.slice(0, 80) + "…"
                        : entry.command}
                    </p>
                  </div>

                  {isToggling ? (
                    <Loader2 size={16} className="animate-spin text-cyan-400 shrink-0" />
                  ) : (
                    <Toggle
                      enabled={entry.enabled}
                      disabled={isHklm || !!toggling}
                      onToggle={() => handleToggle(entry)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
