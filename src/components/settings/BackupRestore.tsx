import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DatabaseBackup, Upload, Download, Loader2 } from "lucide-react";
import { toast } from "@/stores/useToastStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export card ───────────────────────────────────────────────────────────────

function ExportCard() {
  const [exporting, setExporting] = useState(false);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await invoke<string>("export_backup");
      const filename = `gaming-optimizer-backup-${todayString()}.json`;
      triggerDownload(json, filename);
      const now = new Date().toLocaleString("ja-JP");
      setLastExportedAt(now);
      toast.success(`バックアップを保存しました: ${filename}`);
    } catch (e) {
      toast.error(`エクスポート失敗: ${e}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          <Download size={15} className="text-cyan-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">バックアップ (エクスポート)</h2>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            プロファイル設定を JSON ファイルに書き出します
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 leading-relaxed">
        ゲームプロファイルをバックアップして、別のPCへの移行や設定の復元に使えます。
      </p>

      {lastExportedAt && (
        <p className="text-[11px] text-muted-foreground/55">
          最終エクスポート: {lastExportedAt}
        </p>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {exporting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        バックアップを保存
      </button>
    </div>
  );
}

// ── Import card ───────────────────────────────────────────────────────────────

function ImportCard() {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
        reader.readAsText(file);
      });

      const message = await invoke<string>("import_backup", { json: content });
      toast.success(message);
    } catch (e) {
      toast.error(`インポート失敗: ${e}`);
    } finally {
      setImporting(false);
      // Reset file input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
          <Upload size={15} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">復元 (インポート)</h2>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            バックアップ JSON からプロファイルを復元します
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 leading-relaxed">
        以前エクスポートした JSON ファイルを選択してください。
        <span className="text-amber-400/80"> 現在のプロファイルはすべて上書きされます。</span>
      </p>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="backup-file-input"
          className={`flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed rounded-xl text-sm font-medium cursor-pointer transition-colors ${
            importing
              ? "border-white/[0.06] text-muted-foreground/55 cursor-not-allowed"
              : "border-white/[0.15] text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/[0.05]"
          }`}
        >
          {importing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              インポート中...
            </>
          ) : (
            <>
              <Upload size={14} />
              バックアップファイルを選択
            </>
          )}
        </label>
        <input
          id="backup-file-input"
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFile}
          disabled={importing}
          className="sr-only"
        />
        <p className="text-[10px] text-muted-foreground/30 text-center">
          .json ファイルのみ対応
        </p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function BackupRestore() {
  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
          <DatabaseBackup className="text-cyan-400" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">設定バックアップ</h1>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            プロファイル設定のエクスポート・インポート
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ExportCard />
        <ImportCard />
      </div>

      {/* Info note */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3">
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          バックアップには <span className="text-slate-400">ゲームプロファイル</span>（電源プラン・Windows設定・DNS設定など）が含まれます。
          スコア履歴・イベントログはバックアップ対象外です。
        </p>
      </div>
    </div>
  );
}
