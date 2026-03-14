import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LayoutDashboard, Gamepad2, Monitor, HardDrive, Wifi, BookMarked, Library, Settings as SettingsIcon, Shield, Cpu, ShieldCheck, SlidersHorizontal, Lightbulb, Bell, Gauge, Activity, Rocket, Calendar, Trash2, FileSearch, BarChart3, TrendingDown, Loader2, X, Thermometer, Zap } from "lucide-react";
import type { AppearanceSettings, OptimizationScore, TempSnapshot, GpuPowerLimit, OptimizationSession } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useAppStore } from "@/stores/useAppStore";
import { useWatcherStore } from "@/stores/useWatcherStore";
import { useSafetyStore } from "@/stores/useSafetyStore";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { DashboardV2 } from "@/components/dashboard/DashboardV2";
import { HomeHub } from "@/components/dashboard/HomeHub";
import { GameMode } from "@/components/optimization/GameMode";
import { Presets } from "@/components/optimization/Presets";
import { ProcessManager } from "@/components/optimization/ProcessManager";
import { WindowsOptimization } from "@/components/optimization/WindowsOptimization";
import { StorageManager } from "@/components/optimization/StorageManager";
import { NetworkHub } from "@/components/network/NetworkHub";
import { GamesLibrary } from "@/components/games/GamesLibrary";
import { ProfilesHub } from "@/components/profiles/ProfilesHub";
import { GamePerformanceLog } from "@/components/games/GamePerformanceLog";
import { GameSettingsAdvisor } from "@/components/games/GameSettingsAdvisor";
import { GameIntegrity } from "@/components/games/GameIntegrity";
import { HardwareHub } from "@/components/hardware/HardwareHub";
import { Benchmark } from "@/components/benchmark/Benchmark";
import { StartupManager } from "@/components/optimization/StartupManager";
import { Scheduler } from "@/components/settings/Scheduler";
import { AppUninstaller } from "@/components/settings/AppUninstaller";
import { UpdatesHub } from "@/components/updates/UpdatesHub";
import { RollbackCenter } from "@/components/rollback/RollbackCenter";
import { SimulationPanel } from "@/components/rollback/SimulationPanel";
import { EventLog } from "@/components/notifications/EventLog";
import { SettingsHub } from "@/components/settings/SettingsHub";
import { OsdOverlay } from "@/components/osd/OsdOverlay";
import { ToastContainer } from "@/components/ui/Toast";
import { RiskSummary } from "@/components/ui/RiskSummary";
import type { ActivePage } from "@/types";

// ── [Phase D] HomeHub feature flag ────────────────────────────────────────────
// Set to `true` to activate the HomeHub 司令塔 as the "home" page.
// Default: false — DashboardV2 is used as fallback.
const ENABLE_HOME_HUB = true;

// ── Synergy #3: Score Regression Watcher ──────────────────────────────────────
// Feature flag — set to `true` to enable background score monitoring.
// Default: false — no polling, no UI changes.
const ENABLE_SCORE_REGRESSION_WATCH = false;

/** Score drop ≥ this many points triggers the regression alert */
const REGRESSION_THRESHOLD = 15;
/** Polling interval (ms). 5 minutes by default. */
const REGRESSION_POLL_MS = 5 * 60 * 1000;

