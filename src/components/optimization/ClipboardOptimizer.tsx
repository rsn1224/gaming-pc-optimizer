import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Clipboard,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  FileX,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { ClipboardStatus, ClipboardCleanResult } from "@/types";

// ── Content type badge ────────────────────────────────────────────────────────

function ContentTypeBadge({ type: ct }: { type: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    text:    { label: "テキスト",   cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
    image:   { label: "画像",       cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
    files:   { label: "ファイル",   cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    empty:   { label: "空",         cls: "bg-white/[0.05] text-muted-foreground border-white/[0.12]" },
    unknown: { label: "不明",       cls: "bg-white/[0.05] text-muted-foreground border-white/[0.12]" },
  };
  const { label, cls } = config[ct] ?? config.unknown;
  return (
    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClipboardOptimizer() {
  const [status, setStatus] = useState<ClipboardStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [clearingClip, setClearingClip] = useState(false);
  const [cleaningTemps, setCleaningTemps] = useState(false);
  const [lastCleanResult, setLastCleanResult] = useState<ClipboardCleanResult | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const s = await invoke<ClipboardStatus>("get_clipboard_status");
      setStatus(s);
    } catch (e) {
      toast.error(`ステータス取得失敗: ${String(e)}`);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleClearClipboard() {
    setClearingClip(true);
    try {
      await invoke("clear_clipboard");
      toast.success("クリップボードをクリアしました");
      await fetchStatus();
    } catch (e) {
      toast.error(`クリア失敗: ${String(e)}`);
    } finally {
      setClearingClip(false);
    }
  }

  async function handleCleanTemps() {
    setCleaningTemps(true);
    setLastCleanResult(null);
    try {
      const result = await invoke<ClipboardCleanResult>("clean_clipboard_temps");
      setLastCleanResult(result);
      toast.success(`一時ファイルをクリーンしました — ${result.files_removed}件 / ${result.temp_freed_mb.toFixed(1)}MB 解放`);
      await fetchStatus();
    } catch (e) {
      toast.error(`クリーン失敗: ${String(e)}`);
    } finally {
      setCleaningTemps(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Clipboard size={14} className="text-cyan-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">クリップボード最適化</h1>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loadingStatus}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.05] border border-white/[0.06] disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(loadingStatus && "animate-spin")} />
          更新
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* Status card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clipboard size={15} className="text-cyan-400" />
            <span className="text-[13px] font-semibold text-white">現在のクリップボード状態</span>
          </div>

          {loadingStatus && !status ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
              <Loader2 size={14} className="animate-spin" />
              取得中...
            </div>
          ) : status ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">コンテンツ種別</span>
                <ContentTypeBadge type={status.content_type} />
              </div>
              {status.has_content && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground">推定サイズ</span>
                  <span className="text-[12px] text-white font-medium">
                    {status.size_estimate_kb > 0 ? `${status.size_estimate_kb} KB` : "—"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">関連一時ファイル</span>
                <span className="text-[12px] text-amber-300 font-medium">
                  {status.temp_file_count}件 ({status.temp_files_mb.toFixed(1)} MB)
                </span>
              </div>

              {/* Status dot */}
              <div className="pt-1 flex items-center gap-2">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    status.has_content
                      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                      : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                  )}
                />
                <span className="text-[12px] text-muted-foreground">
                  {status.has_content ? "クリップボードにデータがあります" : "クリップボードは空です"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-[13px]">データを取得できませんでした</div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Clear clipboard */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Trash2 size={14} className="text-rose-400" />
              <span className="text-[13px] font-semibold text-white">クリップボードをクリア</span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              現在クリップボードに保持されているデータをすべて消去します。
            </p>
            <button
              type="button"
              onClick={handleClearClipboard}
              disabled={clearingClip}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[13px] font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearingClip ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              クリア実行
            </button>
          </div>

          {/* Clean temp files */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileX size={14} className="text-emerald-400" />
              <span className="text-[13px] font-semibold text-white">一時ファイルをクリーン</span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              %TEMP% 内のクリップボード関連一時ファイル（.tmp / Clipboard* / Office temp）を削除します。
            </p>
            <button
              type="button"
              onClick={handleCleanTemps}
              disabled={cleaningTemps}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[13px] font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cleaningTemps ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <FileX size={13} />
              )}
              クリーン実行
            </button>
          </div>
        </div>

        {/* Clean result */}
        {lastCleanResult && (
          <div className="bg-white/[0.03] border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <span className="text-[13px] font-semibold text-white">クリーン完了</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">削除ファイル数</span>
                <span className="text-[12px] text-white font-medium">{lastCleanResult.files_removed} 件</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">解放容量</span>
                <span className="text-[12px] text-emerald-300 font-medium">
                  {lastCleanResult.temp_freed_mb.toFixed(2)} MB
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">クリップボード</span>
                <span className={cn(
                  "text-[12px] font-medium",
                  lastCleanResult.clipboard_cleared ? "text-emerald-300" : "text-muted-foreground"
                )}>
                  {lastCleanResult.clipboard_cleared ? "クリア済み" : "変更なし"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Info section */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-cyan-400 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-white">クリーン対象について</span>
              <ul className="text-[12px] text-muted-foreground space-y-1 leading-relaxed">
                <li>• <code className="text-cyan-300/80">%TEMP%\*.tmp</code> — 1時間以上前の一時ファイル</li>
                <li>• <code className="text-cyan-300/80">%TEMP%\Clipboard*</code> — クリップボード直接キャッシュ</li>
                <li>• <code className="text-cyan-300/80">%TEMP%\~*.tmp</code> — Office 系一時ファイル</li>
                <li>• <code className="text-cyan-300/80">%TEMP%\*.xlsb / *.docx</code> — Excel / Word 一時ファイル (1時間以上前)</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
