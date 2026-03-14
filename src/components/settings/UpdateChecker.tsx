import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { RefreshCw, CheckCircle2, ArrowUpCircle, Download } from "lucide-react";
import { toast } from "@/stores/useToastStore";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up_to_date" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; percent: number }
  | { kind: "installing" };

export function UpdateChecker() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const checkUpdates = async () => {
    setStatus({ kind: "checking" });
    try {
      const update = await check();
      if (update) {
        setStatus({ kind: "available", update });
        toast.info(`新バージョン ${update.version} が利用可能です`);
      } else {
        setStatus({ kind: "up_to_date" });
        toast.success("最新版をご利用中です");
      }
    } catch (e) {
      setStatus({ kind: "idle" });
      console.error("[UpdateChecker] check() failed:", e);
      toast.error(`アップデート確認に失敗しました: ${e}`);
    }
  };

  const handleInstall = async () => {
    if (status.kind !== "available") return;
    const update = status.update;

    try {
      setStatus({ kind: "downloading", percent: 0 });

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          const percent = totalBytes > 0
            ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
            : 0;
          setStatus({ kind: "downloading", percent });
        } else if (event.event === "Finished") {
          setStatus({ kind: "installing" });
        }
      });

      toast.success("インストール完了 — 再起動します");
      await relaunch();
    } catch (e) {
      setStatus({ kind: "available", update });
      toast.error(`インストール失敗: ${e}`);
    }
  };

  useEffect(() => {
    checkUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isChecking = status.kind === "checking";
  const isBusy =
    status.kind === "downloading" || status.kind === "installing";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <RefreshCw size={17} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">アップデート確認</h1>
        </div>
        <button
          type="button"
          onClick={checkUpdates}
          disabled={isChecking || isBusy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />
          {isChecking ? "確認中..." : "再確認"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Checking */}
        {isChecking && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-3">
            <RefreshCw size={16} className="text-cyan-400 animate-spin" />
            <p className="text-sm text-white/60">アップデートを確認中...</p>
          </div>
        )}

        {/* Up to date */}
        {status.kind === "up_to_date" && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <p className="text-sm font-medium text-white">最新版をご利用中です</p>
          </div>
        )}

        {/* Update available */}
        {status.kind === "available" && (
          <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpCircle size={16} className="text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-400">
                新バージョン利用可能!
              </p>
              <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                v{status.update.version}
              </span>
            </div>
            {status.update.body && (
              <div className="mb-4">
                <p className="text-xs text-white/40 mb-1">リリースノート</p>
                <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed bg-white/[0.03] rounded-xl p-3 max-h-40 overflow-y-auto">
                  {status.update.body}
                </pre>
              </div>
            )}
            <button
              type="button"
              onClick={handleInstall}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            >
              <Download size={14} />
              ダウンロード &amp; インストール
            </button>
          </div>
        )}

        {/* Downloading */}
        {status.kind === "downloading" && (
          <div className="bg-cyan-500/[0.05] border border-cyan-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Download size={16} className="text-cyan-400" />
              <p className="text-sm font-semibold text-cyan-400">ダウンロード中...</p>
              <span className="ml-auto text-xs text-cyan-400">{status.percent}%</span>
            </div>
            <div className="w-full bg-white/[0.06] rounded-full h-2">
              <div
                className="bg-cyan-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${status.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Installing */}
        {status.kind === "installing" && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-3">
            <RefreshCw size={16} className="text-cyan-400 animate-spin" />
            <p className="text-sm text-white/60">インストール中 — まもなく再起動します...</p>
          </div>
        )}
      </div>
    </div>
  );
}