function ScoreRegressionWatcher() {
  const [baseline, setBaseline] = useState<number | null>(null);
  const [alert, setAlert] = useState<{ current: number; delta: number } | null>(null);
  const [reoptimizing, setReoptimizing] = useState(false);
  const baselineRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const score = await invoke<OptimizationScore>("get_optimization_score");
      if (baselineRef.current === null) {
        // First poll — set baseline, no alert
        baselineRef.current = score.overall;
        setBaseline(score.overall);
        return;
      }
      const drop = baselineRef.current - score.overall;
      if (drop >= REGRESSION_THRESHOLD) {
        setAlert({ current: score.overall, delta: Math.round(drop) });
      }
    } catch {
      // silent — don't spam toasts from background polling
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, REGRESSION_POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const handleReoptimize = async () => {
    setReoptimizing(true);
    try {
      await invoke("apply_preset", { preset: "esports" });
      toast.success("再最適化が完了しました");
      setAlert(null);
      // Refresh baseline after reoptimize
      const fresh = await invoke<OptimizationScore>("get_optimization_score");
      baselineRef.current = fresh.overall;
      setBaseline(fresh.overall);
    } catch (e) {
      toast.error("再最適化に失敗しました: " + String(e));
    } finally {
      setReoptimizing(false);
    }
  };

  const dismiss = () => {
    setAlert(null);
    // Reset baseline so next regression is measured from current state
    baselineRef.current = null;
  };

  if (!alert) return null;

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
      <div className="pointer-events-auto bg-[#05080c] border border-amber-500/40 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg shrink-0 mt-0.5">
            <TrendingDown size={13} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">スコアが低下しています</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              ベースライン: <span className="text-white tabular-nums">{baseline?.toFixed(0)}</span>
              {" → "}現在: <span className="text-amber-300 tabular-nums">{alert.current.toFixed(0)}</span>
              {" （"}
              <span className="text-red-400 tabular-nums">−{alert.delta}</span>
              {" ポイント）"}
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleReoptimize}
                disabled={reoptimizing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-lg hover:brightness-110 disabled:opacity-50 transition-all active:scale-[0.97]"
              >
                {reoptimizing ? <Loader2 size={11} className="animate-spin" /> : null}
                {reoptimizing ? "最適化中..." : "Esports プリセットで再最適化"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground/60 hover:text-white border border-white/[0.07] hover:border-white/20 rounded-lg transition-colors"
              >
                <X size={11} />
                閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Synergy #5: Thermal Watcher ───────────────────────────────────────────────
// Feature flag — set to `true` to enable background GPU temperature monitoring.
// Default: false — no polling, no UI changes.
const ENABLE_THERMAL_AUTO_REDUCTION = false;

/** GPU temp (°C) above which a warning is issued */
const THERMAL_DANGER_TEMP = 85;
/** Number of consecutive danger readings before showing the alert (~N × POLL_MS ms) */
const THERMAL_SUSTAINED_COUNT = 3;
/** Polling interval (ms) */
const THERMAL_POLL_MS = 2000;
/** How long (ms) to suppress re-alerts after user dismisses */
const THERMAL_SNOOZE_MS = 10 * 60 * 1000; // 10 minutes

function ThermalWatcher() {
  const dangerCount = useRef(0);
  const [alert, setAlert] = useState<{ gpuTemp: number } | null>(null);
  const [reducing, setReducing] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  const poll = useCallback(async () => {
    try {
      const snap = await invoke<TempSnapshot>("get_temperature_snapshot");
      const temp = snap.gpu_temp_c;

      if (temp <= 0) return; // no GPU data available

      if (temp >= THERMAL_DANGER_TEMP) {
        dangerCount.current += 1;
        if (dangerCount.current >= THERMAL_SUSTAINED_COUNT && Date.now() > snoozedUntil) {
          setAlert({ gpuTemp: temp });
        }
      } else {
        // Temperature returned to safe zone — reset counter and clear alert
        dangerCount.current = 0;
        setAlert(null);
      }
    } catch {
      // silent — GPU may not be NVIDIA or sensor unavailable
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snoozedUntil]);

  useEffect(() => {
    const id = setInterval(poll, THERMAL_POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const handleReduce = async () => {
    setReducing(true);
    try {
      const info = await invoke<GpuPowerLimit>("get_gpu_power_info");
      const target = Math.max(info.min_w, Math.round(info.default_w * 0.8));
      await invoke("set_gpu_power_limit", { gpuIndex: 0, watts: target });
      toast.success(`GPU電力制限を ${target}W（デフォルトの80%）に引き下げました`);
      setAlert(null);
      dangerCount.current = 0;
      setSnoozedUntil(Date.now() + THERMAL_SNOOZE_MS);
    } catch (e) {
      toast.error("GPU電力制限の変更に失敗しました: " + String(e));
    } finally {
      setReducing(false);
    }
  };

  const handleSnooze = () => {
    setAlert(null);
    dangerCount.current = 0;
    setSnoozedUntil(Date.now() + THERMAL_SNOOZE_MS);
  };

  if (!alert) return null;

  return (
    <div className="fixed bottom-16 right-4 z-50 w-80 pointer-events-none">
      <div className="pointer-events-auto bg-[#05080c] border border-red-500/40 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg shrink-0 mt-0.5">
            <Thermometer size={13} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300">GPU過熱を検出</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              GPU温度が <span className="text-red-400 font-bold tabular-nums">{alert.gpuTemp.toFixed(0)}°C</span> を超えています（危険域 ≥{THERMAL_DANGER_TEMP}°C）
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleReduce}
                disabled={reducing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-red-500 to-amber-500 text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-all active:scale-[0.97]"
              >
                {reducing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {reducing ? "設定中..." : "GPU電力を80%に下げる"}
              </button>
              <button
                type="button"
                onClick={handleSnooze}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground/60 hover:text-white border border-white/[0.07] hover:border-white/20 rounded-lg transition-colors"
              >
                <X size={11} />
                10分無視
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Phase 2F: Global Rollback Header ─────────────────────────────────────────
// Feature flag — set to `true` to show a persistent rollback/result/risk strip
// at the top of every screen. Default: false — no visible change.
const ENABLE_GLOBAL_ROLLBACK_HEADER = false;

function GlobalRollbackHeader() {
  const { sessions, setSessions } = useSafetyStore();
  const { setActivePage } = useAppStore();
  const [showRiskLegend, setShowRiskLegend] = useState(false);
  const [showLastResult, setShowLastResult] = useState(false);

  // Populate sessions if the store is empty (RollbackCenter not yet visited)
  useEffect(() => {
    if (sessions.length === 0) {
      invoke<OptimizationSession[]>("list_sessions").then(setSessions).catch(() => {});
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestSession = sessions.length > 0
    ? [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
    : null;
  const rollbackableCount = sessions.filter((s) => s.status === "applied").length;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-[#05080c] border-b border-white/[0.04] text-xs text-muted-foreground/60 shrink-0">
      {/* Rollback Center link with count badge */}
      <button
        type="button"
        onClick={() => setActivePage("rollback")}
        className="flex items-center gap-1.5 hover:text-white transition-colors"
      >
        <ShieldCheck size={12} className="text-cyan-400/60" />
        <span>ロールバック</span>
        {rollbackableCount > 0 && (
          <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full px-1.5 text-[10px] tabular-nums leading-4">
            {rollbackableCount}
          </span>
        )}
      </button>

      <div className="w-px h-3 bg-white/[0.06]" />

      {/* Last optimization result */}
      <div className="relative">
        <button
          type="button"
          onMouseEnter={() => setShowLastResult(true)}
          onMouseLeave={() => setShowLastResult(false)}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          <Activity size={12} />
          <span>
            {latestSession
              ? `最終: ${latestSession.changes.length}件 · ${latestSession.status}`
              : "最終: なし"}
          </span>
        </button>
        {showLastResult && latestSession && (
          <div className="absolute top-full left-0 mt-1 z-50 w-60 bg-popover border border-border rounded-md shadow-xl p-3 text-xs pointer-events-none">
            <p className="font-semibold text-foreground mb-1">最終最適化セッション</p>
            <p className="text-muted-foreground/70">{new Date(latestSession.started_at).toLocaleString("ja-JP")}</p>
            <p className="mt-1.5">変更数: <span className="text-foreground tabular-nums">{latestSession.changes.length}</span></p>
            <div className="mt-1">
              <RiskSummary
                safe={latestSession.changes.filter((c) => c.risk_level === "safe").length}
                caution={latestSession.changes.filter((c) => c.risk_level === "caution").length}
                advanced={latestSession.changes.filter((c) => c.risk_level === "advanced").length}
                emptyLabel="変更なし"
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-3 bg-white/[0.06]" />

      {/* Risk Legend */}
      <div className="relative">
        <button
          type="button"
          onMouseEnter={() => setShowRiskLegend(true)}
          onMouseLeave={() => setShowRiskLegend(false)}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          <Shield size={12} />
          <span>リスク凡例</span>
        </button>
        {showRiskLegend && (
          <div className="absolute top-full left-0 mt-1 z-50 w-52 bg-popover border border-border rounded-md shadow-xl p-3 text-xs pointer-events-none">
            <p className="font-semibold text-foreground mb-2">リスクレベル</p>
            <div className="flex flex-col gap-1.5 text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span><span className="text-green-400 font-medium">safe</span> — 安全・影響小</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span><span className="text-amber-400 font-medium">caution</span> — 要注意・要再起動</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                <span><span className="text-red-400 font-medium">advanced</span> — 高度・慎重に</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type NavEntry =
  | { type: "section"; label: string }
  | { type?: "item"; id: ActivePage; icon: React.ReactNode; label: string; phase?: string };

const NAV_ITEMS: NavEntry[] = [
  { type: "section", label: "メイン" },
  { id: "home",        icon: <LayoutDashboard size={17} />, label: "ホーム" },       // [Phase D] 司令塔（dashboard/dashboardv2 吸収）

  { type: "section", label: "最適化" },
  { id: "optimize",   icon: <Gamepad2 size={17} />,         label: "最適化" },      // [Phase D] GameMode改称
  { id: "gamemode",   icon: <Gamepad2 size={17} />,         label: "ゲームモード" },
  { id: "presets",    icon: <SlidersHorizontal size={17} />, label: "プリセット" },
  { id: "process",    icon: <Activity size={17} />,         label: "プロセス管理" },
  { id: "windows",    icon: <Monitor size={17} />,          label: "Windows最適化" },
  { id: "storage",    icon: <HardDrive size={17} />,        label: "ストレージ" },
  { id: "network",    icon: <Wifi size={17} />,             label: "ネットワーク" },

  { type: "section", label: "ゲーム" },
  { id: "games",      icon: <Library size={17} />,          label: "Myゲーム" },
  { id: "profiles",   icon: <BookMarked size={17} />,       label: "プロファイル" },
  { id: "gamelog",    icon: <BarChart3 size={17} />,        label: "パフォーマンスログ" },
  { id: "advisor",    icon: <Lightbulb size={17} />,        label: "設定アドバイザー" },
  { id: "gameintegrity", icon: <FileSearch size={17} />,    label: "ファイル検証" },

  { type: "section", label: "ハードウェア" },
  { id: "hardware",   icon: <Cpu size={17} />,              label: "ハードウェア" },
  { id: "benchmark",  icon: <Gauge size={17} />,            label: "ベンチマーク" },

  { type: "section", label: "管理" },                        // [Phase D] システム→管理
  { id: "rollback",   icon: <ShieldCheck size={17} />,      label: "ロールバック" }, // [Phase D] 先頭に昇格
  { id: "startup",    icon: <Rocket size={17} />,           label: "スタートアップ" },
  { id: "scheduler",  icon: <Calendar size={17} />,         label: "スケジューラー" },
  { id: "uninstaller", icon: <Trash2 size={17} />,          label: "アプリ管理" },
  { id: "updates",    icon: <Shield size={17} />,           label: "アップデート" },

  { type: "section", label: "その他" },
  { id: "notifications", icon: <Bell size={17} />,          label: "通知センター" },
  { id: "settings",   icon: <SettingsIcon size={17} />,     label: "設定" },
];

function PageContent({ page }: { page: ActivePage }) {
  switch (page) {
    // ── [Phase C/D] 新規ページ（ENABLE_HOME_HUB で有効化）──────────────────
    // flag OFF の間は既存コンポーネントにフォールバック
    case "home":
      return ENABLE_HOME_HUB ? <HomeHub /> : <DashboardV2 />;
    case "optimize":
      return <GameMode />;
    // ── 既存ページ ────────────────────────────────────────────────────────
    case "dashboard":
      return <Dashboard />;
    case "dashboardv2":
      return <DashboardV2 />;
    case "gamemode":
      return <GameMode />;
    case "presets":
      return <Presets />;
    case "process":
      return <ProcessManager />;
    case "windows":
      return <WindowsOptimization />;
    case "storage":
      return <StorageManager />;
    case "network":
      return <NetworkHub />;
    case "games":
      return <GamesLibrary />;
    case "profiles":
      return <ProfilesHub />;
    case "gamelog":
      return <GamePerformanceLog />;
    case "advisor":
      return <GameSettingsAdvisor />;
    case "gameintegrity":
      return <GameIntegrity />;
    case "hardware":
      return <HardwareHub />;
    case "benchmark":
      return <Benchmark />;
    case "startup":
      return <StartupManager />;
    case "scheduler":
      return <Scheduler />;
    case "uninstaller":
      return <AppUninstaller />;
    case "updates":
      return <UpdatesHub />;
    case "rollback":
      return <RollbackCenter />;
    case "notifications":
      return <EventLog />;
    case "settings":
      return <SettingsHub />;
  }
}

export default function App() {
  // OSD window detection: render only the overlay for the second window
  if (typeof window !== "undefined" && window.location.hash === "#/osd") {
    return <OsdOverlay />;
  }

  const { activePage, setActivePage, gameModeActive } = useAppStore();
  const { activeProfileId, setActiveProfileId, setAutoOptimize } = useWatcherStore();

  // Load saved appearance on mount
  useEffect(() => {
    invoke<AppearanceSettings>("get_appearance")
      .then((s) => {
        document.documentElement.setAttribute("data-accent", s.accent_color);
        document.documentElement.setAttribute("data-font-size", s.font_size);
      })
      .catch(() => {});
  }, []);

  // Listen for Rust-side events (watcher applies/restores, tray toggle)
  useEffect(() => {
    const u1 = listen<string | null>("active_profile_changed", (e) =>
      setActiveProfileId(e.payload ?? null)
    );
    const u2 = listen<boolean>("auto_optimize_changed", (e) =>
      setAutoOptimize(e.payload)
    );
    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
    };
  }, [setActiveProfileId, setAutoOptimize]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col shrink-0 border-r border-white/[0.06] bg-sidebar sidebar-dots relative">
        {/* Top gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-[15px] relative">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/30 to-emerald-500/15 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.2)]">
            <Gamepad2 size={16} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-[13px] font-bold leading-none tracking-tight text-white">Gaming</p>
            <p className="text-[9px] text-cyan-400/60 leading-none mt-1 tracking-[0.15em] uppercase">PC Optimizer</p>
          </div>
        </div>

        {/* Gradient divider */}
        <div className="section-divider mx-3" />

        {/* Nav */}
        <nav className="flex-1 p-2 pt-2.5 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item, i) => {
            if (item.type === "section") {
              return (
                <div key={`section-${i}`} className="px-3 pt-3 pb-1 first:pt-1">
                  <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.15em]">
                    {item.label}
                  </p>
                </div>
              );
            }
            const isActive = activePage === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left overflow-hidden",
                  isActive
                    ? "nav-active nav-active-bg text-cyan-200"
                    : "text-muted-foreground hover:text-slate-200 hover:bg-white/[0.04]"
                )}
              >
                <span className={cn(
                  "shrink-0 transition-colors",
                  isActive ? "text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" : "text-muted-foreground/70"
                )}>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.phase && !isActive && (
                  <span className="text-[9px] text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-md">
                    {item.phase}
                  </span>
                )}
                {item.id === "gamemode" && gameModeActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                )}
                {item.id === "profiles" && activeProfileId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Gradient divider */}
        <div className="section-divider mx-3" />

        {/* Footer */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="relative w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-cyan-400 block" />
            </div>
            <p className="text-[10px] text-muted-foreground/50 tracking-widest uppercase">v1.0.0 · AI搭載</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden content-glow relative flex flex-col">
        {/* [GLOBAL_ROLLBACK_HEADER] Persistent rollback/result/risk strip */}
        {ENABLE_GLOBAL_ROLLBACK_HEADER && <GlobalRollbackHeader />}
        <div className="flex-1 overflow-hidden">
          <PageContent page={activePage} />
        </div>
      </main>

      {/* Global toast notifications */}
      <ToastContainer />
      {/* Phase 3: Simulation / confirmation overlay */}
      <SimulationPanel />
      {/* [SCORE REGRESSION] Background watcher — only mounts when flag is ON */}
      {ENABLE_SCORE_REGRESSION_WATCH && <ScoreRegressionWatcher />}
      {/* [THERMAL] Background GPU temperature watcher — only mounts when flag is ON */}
      {ENABLE_THERMAL_AUTO_REDUCTION && <ThermalWatcher />}
    </div>
  );
}
