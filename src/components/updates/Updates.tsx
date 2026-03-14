import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/useAppStore";
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
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { VendorIcon } from "@/lib/VendorIcon";
import type { VendorKey } from "@/lib/VendorIcon";

// ── App avatar — brand-colored by winget publisher prefix ───────────────────

// Known publisher prefixes (winget ID: "Publisher.AppName") → Tailwind classes
const PUBLISHER_BRAND: Record<string, string> = {
  google:     "bg-[#4285F4] text-white",
  mozilla:    "bg-[#FF7139] text-white",
  microsoft:  "bg-[#00A4EF] text-white",
  valve:      "bg-[#1b2838] text-[#c7d5e0]",
  discord:    "bg-[#5865F2] text-white",
  spotify:    "bg-[#1DB954] text-white",
  brave:      "bg-[#FB542B] text-white",
  adobe:      "bg-red-600 text-white",
  github:     "bg-[#24292e] text-white",
  git:        "bg-[#F05033] text-white",
  jetbrains:  "bg-black text-[#FF318C]",
  zoom:       "bg-[#2D8CFF] text-white",
  slack:      "bg-[#4A154B] text-[#E01E5A]",
  obsproject: "bg-[#302E31] text-[#a579fc]",
  videolan:   "bg-[#FF8800] text-white",
  "7zip":     "bg-[#2A5F94] text-white",
  notepad:    "bg-[#90E59A] text-[#1e1e1e]",
  python:     "bg-[#FFD43B] text-[#306998]",
  openjs:     "bg-[#339933] text-white",
  rustlang:   "bg-[#ce422b] text-white",
  docker:     "bg-[#2496ED] text-white",
  twitch:     "bg-[#9146FF] text-white",
  rarlab:     "bg-[#8B0000] text-white",
  epicgames:  "bg-[#2a2a2a] text-white",
  teamviewer: "bg-[#0E8EE9] text-white",
  autohotkey: "bg-[#334455] text-[#6dcfcf]",
};

const FALLBACK_CLASSES = [
  "bg-cyan-700 text-white",
  "bg-blue-700 text-white",
  "bg-violet-700 text-white",
  "bg-emerald-800 text-white",
  "bg-amber-900 text-white",
  "bg-rose-800 text-white",
  "bg-indigo-700 text-white",
  "bg-teal-700 text-white",
];

function resolveAppBrand(wingetId: string, name: string): { cls: string; letter: string } {
  const publisher = wingetId.split(".")[0]?.toLowerCase() ?? "";
  const letter = (name.trim()[0] ?? wingetId[0] ?? "?").toUpperCase();
  if (PUBLISHER_BRAND[publisher]) return { cls: PUBLISHER_BRAND[publisher], letter };
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { cls: FALLBACK_CLASSES[h % FALLBACK_CLASSES.length], letter };
}

