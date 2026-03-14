import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText, Download, CheckCircle2 } from "lucide-react";
import { toast } from "@/stores/useToastStore";

const REPORT_ITEMS = [
  "システム情報",
  "最適化スコア",
  "スコア履歴 (直近10件)",
  "ゲームセッション履歴",
  "イベントログ",
  "ベンチマーク結果 (あれば)",
];

function getTodayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function PerformanceReport() {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerated(false);
    try {
      const html = await invoke<string>("generate_performance_report");
      const filename = `gaming-optimizer-report-${getTodayString()}.html`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setGenerated(true);
      toast.success(`レポートをダウンロードしました: ${filename}`);
    } catch (e) {
      toast.error(`レポート生成失敗: ${e}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <FileText size={17} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">
            パフォーマンスレポート
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Description */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-1">
            HTMLレポート生成
          </p>
          <p className="text-xs text-white/50 leading-relaxed">
            現在の最適化状態・スコア履歴・ゲームセッション・イベントログをまとめたHTML レポートを生成します。ブラウザで開いて確認・印刷できます。
          </p>
        </div>

        {/* What's included */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-3">含まれる内容</p>
          <div className="space-y-2">
            {REPORT_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span className="text-xs text-white/70">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-3">レポートを生成</p>
          <p className="text-xs text-white/40 mb-4">
            ファイル名:{" "}
            <code className="text-cyan-400 bg-white/[0.05] px-1 rounded">
              gaming-optimizer-report-{getTodayString()}.html
            </code>
          </p>

          {generated && (
            <div className="flex items-center gap-2 mb-4 text-xs text-emerald-400">
              <CheckCircle2 size={13} />
              レポートが正常にダウンロードされました
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            <Download size={14} className={generating ? "animate-pulse" : ""} />
            {generating ? "生成中..." : "レポートを生成・ダウンロード"}
          </button>
        </div>

        {/* Note */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <p className="text-xs text-white/40 leading-relaxed">
            レポートはローカルに保存されるため、インターネット接続は不要です。ダークテーマのスタンドアロン HTML で、ブラウザで開いてそのまま確認できます。
          </p>
        </div>
      </div>
    </div>
  );
}
