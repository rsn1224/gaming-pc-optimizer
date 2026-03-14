import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bug, Download, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { ErrorEntry } from "@/types";

function relativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

function ErrorRow({ entry }: { entry: ErrorEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-md">
            {entry.command}
          </span>
          <p className="text-sm text-white/90 truncate">{entry.error_message}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground/60">{relativeTime(entry.timestamp)}</span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground/50 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      {expanded && entry.context && (
        <div className="mt-2 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
          <p className="text-[11px] text-muted-foreground/70 font-mono break-all leading-relaxed">
            {entry.context}
          </p>
        </div>
      )}
    </div>
  );
}

export function CrashReport() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    try {
      const entries = await invoke<ErrorEntry[]>("get_error_log");
      setErrors(entries);
    } catch (e) {
      toast.error(`ログ読み込みに失敗しました: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const json = await invoke<string>("export_crash_report");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split("T")[0];
      const a = document.createElement("a");
      a.href = url;
      a.download = `crash-report-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("クラッシュレポートをエクスポートしました");
    } catch (e) {
      toast.error(`エクスポートに失敗しました: ${e}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleClear() {
    if (!confirm("エラーログをすべて削除しますか？")) return;
    setClearing(true);
    try {
      await invoke("clear_error_log");
      setErrors([]);
      toast.success("エラーログをクリアしました");
    } catch (e) {
      toast.error(`クリアに失敗しました: ${e}`);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bug size={18} className="text-cyan-400" />
            クラッシュレポート
          </h1>
          {errors.length > 0 && (
            <span className="text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
              {errors.length} 件
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {errors.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1.5 text-xs text-red-400/80 hover:text-red-400 bg-red-500/05 hover:bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
              {clearing ? "クリア中…" : "ログをクリア"}
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            {exporting ? "エクスポート中…" : "レポートをエクスポート"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground/40 text-sm">
            読み込み中…
          </div>
        ) : errors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <span className="text-2xl">✓</span>
            </div>
            <p className="text-sm text-emerald-400 font-medium">エラーは記録されていません</p>
            <p className="text-xs text-muted-foreground/50">問題が発生した場合、ここに表示されます</p>
          </div>
        ) : (
          <div className="space-y-2">
            {errors.map((entry) => (
              <ErrorRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        <div className={cn("bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3", errors.length === 0 ? "mt-6" : "mt-4")}>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            エラーログには最大 100 件のエントリが保存されます。
            「レポートをエクスポート」でシステム情報とエラーを JSON ファイルとしてダウンロードできます。
          </p>
        </div>
      </div>
    </div>
  );
}
