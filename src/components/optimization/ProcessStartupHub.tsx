/**
 * ProcessStartupHub — プロセス管理 + スタートアップ統合ページ
 * 統合効果: 起動中プロセス数 × スタートアップ登録数をクロス表示
 *           スタートアップ有効件数に応じた最適化提案
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { ProcessManager } from "./ProcessManager";
import { StartupManager } from "./StartupManager";
import type { ProcessInfo, StartupEntry } from "@/types";
import { Activity, Rocket, AlertTriangle, RefreshCw, Cpu } from "lucide-react";

const TABS = [
  { id: "process", label: "プロセス管理" },
  { id: "startup", label: "スタートアップ" },
];

interface CrossInsight {
  processCount: number;
  totalMemoryMb: number;
  startupEnabled: number;
  startupTotal: number;
  heavyStartups: StartupEntry[]; // enabled startups (top by name length as proxy)
}

export function ProcessStartupHub() {
  const [tab, setTab] = useState("process");
  const [insight, setInsight] = useState<CrossInsight | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [procs, startups] = await Promise.all([
        invoke<ProcessInfo[]>("get_running_processes").catch(() => [] as ProcessInfo[]),
        invoke<StartupEntry[]>("get_startup_entries").catch(() => [] as StartupEntry[]),
      ]);
      const enabled = (startups as StartupEntry[]).filter((s) => s.enabled);
      setInsight({
        processCount: (procs as ProcessInfo[]).length,
        totalMemoryMb: (procs as ProcessInfo[]).reduce((acc, p) => acc + p.memory_mb, 0),
        startupEnabled: enabled.length,
        startupTotal: (startups as StartupEntry[]).length,
        heavyStartups: enabled.slice(0, 3),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const suggestionLevel = insight
    ? insight.startupEnabled > 15 ? "high" : insight.startupEnabled > 8 ? "mid" : "ok"
    : "ok";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Cpu size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">プロセス＆スタートアップ</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">実行中プロセス · 起動管理</p>
        </div>
      </div>
      {/* ── Insight Panel ── */}
      <div className="shrink-0 mx-4 mb-1 bg-[#141414] border border-white/[0.10] rounded-xl px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2">
            <RefreshCw size={12} className="text-muted-foreground/40 animate-spin" />
            <span className="text-xs text-muted-foreground/40">読み込み中...</span>
          </div>
        ) : insight ? (
          <div className="flex items-center gap-4 flex-wrap">
            {/* Process count */}
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-cyan-400" />
              <div>
                <p className="text-[10px] text-muted-foreground/50">実行中</p>
                <p className="text-sm font-bold text-white tabular-nums">{insight.processCount} <span className="text-[10px] font-normal text-muted-foreground/50">プロセス</span></p>
              </div>
            </div>

            <div className="w-px h-8 bg-white/[0.06]" />

            {/* Memory */}
            <div>
              <p className="text-[10px] text-muted-foreground/50">合計メモリ</p>
              <p className="text-sm font-bold text-white tabular-nums">
                {insight.totalMemoryMb >= 1024
                  ? `${(insight.totalMemoryMb / 1024).toFixed(1)} GB`
                  : `${Math.round(insight.totalMemoryMb)} MB`}
              </p>
            </div>

            <div className="w-px h-8 bg-white/[0.06]" />

            {/* Startup count + suggestion */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Rocket size={14} className={
                suggestionLevel === "high" ? "text-red-400" :
                suggestionLevel === "mid" ? "text-amber-400" : "text-emerald-400"
              } />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground/50">スタートアップ有効</p>
                <p className="text-xs font-semibold text-white">
                  {insight.startupEnabled} / {insight.startupTotal} 件
                  {suggestionLevel === "high" && (
                    <span className="ml-1.5 text-[10px] text-red-400">起動が遅い可能性</span>
                  )}
                  {suggestionLevel === "mid" && (
                    <span className="ml-1.5 text-[10px] text-amber-400">一部見直しを推奨</span>
                  )}
                </p>
              </div>
              {suggestionLevel !== "ok" && (
                <button
                  type="button"
                  onClick={() => setTab("startup")}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  <AlertTriangle size={10} /> 確認
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "process" && <ProcessManager />}
        {tab === "startup" && <StartupManager />}
      </div>
    </div>
  );
}
