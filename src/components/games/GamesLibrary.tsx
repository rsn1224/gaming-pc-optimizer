import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Library, Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { GameProfile } from "@/types";
import { GameCard } from "./GameCard";
import { GameFilters } from "./GameFilters";

export function GamesLibrary() {
  const { activeProfileId, setActivePage, setEditingProfileId } = useAppStore();
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchLog, setLaunchLog] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

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

  // Collect all unique tags across profiles
  const allTags = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [profiles]);

  const hasAnyMode = useMemo(
    () => profiles.some((p) => p.recommended_mode != null),
    [profiles]
  );

  // Filtered profiles
  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTag && !p.tags.includes(selectedTag)) return false;
      if (selectedMode && p.recommended_mode !== selectedMode) return false;
      return true;
    });
  }, [profiles, search, selectedTag, selectedMode]);

  const handleLaunchOptimize = async (profile: GameProfile) => {
    setLaunchingId(profile.id);
    setLaunchLog(null);
    try {
      await invoke("apply_profile", { id: profile.id });
      if (profile.exe_path) {
        await invoke("launch_game", { exePath: profile.exe_path });
      }
      setLaunchLog({ id: profile.id, msg: "最適化を適用しました" + (profile.exe_path ? "。ゲームを起動中…" : ""), ok: true });
    } catch (e) {
      setLaunchLog({ id: profile.id, msg: String(e), ok: false });
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <div className="p-6 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-secondary border border-border rounded-lg">
          <Library className="text-muted-foreground" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">My Games</h1>
          <p className="text-sm text-muted-foreground">
            {profiles.length} タイトル登録済み
          </p>
        </div>
      </div>

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
          className={`rounded-lg border px-4 py-3 text-sm ${
            launchLog.ok
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {launchLog.msg}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">読み込み中…</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <Library size={40} strokeWidth={1} />
          <p className="text-sm">ゲームがまだ登録されていません</p>
          <button
            type="button"
            onClick={() => setActivePage("profiles")}
            className="text-sm text-primary hover:underline"
          >
            プロファイルページでゲームを追加する →
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
              onEdit={() => {
                setEditingProfileId(p.id);
                setActivePage("profiles");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
