import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Library, Loader2, Sparkles, ScanLine, Thermometer, Gauge, Clock, StopCircle, Gamepad2 as GamepadIcon } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useEditingStore } from "@/stores/useEditingStore";
import { useWatcherStore } from "@/stores/useWatcherStore";
import type { GameProfile, OptimizationScore, TempSnapshot, FpsEstimate, AiHardwareMode, MultiLauncherScanResult } from "@/types";
import { GameCard } from "./GameCard";
import { GameFilters } from "./GameFilters";

// ── Feature flags ─────────────────────────────────────────────────────────────
// Set to `true` to enable launch monitoring chain (captures score/temp/FPS during session).
// Default: false — existing launch behavior is unchanged when false.
const ENABLE_LAUNCH_MONITORING = false;

// Set to `true` to enable hardware-aware profile suggestions.
// Shows hardware tier banner and per-game compatibility hints.
// Default: false — no UI changes when false.
const ENABLE_HARDWARE_SUGGESTIONS = false;

// Set to `true` to enforce Profile SSOT (Single Source of Truth).
// When ON: AI tuning button and per-card mode editor are hidden.
// Profile editing is delegated exclusively to the Profiles page.
// Default: false — existing inline mode selector is unchanged when false.
const ENABLE_PROFILE_SSOT = false;

// Set to `true` to enable Epic / GOG / Xbox Game Pass scan button.
// Default: false — Steam-only scan is unchanged when false.
const ENABLE_MULTI_LAUNCHER = false;

// ── Hardware suggestion helpers ────────────────────────────────────────────────

/** Maps AI hardware mode → recommended game profile mode */
const HW_MODE_TO_GAME_MODE: Record<AiHardwareMode["mode"], string> = {
  performance: "competitive",
  balanced:    "balanced",
  efficiency:  "quality",
};

/** Determines if a game profile mode is compatible with hardware recommendation */
function hwCompatible(
  profileMode: string | undefined,
  hwMode: AiHardwareMode["mode"]
): "ok" | "warn" | null {
  if (!profileMode) return null; // no mode set — no opinion
  const suggested = HW_MODE_TO_GAME_MODE[hwMode];
  // "warn" only when competitive is used on efficiency hardware (most impactful mismatch)
  if (hwMode === "efficiency" && profileMode === "competitive") return "warn";
  // "ok" when it matches perfectly
  if (profileMode === suggested) return "ok";
  return null; // neutral (mild mismatch — not worth warning)
}

// ── Hardware banner ───────────────────────────────────────────────────────────

