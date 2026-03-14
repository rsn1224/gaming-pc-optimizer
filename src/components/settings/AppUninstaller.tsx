import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";
import type { InstalledApp } from "@/types";
import { Trash2, Search, RefreshCw, AlertTriangle, HardDrive } from "lucide-react";

type SortMode = "size" | "name" | "date";
type FilterMode = "all" | "non_microsoft" | "large";

export function AppUninstaller() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [confirmApp, setConfirmApp] = useState<InstalledApp | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("size");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const loadApps = async () => {
    setLoading(true);
    try {
      const result = await invoke<InstalledApp[]>("get_installed_apps");
      setApps(result);
    } catch (e) {
      toast.error(`読み込み失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleUninstall = async (app: InstalledApp) => {
    setUninstalling(app.registry_key);
    setConfirmApp(null);
    try {
      await invoke("uninstall_app", { uninstallString: app.uninstall_string });
      toast.success(`起動完了: ${app.display_name} のアンインストーラーを起動しました`);
    } catch (e) {
      toast.error(`起動失敗: ${String(e)}`);
    } finally {
      setUninstalling(null);
    }
  };

  const filtered = apps
    .filter((app) => {
      const searchOk =
        app.display_name.toLowerCase().includes(search.toLowerCase()) ||
        app.publisher.toLowerCase().includes(search.toLowerCase());
      const filterOk =
        filterMode === "all" ||
        (filterMode === "non_microsoft" && !app.is_system) ||
        (filterMode === "large" && app.size_mb >= 500);
      return searchOk && filterOk;
    })
    .sort((a, b) => {
      if (sortMode === "size") return b.size_mb - a.size_mb;
      if (sortMode === "name") return a.display_name.localeCompare(b.display_name);
      if (sortMode === "date") return b.install_date.localeCompare(a.install_date);
      return 0;
    });

  const totalSizeGb = apps.reduce((sum, a) => sum + a.size_mb, 0) / 1024;
  const maxSize = Math.max(...apps.map((a) => a.size_mb), 1);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Trash2 size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">アプリのアンインストール管理</h1>
        </div>
        <button
          type="button"
          onClick={loadApps}
          disabled={loading}
          title="再読み込み"
          className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-all"
        >
          <RefreshCw size={15} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* Stats bar */}
      {!loading && apps.length > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <HardDrive size={15} className="text-muted-foreground shrink-0" />
          <span className="text-sm text-white font-medium">{apps.length} 個のアプリ</span>
          <span className="text-muted-foreground text-xs">合計</span>
          <span className="text-cyan-400 font-semibold">{totalSizeGb.toFixed(1)} GB</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-6 pt-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="アプリ名・発行元で検索..."
            className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
        </div>

        <div className="flex items-center gap-4">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">並び替え:</span>
            {(["size", "name", "date"] as SortMode[]).map((m) => {
              const labels: Record<SortMode, string> = { size: "サイズ順", name: "名前順", date: "インストール日順" };
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSortMode(m)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-all",
                    sortMode === m
                      ? "bg-white/[0.08] text-white border border-white/[0.12]"
                      : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                  )}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">フィルター:</span>
            {(["all", "non_microsoft", "large"] as FilterMode[]).map((f) => {
              const labels: Record<FilterMode, string> = {
                all: "すべて",
                non_microsoft: "Microsoft以外",
                large: "大きいアプリ(>500MB)",
              };
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilterMode(f)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-all",
                    filterMode === f
                      ? "bg-white/[0.08] text-white border border-white/[0.12]"
                      : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                  )}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* App list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            インストール済みアプリを読み込み中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            該当するアプリがありません
          </div>
        ) : (
          filtered.map((app) => {
            // Map size to 0–5 filled segments (5 = largest app)
            const sizeSegments = maxSize > 0 ? Math.round((app.size_mb / maxSize) * 5) : 0;
            const isUninstalling = uninstalling === app.registry_key;

            return (
              <div
                key={app.registry_key}
                className={cn(
                  "bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4",
                  app.is_system && "opacity-60"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">
                        {app.display_name}
                      </span>
                      {app.is_system && (
                        <span className="text-[10px] bg-white/[0.06] text-muted-foreground border border-white/[0.08] px-1.5 py-0.5 rounded">
                          システム
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {app.publisher && (
                        <span className="text-[11px] text-muted-foreground">{app.publisher}</span>
                      )}
                      {app.display_version && (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          v{app.display_version}
                        </span>
                      )}
                      {app.install_date && (
                        <span className="text-[11px] text-muted-foreground">
                          {app.install_date}
                        </span>
                      )}
                    </div>

                    {/* Size bar — 5 dot segments, no inline styles */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((seg) => (
                          <div
                            key={seg}
                            className={cn(
                              "w-5 h-1 rounded-full",
                              seg <= sizeSegments
                                ? "bg-cyan-500/70"
                                : "bg-white/[0.06]"
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono w-16 text-right shrink-0">
                        {app.size_mb >= 1024
                          ? `${(app.size_mb / 1024).toFixed(1)} GB`
                          : app.size_mb > 0
                          ? `${app.size_mb.toFixed(0)} MB`
                          : "不明"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (app.is_system) {
                        toast.info("注意: システムコンポーネントのアンインストールはサポートされていません");
                        return;
                      }
                      setConfirmApp(app);
                    }}
                    disabled={isUninstalling || app.is_system}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                      app.is_system
                        ? "bg-white/[0.03] border border-white/[0.06] text-muted-foreground/40 cursor-not-allowed"
                        : "bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-400 hover:text-red-300"
                    )}
                  >
                    <Trash2 size={12} />
                    {isUninstalling ? "起動中..." : "アンインストール"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111318] border border-white/[0.10] rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={18} className="text-amber-400 shrink-0" />
              <h2 className="text-base font-semibold text-white">確認</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              以下のアプリをアンインストールしますか？
            </p>
            <p className="text-sm font-medium text-white mb-6">{confirmApp.display_name}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmApp(null)}
                className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-sm text-muted-foreground hover:text-white transition-all"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => handleUninstall(confirmApp)}
                className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-300 text-sm font-medium transition-all"
              >
                アンインストール
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
