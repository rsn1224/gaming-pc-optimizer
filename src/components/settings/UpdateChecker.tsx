import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, CheckCircle2, ArrowUpCircle, ExternalLink } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import type { UpdateInfo } from "@/types";

function formatTimestamp(secs: number): string {
  if (secs === 0) return "未確認";
  const d = new Date(secs * 1000);
  return d.toLocaleString("ja-JP");
}

export function UpdateChecker() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const result = await invoke<UpdateInfo>("check_for_updates");
      setInfo(result);
      if (result.has_update) {
        toast.info(`新バージョン ${result.latest_version} が利用可能です`);
      } else {
        toast.success("最新版をご利用中です");
      }
    } catch (e) {
      toast.error(`アップデート確認失敗: ${e}`);
    } finally {
      setChecking(false);
    }
  };

  // Auto-check on mount
  useEffect(() => {
    checkUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async () => {
    if (!info?.release_url) return;
    try {
      await invoke("open_release_url", { url: info.release_url });
    } catch (e) {
      toast.error(`ブラウザ起動失敗: ${e}`);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <RefreshCw size={17} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">アップデート確認</h1>
        </div>
        <button
          type="button"
          onClick={checkUpdates}
          disabled={checking}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
          {checking ? "確認中..." : "再確認"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Current version */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">
            現在のバージョン
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-emerald-500/15 border border-cyan-500/40 flex items-center justify-center">
              <span className="text-cyan-400 text-sm font-bold">G</span>
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                v{info?.current_version ?? "1.0.0"}
              </p>
              <p className="text-xs text-white/40">Gaming PC Optimizer</p>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {checking && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-3">
            <RefreshCw size={16} className="text-cyan-400 animate-spin" />
            <p className="text-sm text-white/60">アップデートを確認中...</p>
          </div>
        )}

        {/* Result */}
        {!checking && info && (
          <>
            {info.has_update ? (
              <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpCircle size={16} className="text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-400">
                    新バージョン利用可能!
                  </p>
                  <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                    {info.latest_version}
                  </span>
                </div>
                {info.release_notes && (
                  <div className="mb-3">
                    <p className="text-xs text-white/40 mb-1">リリースノート</p>
                    <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed bg-white/[0.03] rounded-xl p-3 max-h-40 overflow-y-auto">
                      {info.release_notes}
                    </pre>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <ExternalLink size={14} />
                  ダウンロード
                </button>
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">最新版をご利用中です</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    バージョン {info.latest_version}
                  </p>
                </div>
              </div>
            )}

            {/* Last checked */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-xs text-white/40">
                最終確認: {formatTimestamp(info.checked_at)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