function AppAvatar({ id, name }: { id: string; name: string }) {
  const { cls, letter } = resolveAppBrand(id, name);
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 ${cls}`}>
      {letter}
    </span>
  );
}

// ── Driver vendor icon ──────────────────────────────────────────────────────

function detectDriverVendor(provider: string, deviceName: string): VendorKey | null {
  const s = `${provider} ${deviceName}`.toLowerCase();
  if (s.includes("nvidia")) return "nvidia";
  if (s.includes("amd") || s.includes("advanced micro") || s.includes("radeon")) return "amd";
  if (s.includes("intel")) return "intel";
  return null;
}

// ── Priority badge ─────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  critical:    { label: "重要",      cls: "bg-red-500/25 text-red-300 border-red-500/50",        rowCls: "bg-red-500/[0.06] border-l-2 border-l-red-500/50" },
  recommended: { label: "推奨",      cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",  rowCls: "bg-amber-500/[0.04]" },
  optional:    { label: "任意",      cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",     rowCls: "" },
  skip:        { label: "スキップ",  cls: "bg-white/[0.06] text-muted-foreground border-white/10", rowCls: "" },
} as const;

function PriorityBadge({ priority, reason, confidence }: { priority: AiUpdatePriority["priority"]; reason: string; confidence: number }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.optional;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center text-[10px] font-semibold border rounded-full px-2.5 py-0.5 cursor-help tracking-wide ${cfg.cls}`}
        title={reason}
      >
        {priority === "critical" && <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
        {cfg.label}
      </span>
      {confidence > 0 && <ConfidenceBadge confidence={confidence} showLabel={false} />}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Updates() {
  const { hasApiKey } = useAppStore();
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
    if (!aiLog?.ok) return; // errors stay visible; only dismiss successes
    const t = setTimeout(() => setAiLog(null), 8000);
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

  const hasPriorities = Object.keys(priorities).length > 0;

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <Shield className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">アップデート</h1>
            <p className="text-xs text-muted-foreground mt-0.5">アプリとドライバーの更新確認</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAppUpdates}
            disabled={loadingApps}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.10] text-sm font-medium hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors text-muted-foreground"
          >
            {loadingApps ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            再スキャン
          </button>

          {appUpdates.length > 0 && (
            <button
              type="button"
              onClick={handleAiAnalysis}
              disabled={loadingAi || loadingApps || !hasApiKey}
              title={!hasApiKey ? "設定ページでAPIキーを登録してください" : undefined}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
            >
              {loadingAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI優先度分析
            </button>
          )}
        </div>
      </div>

      {/* App log */}
      {appLog && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${appLog.ok ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
          {appLog.msg}
        </div>
      )}

      {/* AI log */}
      {aiLog && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${aiLog.ok ? "bg-purple-500/10 border-purple-500/25 text-purple-400" : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
          {aiLog.msg}
        </div>
      )}

      {/* App updates section */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Download size={14} className="text-cyan-400" />
            アプリアップデート
            {appUpdates.length > 0 && (
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full px-2 py-0.5 font-semibold">
                {appUpdates.length}件
              </span>
            )}
          </h2>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={upgrading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all active:scale-[0.97]"
            >
              {upgrading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {upgrading ? "更新中…" : `${selected.size}件を更新`}
            </button>
          )}
        </div>

        {loadingApps ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 size={15} className="animate-spin text-cyan-400" />
            <span>wingetでスキャン中…</span>
          </div>
        ) : appUpdates.length === 0 ? (
          <div className="bg-[#05080c] border border-white/[0.12] rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
            利用可能なアップデートはありません
          </div>
        ) : (
          <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]">
                <tr>
                  <th className="px-3 py-2.5 text-left w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-cyan-500"
                      aria-label="全選択"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">アプリ名</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">バージョン</th>
                  {hasPriorities && (
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">AI優先度</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {appUpdates.map((update) => {
                  const prio = priorities[update.id];
                  const rowBg = prio ? (PRIORITY_CONFIG[prio.priority]?.rowCls ?? "") : "";
                  return (
                    <tr
                      key={update.id}
                      className={`hover:bg-white/[0.03] transition-colors cursor-pointer ${rowBg}`}
                      onClick={() => toggleSelect(update.id)}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(update.id)}
                          onChange={() => toggleSelect(update.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-cyan-500"
                          aria-label={`${update.name}を選択`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <AppAvatar id={update.id} name={update.name} />
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[180px]">{update.name}</p>
                            <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{update.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground/70 text-xs">{update.current_version}</span>
                          <ChevronRight size={10} className="text-muted-foreground/55" />
                          <span className="text-emerald-400 font-semibold text-xs">{update.available_version}</span>
                        </div>
                      </td>
                      {hasPriorities && (
                        <td className="px-3 py-3">
                          {prio ? (
                            <PriorityBadge priority={prio.priority} reason={prio.reason} confidence={prio.confidence ?? 0} />
                          ) : (
                            <span className="text-xs text-muted-foreground/55">—</span>
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
          <div className="bg-[#05080c] border border-white/[0.12] rounded-xl p-3 font-mono text-xs space-y-0.5 max-h-40 overflow-y-auto">
            {upgradeLog.map((line, i) => (
              <p
                key={i}
                className={line.startsWith("✓") ? "text-emerald-400" : "text-red-400"}
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
          <Cpu size={14} className="text-cyan-400" />
          インストール済みドライバー
          {drivers.length > 0 && (
            <span className="text-[10px] bg-white/5 text-muted-foreground border border-white/[0.12] rounded-full px-2 py-0.5">
              {drivers.length}件
            </span>
          )}
        </h2>

        {loadingDrivers ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 size={15} className="animate-spin text-cyan-400" />
            <span>ドライバー情報を取得中…</span>
          </div>
        ) : drivers.length === 0 ? (
          <div className="bg-[#05080c] border border-white/[0.12] rounded-xl px-4 py-6 text-center text-sm text-muted-foreground">
            ドライバー情報を取得できませんでした
          </div>
        ) : (
          <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">デバイス名</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">プロバイダー</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">バージョン</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">日付</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {drivers.map((d, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {(() => {
                          const v = detectDriverVendor(d.provider, d.device_name);
                          return v ? (
                            <VendorIcon vendor={v} className="w-5 h-5 shrink-0" />
                          ) : (
                            <Cpu size={16} className="text-muted-foreground/50 shrink-0" />
                          );
                        })()}
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[160px]">{d.device_name}</p>
                          <p className="text-[10px] text-muted-foreground/60">{d.device_class}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground/70 hidden md:table-cell text-xs truncate max-w-[120px]">
                      {d.provider}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground/70">{d.driver_version}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground/60 hidden sm:table-cell">{d.driver_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Windows Update link */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium">Windows Update</p>
            <p className="text-xs text-muted-foreground/70">システムアップデートはWindows設定から確認できます</p>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/[0.10] text-xs font-medium hover:bg-white/10 hover:text-foreground transition-colors text-muted-foreground shrink-0"
        >
          <ExternalLink size={11} />
          設定を開く
        </button>
      </div>
    </div>
  );
}