function HardwareBanner({ hwMode }: { hwMode: AiHardwareMode }) {
  const labels: Record<AiHardwareMode["mode"], string> = {
    performance: "ハイパフォーマンス",
    balanced:    "バランス",
    efficiency:  "省電力",
  };
  const colors: Record<AiHardwareMode["mode"], string> = {
    performance: "border-cyan-500/30 bg-cyan-500/5 text-cyan-300",
    balanced:    "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    efficiency:  "border-amber-500/30 bg-amber-500/5 text-amber-300",
  };
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${colors[hwMode.mode]}`}>
      <span className="font-semibold shrink-0">
        🖥 ハードウェア判定: {labels[hwMode.mode]}
      </span>
      <span className="text-muted-foreground/70 leading-relaxed">{hwMode.reason}</span>
    </div>
  );
}

// ── Session monitor types ─────────────────────────────────────────────────────

interface ActiveSession {
  profileId: string;
  gameName: string;
  startedAt: number;
  scoreBefore: OptimizationScore | null;
  liveTemp: TempSnapshot | null;
  liveFps: FpsEstimate | null;
}

// ── Session monitor panel ─────────────────────────────────────────────────────

function GameSessionMonitorPanel({
  session,
  onStop,
}: {
  session: ActiveSession;
  onStop: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const gpuTemp = session.liveTemp?.gpu_temp_c ?? 0;
  const tempColor =
    gpuTemp >= 85 ? "text-red-400" : gpuTemp >= 70 ? "text-amber-400" : "text-emerald-400";
  const fps = session.liveFps?.estimated_fps ?? 0;

  return (
    <div className="bg-[#05080c] border border-cyan-500/30 rounded-xl overflow-hidden">
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
      <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
        {/* Game name + elapsed */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)] shrink-0 animate-pulse" />
          <span className="text-sm font-semibold text-white truncate">{session.gameName}</span>
          <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1 shrink-0">
            <Clock size={10} />
            {fmt(elapsed)}
          </span>
        </div>

        {/* Live metrics */}
        <div className="flex items-center gap-4 shrink-0">
          {gpuTemp > 0 && (
            <div className="flex items-center gap-1.5">
              <Thermometer size={12} className={tempColor} />
              <span className={`text-xs tabular-nums font-medium ${tempColor}`}>
                {gpuTemp.toFixed(0)}°C
              </span>
            </div>
          )}
          {fps > 0 && (
            <div className="flex items-center gap-1.5">
              <Gauge size={12} className="text-cyan-400" />
              <span className="text-xs tabular-nums font-medium text-cyan-400">{fps} FPS</span>
            </div>
          )}
          {session.scoreBefore && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <span>最適化前スコア:</span>
              <span className="text-white font-semibold tabular-nums">
                {session.scoreBefore.overall.toFixed(0)}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] border border-white/[0.08] text-muted-foreground/60 hover:text-white hover:border-white/20 rounded-lg transition-colors"
          >
            <StopCircle size={11} />
            終了
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mode → optimization preset mapping ───────────────────────────────────────

const MODE_PRESETS: Record<
  string,
  Partial<Pick<GameProfile, "kill_bloatware" | "power_plan" | "windows_preset" | "storage_mode" | "network_mode" | "dns_preset">>
> = {
  competitive: {
    kill_bloatware: true,
    power_plan: "ultimate",
    windows_preset: "gaming",
    storage_mode: "light",
    network_mode: "gaming",
    dns_preset: "cloudflare",
  },
  balanced: {
    kill_bloatware: false,
    power_plan: "high_performance",
    windows_preset: "gaming",
    storage_mode: "none",
    network_mode: "none",
    dns_preset: "none",
  },
  quality: {
    kill_bloatware: false,
    power_plan: "none",
    windows_preset: "none",
    storage_mode: "none",
    network_mode: "none",
    dns_preset: "none",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GamesLibrary() {
  const { setActivePage } = useAppStore();
  const { setEditingProfileId } = useEditingStore();
  const { activeProfileId } = useWatcherStore();
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchLog, setLaunchLog] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  // Scan / AI state
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "tuning">("idle");
  const [scanLog, setScanLog] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Hardware suggestions (ENABLE_HARDWARE_SUGGESTIONS = true でのみ使用) ──────
  const [hwMode, setHwMode] = useState<AiHardwareMode | null>(null);

  useEffect(() => {
    if (!ENABLE_HARDWARE_SUGGESTIONS) return;
    invoke<AiHardwareMode>("get_ai_hardware_mode")
      .then(setHwMode)
      .catch(() => {}); // non-fatal
  }, []);

  // ── Launch Monitoring (ENABLE_LAUNCH_MONITORING = true でのみ使用) ───────────
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const monitorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSession = useCallback(() => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    setActiveSession(null);
  }, []);

  // Poll temp + FPS while session is active
  useEffect(() => {
    if (!ENABLE_LAUNCH_MONITORING || !activeSession) return;
    const poll = async () => {
      const [tempResult, fpsResult] = await Promise.allSettled([
        invoke<TempSnapshot>("get_temperature_snapshot"),
        invoke<FpsEstimate>("detect_game_fps"),
      ]);
      setActiveSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          liveTemp: tempResult.status === "fulfilled" ? tempResult.value : prev.liveTemp,
          liveFps: fpsResult.status === "fulfilled" ? fpsResult.value : prev.liveFps,
        };
      });
    };
    poll();
    monitorIntervalRef.current = setInterval(poll, 5000);
    return () => {
      if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
    };
  }, [activeSession?.profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
    };
  }, []);

  // Filter state
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  // Load profiles
  useEffect(() => {
    invoke<GameProfile[]>("list_profiles")
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-clear launch log after 5 seconds
  useEffect(() => {
    if (!launchLog) return;
    const t = setTimeout(() => setLaunchLog(null), 5000);
    return () => clearTimeout(t);
  }, [launchLog]);

  // Auto-clear scan log after 6 seconds
  useEffect(() => {
    if (!scanLog) return;
    const t = setTimeout(() => setScanLog(null), 6000);
    return () => clearTimeout(t);
  }, [scanLog]);

  // Derived values
  const allTags = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [profiles]);

  const hasAnyMode = useMemo(
    () => profiles.some((p) => p.recommended_mode != null),
    [profiles]
  );

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTag && !p.tags.includes(selectedTag)) return false;
      if (selectedMode && p.recommended_mode !== selectedMode) return false;
      return true;
    });
  }, [profiles, search, selectedTag, selectedMode]);

  // ── Steam scan + AI auto-tuning ─────────────────────────────────────────────

  const handleSteamScan = async () => {
    setScanning(true);
    setScanPhase("scanning");
    setScanLog(null);

    let updatedProfiles: GameProfile[];
    try {
      updatedProfiles = await invoke<GameProfile[]>("discover_and_create_steam_drafts");
      setProfiles(updatedProfiles);
    } catch (e) {
      setScanLog({ msg: String(e), ok: false });
      setScanning(false);
      setScanPhase("idle");
      return;
    }

    const newDrafts = updatedProfiles.filter(
      (p) => p.launcher === "steam" && !p.recommended_mode && p.power_plan === "none"
    );

    if (newDrafts.length === 0) {
      setScanLog({ msg: "新しいゲームは見つかりませんでした（すべて登録済み）", ok: true });
      setScanning(false);
      setScanPhase("idle");
      return;
    }

    // Auto-run AI tuning if API key is set
    const apiKey = await invoke<string>("get_ai_api_key").catch(() => "");
    if (!apiKey) {
      setScanLog({
        msg: `${newDrafts.length} 件追加。設定ページでAPIキーを登録するとAI自動チューニングが使えます。`,
        ok: true,
      });
      setScanning(false);
      setScanPhase("idle");
      return;
    }

    setScanPhase("tuning");
    try {
      const tuned = await invoke<GameProfile[]>("generate_ai_recommendations");
      setProfiles(tuned);
      const filled = tuned.filter((p) => p.recommended_mode).length;
      setScanLog({
        msg: `${newDrafts.length} 件追加 → AI が ${filled} 件を自動チューニングしました`,
        ok: true,
      });
    } catch (e) {
      setScanLog({
        msg: `${newDrafts.length} 件追加（AIチューニング失敗: ${e}）`,
        ok: false,
      });
    } finally {
      setScanning(false);
      setScanPhase("idle");
    }
  };

  // ── Multi-launcher scan (ENABLE_MULTI_LAUNCHER) ──────────────────────────────

  const handleMultiLauncherScan = async () => {
    setScanning(true);
    setScanPhase("scanning");
    setScanLog(null);

    let result: MultiLauncherScanResult;
    try {
      result = await invoke<MultiLauncherScanResult>("discover_and_create_launcher_drafts");
      setProfiles(result.profiles);
    } catch (e) {
      setScanLog({ msg: String(e), ok: false });
      setScanning(false);
      setScanPhase("idle");
      return;
    }

    const { epicFound, gogFound, xboxFound, totalAdded } = result;

    if (totalAdded === 0) {
      const parts = [];
      if (epicFound > 0) parts.push(`Epic: ${epicFound}`);
      if (gogFound > 0) parts.push(`GOG: ${gogFound}`);
      if (xboxFound > 0) parts.push(`Xbox: ${xboxFound}`);
      const detail = parts.length > 0 ? `（${parts.join(" / ")}）` : "";
      setScanLog({ msg: `新しいゲームは見つかりませんでした${detail}`, ok: true });
      setScanning(false);
      setScanPhase("idle");
      return;
    }

    // Auto-run AI tuning if API key is set
    const apiKey = await invoke<string>("get_ai_api_key").catch(() => "");
    if (!apiKey) {
      setScanLog({
        msg: `${totalAdded} 件追加（Epic: ${epicFound} / GOG: ${gogFound} / Xbox: ${xboxFound}）。APIキーを設定するとAI自動チューニングが使えます。`,
        ok: true,
      });
      setScanning(false);
      setScanPhase("idle");
      return;
    }

    setScanPhase("tuning");
    try {
      const tuned = await invoke<GameProfile[]>("generate_ai_recommendations");
      setProfiles(tuned);
      const filled = tuned.filter((p) => p.recommended_mode).length;
      setScanLog({
        msg: `${totalAdded} 件追加（Epic: ${epicFound} / GOG: ${gogFound} / Xbox: ${xboxFound}）→ AI が ${filled} 件をチューニングしました`,
        ok: true,
      });
    } catch (e) {
      setScanLog({
        msg: `${totalAdded} 件追加（AIチューニング失敗: ${e}）`,
        ok: false,
      });
    } finally {
      setScanning(false);
      setScanPhase("idle");
    }
  };

  const handleAiTuning = async () => {
    setScanning(true);
    setScanPhase("tuning");
    setScanLog(null);
    try {
      const tuned = await invoke<GameProfile[]>("generate_ai_recommendations");
      setProfiles(tuned);
      const filled = tuned.filter((p) => p.recommended_mode).length;
      setScanLog({ msg: `${filled} 件をAIチューニングしました`, ok: true });
    } catch (e) {
      setScanLog({ msg: String(e), ok: false });
    } finally {
      setScanning(false);
      setScanPhase("idle");
    }
  };

  // ── Mode change ──────────────────────────────────────────────────────────────

  const handleModeChange = async (
    profile: GameProfile,
    mode: "competitive" | "balanced" | "quality"
  ) => {
    const preset = MODE_PRESETS[mode];
    const updated: GameProfile = { ...profile, recommended_mode: mode, ...preset };
    try {
      await invoke("save_profile", { profile: updated });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      // silently ignore
    }
  };

  // ── Edit profile (ENABLE_PROFILE_SSOT) ───────────────────────────────────────

  /** Navigate to the Profiles page with the given profile pre-selected for editing. */
  const handleEditProfile = useCallback(
    (profileId: string) => {
      setEditingProfileId(profileId);
      setActivePage("profiles");
    },
    [setEditingProfileId, setActivePage]
  );

  // ── Launch ───────────────────────────────────────────────────────────────────

  const handleLaunchOptimize = async (profile: GameProfile) => {
    setLaunchingId(profile.id);
    setLaunchLog(null);

    // [MONITORING] Capture score before optimization (only when flag is ON)
    let scoreBefore: OptimizationScore | null = null;
    if (ENABLE_LAUNCH_MONITORING) {
      try {
        scoreBefore = await invoke<OptimizationScore>("get_optimization_score");
      } catch {
        // non-fatal — monitoring data is optional
      }
    }

    try {
      await invoke("apply_profile", { id: profile.id });
      if (profile.exe_path) {
        await invoke("launch_game", { exePath: profile.exe_path });
      }
      setLaunchLog({
        id: profile.id,
        msg: "最適化を適用しました" + (profile.exe_path ? "。ゲームを起動中…" : ""),
        ok: true,
      });

      // [MONITORING] Start session tracking (only when flag is ON)
      if (ENABLE_LAUNCH_MONITORING) {
        stopSession(); // stop any previous session
        setActiveSession({
          profileId: profile.id,
          gameName: profile.name,
          startedAt: Date.now(),
          scoreBefore,
          liveTemp: null,
          liveFps: null,
        });
      }
    } catch (e) {
      setLaunchLog({ id: profile.id, msg: String(e), ok: false });
    } finally {
      setLaunchingId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasDrafts = profiles.some((p) => !p.recommended_mode);
  const scanLabel =
    scanPhase === "scanning" ? "スキャン中…" : scanPhase === "tuning" ? "AIチューニング中…" : "Steamスキャン";

  return (
    <div className="p-5 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <Library className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">My Games</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{profiles.length} タイトル登録済み</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSteamScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.10] text-sm font-medium hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors text-muted-foreground"
          >
            {scanning && scanPhase === "scanning" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ScanLine size={14} />
            )}
            {scanLabel === "AIチューニング中…" ? "Steamスキャン" : scanLabel}
          </button>

          {/* [MULTI_LAUNCHER] Epic / GOG / Xbox scan button */}
          {ENABLE_MULTI_LAUNCHER && (
            <button
              type="button"
              onClick={handleMultiLauncherScan}
              disabled={scanning}
              aria-label="Epic / GOG / Xbox スキャン"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.10] text-sm font-medium hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors text-muted-foreground"
            >
              {scanning && scanPhase === "scanning" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <GamepadIcon size={14} />
              )}
              Epic / GOG / Xbox
            </button>
          )}

          {/* [PROFILE_SSOT] AI tuning hidden when SSOT is ON — editing goes through Profiles page */}
          {!ENABLE_PROFILE_SSOT && hasDrafts && (
            <button
              type="button"
              onClick={handleAiTuning}
              disabled={scanning}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
            >
              {scanning && scanPhase === "tuning" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AIチューニング
            </button>
          )}
        </div>
      </div>

      {/* [MONITORING] Active session panel (only when flag is ON) */}
      {ENABLE_LAUNCH_MONITORING && activeSession && (
        <GameSessionMonitorPanel session={activeSession} onStop={stopSession} />
      )}

      {/* [HW SUGGESTIONS] Hardware banner (only when flag is ON) */}
      {ENABLE_HARDWARE_SUGGESTIONS && hwMode && (
        <HardwareBanner hwMode={hwMode} />
      )}

      {/* Scan log */}
      {scanLog && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            scanLog.ok
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : "bg-red-500/10 border-red-500/25 text-red-400"
          }`}
        >
          {scanLog.msg}
        </div>
      )}

      {/* Filters */}
      {profiles.length > 0 && (
        <GameFilters
          search={search}
          onSearchChange={setSearch}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          allTags={allTags}
          hasAnyMode={hasAnyMode}
        />
      )}

      {/* Launch log */}
      {launchLog && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            launchLog.ok
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : "bg-red-500/10 border-red-500/25 text-red-400"
          }`}
        >
          {launchLog.msg}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground gap-2">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          <span className="text-sm">読み込み中…</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground">
          <Library size={40} strokeWidth={1} className="text-muted-foreground/40" />
          <p className="text-sm">ゲームがまだ登録されていません</p>
          <button
            type="button"
            onClick={handleSteamScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all active:scale-[0.97]"
          >
            <ScanLine size={15} />
            Steamライブラリをスキャン
          </button>
          <button
            type="button"
            onClick={() => setActivePage("profiles")}
            className="text-sm text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
          >
            手動でプロファイルを追加する →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
          <p className="text-sm">フィルター条件に一致するゲームがありません</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <GameCard
              key={p.id}
              profile={p}
              isActive={activeProfileId === p.id}
              launching={launchingId === p.id}
              onLaunchOptimize={() => handleLaunchOptimize(p)}
              onModeChange={(mode) => handleModeChange(p, mode)}
              hardwareHint={
                ENABLE_HARDWARE_SUGGESTIONS && hwMode
                  ? hwCompatible(p.recommended_mode, hwMode.mode)
                  : undefined
              }
              // [PROFILE_SSOT] when ON, card shows "Edit in Profiles" link
              onEditProfile={ENABLE_PROFILE_SSOT ? () => handleEditProfile(p.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
