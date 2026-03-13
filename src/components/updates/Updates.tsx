import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Shield,
  RefreshCw,
  Sparkles,
  Download,
  ExternalLink,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Cpu,
} from "lucide-react";
import type { AppUpdate, AiUpdatePriority, DriverInfo } from "@/types";

// ── Priority badge ─────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  critical:    { label: "重要",      cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  recommended: { label: "推奨",      cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  optional:    { label: "任意",      cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  skip:        { label: "スキップ",  cls: "bg-secondary text-muted-foreground border-border" },
} as const;

function PriorityBadge({ priority, reason }: { priority: AiUpdatePriority["priority"]; reason: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.optional;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium border rounded-full px-2 py-0.5 cursor-help ${cfg.cls}`}
      title={reason}
    >
      {cfg.label}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Updates() {
  const [appUpdates, setAppUpdates]     = useState<AppUpdate[]>([]);
  const [drivers, setDrivers]           = useState<DriverInfo[]>([]);
  const [priorities, setPriorities]     = useState<Record<string, AiUpdatePriority>>({});
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  const [loadingApps, setLoadingApps]   = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [loadingAi, setLoadingAi]       = useState(false);
  const [upgrading, setUpgrading]       = useState(false);

  const [appLog, setAppLog]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [aiLog, setAiLog]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [upgradeLog, setUpgradeLog]     = useState<string[] | null>(null);

  // Load on mount
  useEffect(() => {
    fetchAppUpdates();
    fetchDrivers();
  }, []);

  // Auto-clear logs
  useEffect(() => {
    if (!appLog) return;
    const t = setTimeout(() => setAppLog(null), 5000);
    return () => clearTimeout(t);
  }, [appLog]);

  useEffect(() => {
    if (!aiLog) return;
    const t = setTimeout(() => setAiLog(null), 6000);
    return () => clearTimeout(t);
  }, [aiLog]);

  const fetchAppUpdates = async () => {
    setLoadingApps(true);
    setAppLog(null);
    try {
      const updates = await invoke<AppUpdate[]>("check_app_updates");
      setAppUpdates(updates);
      setPriorities({});
      setSelected(new Set());
      if (updates.length === 0) {
        setAppLog({ msg: "すべてのアプリは最新です", ok: true });
      }
    } catch (e) {
      setAppLog({ msg: String(e), ok: false });
    } finally {
      setLoadingApps(false);
    }
  };

  const fetchDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const list = await invoke<DriverInfo[]>("check_driver_info");
      setDrivers(list);
    } catch {
      // silently ignore
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    setAiLog(null);
    try {
      const result = await invoke<AiUpdatePriority[]>("get_ai_update_priorities");
      const map: Record<string, AiUpdatePriority> = {};
      result.forEach((r) => { map[r.id] = r; });
      setPriorities(map);

      // Auto-select critical + recommended
      const autoSelect = new Set<string>();
      result.forEach((r) => {
        if (r.priority === "critical" || r.priority === "recommended") {
          autoSelect.add(r.id);
        }
      });
      setSelected(autoSelect);

      const critical = result.filter((r) => r.priority === "critical").length;
      setAiLog({
        msg: `AI分析完了: ${critical}件の重要アップデートを検出、${autoSelect.size}件を自動選択しました`,
        ok: true,
      });
    } catch (e) {
      setAiLog({ msg: String(e), ok: false });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleUpgrade = async () => {
    if (selected.size === 0) return;
    setUpgrading(true);
    setUpgradeLog(null);
    try {
      const results = await invoke<string[]>("upgrade_apps", { ids: Array.from(selected) });
      setUpgradeLog(results);
      // Refresh list after upgrade
      await fetchAppUpdates();
    } catch (e) {
      setUpgradeLog([String(e)]);
    } finally {
      setUpgrading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = appUpdates.length > 0 && appUpdates.every((u) => selected.has(u.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(appUpdates.map((u) => u.id)));
  };

  return (
    <div className="p-6 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-secondary border border-border rounded-lg">
            <Shield className="text-muted-foreground" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">アップデート</h1>
            <p className="text-sm text-muted-foreground">アプリとドライバーの更新確認</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAppUpdates}
            disabled={loadingApps}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors text-muted-foreground"
          >
            {loadingApps ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            再スキャン
          </button>

          {appUpdates.length > 0 && (
            <button
              type="button"
              onClick={handleAiAnalysis}
              disabled={loadingAi || loadingApps}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
            >
              {loadingAi ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              AI優先度分析
            </button>
          )}
        </div>
      </div>

      {/* App log */}
      {appLog && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${appLog.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {appLog.msg}
        </div>
      )}

      {/* AI log */}
      {aiLog && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${aiLog.ok ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {aiLog.msg}
        </div>
      )}

      {/* App updates section */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Download size={15} className="text-muted-foreground" />
            アプリアップデート
            {appUpdates.length > 0 && (
              <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                {appUpdates.length}件
              </span>
            )}
          </h2>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={upgrading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              {upgrading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {upgrading ? "更新中…" : `${selected.size}件を更新`}
            </button>
          )}
        </div>

        {loadingApps ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" />
            <span>wingetでスキャン中…</span>
          </div>
        ) : appUpdates.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            利用可能なアップデートはありません
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-primary"
                      aria-label="全選択"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">アプリ名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">バージョン</th>
                  {Object.keys(priorities).length > 0 && (
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">AI優先度</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appUpdates.map((update) => {
                  const prio = priorities[update.id];
                  return (
                    <tr
                      key={update.id}
                      className="hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => toggleSelect(update.id)}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(update.id)}
                          onChange={() => toggleSelect(update.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-primary"
                          aria-label={`${update.name}を選択`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium truncate max-w-[200px]">{update.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{update.id}</p>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-muted-foreground">{update.current_version}</span>
                        <ChevronRight size={11} className="inline mx-1 text-muted-foreground/50" />
                        <span className="text-green-400 font-medium">{update.available_version}</span>
                      </td>
                      {Object.keys(priorities).length > 0 && (
                        <td className="px-3 py-2.5">
                          {prio ? (
                            <PriorityBadge priority={prio.priority} reason={prio.reason} />
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Upgrade log */}
        {upgradeLog && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 font-mono text-xs space-y-0.5 max-h-40 overflow-y-auto">
            {upgradeLog.map((line, i) => (
              <p
                key={i}
                className={line.startsWith("✓") ? "text-green-400" : "text-red-400"}
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* Driver info section */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Cpu size={15} className="text-muted-foreground" />
          インストール済みドライバー
          {drivers.length > 0 && (
            <span className="text-[11px] bg-secondary text-muted-foreground border border-border rounded-full px-2 py-0.5">
              {drivers.length}件
            </span>
          )}
        </h2>

        {loadingDrivers ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 size={16} className="animate-spin" />
            <span>ドライバー情報を取得中…</span>
          </div>
        ) : drivers.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            ドライバー情報を取得できませんでした
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">デバイス名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">プロバイダー</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">バージョン</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">日付</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {drivers.map((d, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <p className="font-medium truncate max-w-[180px]">{d.device_name}</p>
                      <p className="text-[10px] text-muted-foreground">{d.device_class}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell text-xs truncate max-w-[120px]">
                      {d.provider}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{d.driver_version}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{d.driver_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Windows Update link */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium">Windows Update</p>
            <p className="text-xs text-muted-foreground">システムアップデートはWindows設定から確認できます</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await invoke("plugin:shell|open", { path: "ms-settings:windowsupdate" });
            } catch {
              // fallback: silently ignore
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-medium hover:bg-secondary/80 transition-colors text-muted-foreground shrink-0"
        >
          <ExternalLink size={12} />
          設定を開く
        </button>
      </div>
    </div>
  );
}
