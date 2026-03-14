import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldAlert, RefreshCw, Loader2 } from "lucide-react";

interface AdminErrorBannerProps {
  /** 表示するエラーメッセージ */
  message: string;
}

/**
 * 管理者権限が必要な操作が失敗したときに表示するバナー。
 * 「管理者として再起動」ボタンで relaunch_as_admin コマンドを呼び出す。
 */
export function AdminErrorBanner({ message }: AdminErrorBannerProps) {
  const [relaunching, setRelaunching] = useState(false);
  const [relaunchError, setRelaunchError] = useState("");

  const handleRelaunch = async () => {
    setRelaunching(true);
    setRelaunchError("");
    try {
      await invoke("relaunch_as_admin");
    } catch (e) {
      setRelaunchError(String(e));
      setRelaunching(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-3 bg-rose-500/10 border border-rose-500/25 rounded-xl">
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={15} className="text-rose-400 shrink-0 mt-px" />
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs font-semibold text-rose-300">管理者権限が必要です</p>
          <p className="text-[11px] text-rose-400/80 break-all">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleRelaunch}
        disabled={relaunching}
        className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-lg hover:bg-rose-500/25 transition-colors disabled:opacity-50"
      >
        {relaunching ? (
          <><Loader2 size={12} className="animate-spin" /> 再起動中…</>
        ) : (
          <><RefreshCw size={12} /> 管理者として再起動</>
        )}
      </button>
      {relaunchError && (
        <p className="text-[10px] text-rose-400/70 break-all">{relaunchError}</p>
      )}
    </div>
  );
}
