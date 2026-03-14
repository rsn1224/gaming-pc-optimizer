import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Cpu, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { MemoryCleanResult } from "@/types";

interface MemoryInfo {
  used_mb: number;
  total_mb: number;
  percent: number;
  top_consumers: Array<{ name: string; memory_mb: number }>;
}

// ── RAM usage ring ────────────────────────────────────────────────────────────

function RamRing({ percent }: { percent: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(percent, 100) / 100) * circ;
  const colorClass =
    percent >= 85 ? "text-red-400" : percent >= 65 ? "text-amber-400" : "text-cyan-400";

  return (
    <div className="relative flex items-center justify-center w-36 h-36 shrink-0">
      <svg width="144" height="144" className="-rotate-90">
        <circle cx="72" cy="72" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-white/[0.05]" />
        <circle cx="72" cy="72" r={r} fill="none" stroke="currentColor" strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={cn(colorClass, "opacity-20 blur-[3px]")} />
        <circle cx="72" cy="72" r={r} fill="none" stroke="currentColor" strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={cn(colorClass, "[transition:stroke-dasharray_0.8s_ease]")} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-3xl font-bold leading-none tabular-nums", colorClass)}>
          {percent.toFixed(1)}%
        </span>
        <span className="text-[10px] text-muted-foreground/50 mt-1 tracking-widest uppercase">RAM</span>
      </div>
    </div>
  );
}

// ── Consumer bar ──────────────────────────────────────────────────────────────

function ConsumerBar({ name, memory_mb, max_mb }: { name: string; memory_mb: number; max_mb: number }) {
  const pct = max_mb > 0 ? (memory_mb / max_mb) * 100 : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div className="p-1 bg-white/[0.04] border border-white/[0.06] rounded shrink-0">
        <Cpu size={10} className="text-muted-foreground/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[11px] text-slate-300 truncate">{name}</span>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0 ml-2">
            {memory_mb >= 1024 ? `${(memory_mb / 1024).toFixed(1)} GB` : `${memory_mb.toFixed(0)} MB`}
          </span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500/60 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function MemoryCleaner() {
  const [info, setInfo] = useState<MemoryInfo | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<MemoryCleanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshInfo = useCallback(() => {
    invoke<MemoryInfo>("get_memory_info")
      .then(setInfo)
      .catch((e) => console.error("get_memory_info:", e));
  }, []);

  useEffect(() => {
    refreshInfo();
    const id = setInterval(refreshInfo, 5000);
    return () => clearInterval(id);
  }, [refreshInfo]);

  const handleClean = async () => {
    if (cleaning) return;
    setCleaning(true);
    setResult(null);
    setError(null);
    try {
      const r = await invoke<MemoryCleanResult>("clean_memory");
      setResult(r);
      toast.success(`${r.freed_mb.toFixed(1)} MB のメモリを解放しました`);
      refreshInfo();
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error("メモリクリーンに失敗しました: " + msg);
    } finally {
      setCleaning(false);
    }
  };

  const maxConsumer = info?.top_consumers[0]?.memory_mb ?? 1;

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">メモリクリーナー</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">ワーキングセットを解放してRAM使用量を削減</p>
      </div>

      {/* Main card */}
      <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="p-5 flex items-center gap-6">
          {info ? (
            <RamRing percent={info.percent} />
          ) : (
            <div className="w-36 h-36 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-cyan-400" />
            </div>
          )}

          <div className="flex-1 flex flex-col gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">RAM 使用量</p>
              {info ? (
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  使用中: {info.used_mb >= 1024 ? `${(info.used_mb / 1024).toFixed(1)} GB` : `${info.used_mb.toFixed(0)} MB`}
                  {" / "}
                  {info.total_mb >= 1024 ? `${(info.total_mb / 1024).toFixed(1)} GB` : `${info.total_mb.toFixed(0)} MB`}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">取得中...</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleClean}
              disabled={cleaning}
              className={cn(
                "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-sm mt-1",
                cleaning
                  ? "bg-cyan-500/10 text-cyan-400/50 cursor-not-allowed border border-cyan-500/15"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97] glow-cyan"
              )}
            >
              {cleaning ? (
                <><Loader2 size={15} className="animate-spin" /> クリーン中...</>
              ) : (
                "メモリをクリーン"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Result card */}
      {result && (
        <div className="bg-emerald-500/8 border border-emerald-500/25 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <p className="text-sm font-semibold text-emerald-400">クリーン完了</p>
            <span className="ml-auto text-[10px] text-muted-foreground/50 bg-white/[0.04] px-2 py-0.5 rounded">
              {result.method}
            </span>
          </div>
          <div className="flex items-center gap-3 pl-5">
            <div className="text-center">
              <p className="text-lg font-bold text-white tabular-nums">
                {result.before_percent.toFixed(1)}%
              </p>
              <p className="text-[10px] text-muted-foreground/50">クリーン前</p>
            </div>
            <ArrowRight size={14} className="text-muted-foreground/55" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400 tabular-nums">
                {result.after_percent.toFixed(1)}%
              </p>
              <p className="text-[10px] text-muted-foreground/50">クリーン後</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xl font-bold text-cyan-400 tabular-nums">
                {result.freed_mb >= 1024
                  ? `${(result.freed_mb / 1024).toFixed(2)} GB`
                  : `${result.freed_mb.toFixed(1)} MB`}
              </p>
              <p className="text-[10px] text-muted-foreground/50">解放量</p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-300/70 leading-relaxed">
          プロセスのパフォーマンスに一時的な影響が出る場合があります。
          ゲームプレイ中の使用は推奨しません。
        </p>
      </div>

      {/* Top consumers */}
      {info && info.top_consumers.length > 0 && (
        <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
          <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-3">
              メモリ使用量 TOP 5
            </p>
            <div className="flex flex-col gap-3">
              {info.top_consumers.map((c) => (
                <ConsumerBar
                  key={c.name}
                  name={c.name}
                  memory_mb={c.memory_mb}
                  max_mb={maxConsumer}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
