/**
 * StorageAppsHub — ストレージ + アプリ管理 統合ページ
 * 統合効果: 大容量未使用アプリをストレージ観点でハイライト
 *           「Top 3 アンインストール推奨」をワンアクションで実行
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { StorageManager } from "@/components/optimization/StorageManager";
import { AppUninstaller } from "@/components/settings/AppUninstaller";
import type { InstalledApp } from "@/types";
import { HardDrive, Trash2, Loader2, Database } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "storage", label: "ストレージ" },
  { id: "apps", label: "アプリ管理" },
];

/** 100MB以上かつシステムアプリでないものをサジェスト */
function isCandidate(app: InstalledApp) {
  return app.size_mb >= 100 && !app.is_system && app.uninstall_string.length > 0;
}

export function StorageAppsHub() {
  const [tab, setTab] = useState("storage");
  const [candidates, setCandidates] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const apps = await invoke<InstalledApp[]>("get_installed_apps").catch(() => [] as InstalledApp[]);
    const sorted = (apps as InstalledApp[])
      .filter(isCandidate)
      .sort((a, b) => b.size_mb - a.size_mb)
      .slice(0, 3);
    setCandidates(sorted);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUninstall = async (app: InstalledApp) => {
    setUninstalling(app.display_name);
    try {
      await invoke("uninstall_app", { uninstallString: app.uninstall_string });
      toast.success(`${app.display_name} のアンインストーラーを起動しました`);
      setCandidates((prev) => prev.filter((a) => a.display_name !== app.display_name));
    } catch (e) {
      toast.error(`アンインストール失敗: ${e}`);
    } finally {
      setUninstalling(null);
    }
  };

  const totalFreeable = candidates.reduce((acc, a) => acc + a.size_mb, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Database size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">ストレージ＆アプリ</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">ディスク · アンインストール推奨</p>
        </div>
      </div>
      {/* ── Insight Panel: Top 3 large apps ── */}
      {!dismissed && !loading && candidates.length > 0 && (
        <div className="shrink-0 mx-4 mb-1 bg-[#141414] border border-orange-500/20 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <HardDrive size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">
                アンインストール候補 — 約 {totalFreeable >= 1024 ? `${(totalFreeable / 1024).toFixed(1)} GB` : `${Math.round(totalFreeable)} MB`} 解放可能
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab("apps")}
                className="text-[10px] text-muted-foreground/50 hover:text-white transition-colors"
              >
                全件表示
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {candidates.map((app) => (
              <div
                key={app.display_name}
                className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{app.display_name}</p>
                  <p className="text-[10px] text-muted-foreground/50">{app.publisher} · {app.size_mb >= 1024 ? `${(app.size_mb / 1024).toFixed(1)} GB` : `${Math.round(app.size_mb)} MB`}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUninstall(app)}
                  disabled={uninstalling === app.display_name}
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                    "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  )}
                >
                  {uninstalling === app.display_name
                    ? <Loader2 size={10} className="animate-spin" />
                    : <Trash2 size={10} />}
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="shrink-0 mx-4 mb-1 flex items-center gap-2 px-4 py-2">
          <Loader2 size={12} className="text-muted-foreground/40 animate-spin" />
          <span className="text-xs text-muted-foreground/40">アプリ情報を読み込み中...</span>
        </div>
      )}

      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "storage" && <StorageManager />}
        {tab === "apps" && <AppUninstaller />}
      </div>
    </div>
  );
}
