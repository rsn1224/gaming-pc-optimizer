import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Library, Loader2, Sparkles, ScanLine } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { GameProfile } from "@/types";
import { GameCard } from "./GameCard";
import { GameFilters } from "./GameFilters";

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
  const { activeProfileId, setActivePage } = useAppStore();
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchLog, setLaunchLog] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  // Scan / AI state
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "tuning">("idle");
  const [scanLog, setScanLog] = useState<{ msg: string; ok: boolean } | null>(null);

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

  // ── Launch ───────────────────────────────────────────────────────────────────

  const handleLaunchOptimize = async (profile: GameProfile) => {
    setLaunchingId(profile.id);
    setLaunchLog(null);
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

          {hasDrafts && (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
