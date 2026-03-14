import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, RefreshCw, Loader2, Cpu, MemoryStick, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { findAnnotation } from "@/data/process_knowledge";
import type { ProcessInfo, AnnotatedProcess } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

// ── Bar ───────────────────────────────────────────────────────────────────────

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── CPU Top-10 ────────────────────────────────────────────────────────────────

function CpuTopList({ procs }: { procs: ProcessInfo[] }) {
  const top = [...procs].sort((a, b) => b.cpu_percent - a.cpu_percent).slice(0, 10);
  const maxCpu = top[0]?.cpu_percent ?? 1;

  if (top.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/50 py-4 text-center">データがありません</p>
    );
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {top.map((proc, i) => (
        <div key={`${proc.pid}-${i}`} className="flex items-center gap-3 py-2.5 px-1">
          <span className="text-[11px] text-muted-foreground/55 w-4 shrink-0 tabular-nums text-right">
            {i + 1}
          </span>
          <span className="text-xs truncate flex-[0_0_40%] font-medium" title={proc.name}>
            {proc.name}
          </span>
          <Bar value={proc.cpu_percent} max={maxCpu} color="bg-cyan-500" />
          <span className="text-xs text-cyan-300 tabular-nums shrink-0 w-12 text-right">
            {proc.cpu_percent.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Memory Top-10 ─────────────────────────────────────────────────────────────

function MemTopList({ procs }: { procs: ProcessInfo[] }) {
  const top = [...procs].sort((a, b) => b.memory_mb - a.memory_mb).slice(0, 10);
  const maxMem = top[0]?.memory_mb ?? 1;

  if (top.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/50 py-4 text-center">データがありません</p>
    );
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {top.map((proc, i) => (
        <div key={`${proc.pid}-${i}`} className="flex items-center gap-3 py-2.5 px-1">
          <span className="text-[11px] text-muted-foreground/55 w-4 shrink-0 tabular-nums text-right">
            {i + 1}
          </span>
          <span className="text-xs truncate flex-[0_0_40%] font-medium" title={proc.name}>
            {proc.name}
          </span>
          <Bar value={proc.memory_mb} max={maxMem} color="bg-violet-500" />
          <span className="text-xs text-violet-300 tabular-nums shrink-0 w-16 text-right">
            {formatMemory(proc.memory_mb)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Bloatware list ────────────────────────────────────────────────────────────

function BloatwareList({
  procs,
  onKill,
  killing,
}: {
  procs: AnnotatedProcess[];
  onKill: (pid: number, name: string) => void;
  killing: Set<number>;
}) {
  const bloatware = procs.filter(
    (p) => p.annotation && p.annotation.risk_level !== "keep"
  );

  if (bloatware.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/50 py-4 text-center">
        実行中のブロートウェアはありません
      </p>
    );
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {bloatware.map((proc) => {
        const ann = proc.annotation!;
        const isKilling = killing.has(proc.pid);
        const riskColor =
          ann.risk_level === "safe_to_kill"
            ? "text-emerald-400"
            : "text-amber-400";

        return (
          <div
            key={proc.pid}
            className="flex items-center gap-3 py-2.5 px-1 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">{ann.display_name}</span>
                <span className={`text-[10px] ${riskColor} shrink-0`}>
                  {ann.risk_level === "safe_to_kill" ? "停止OK" : "注意"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/55 mt-0.5 truncate">
                {proc.name} · {formatMemory(proc.memory_mb)} · CPU {proc.cpu_percent.toFixed(1)}%
              </p>
            </div>
            <button
              type="button"
              onClick={() => onKill(proc.pid, proc.name)}
              disabled={isKilling}
              className="px-2 py-0.5 text-[11px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-md transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isKilling ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Trash2 size={10} />
              )}
              停止
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.05]">
        <span className="text-muted-foreground/70">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-200 flex-1">{title}</h2>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 bg-white/[0.04] border border-white/[0.12] text-muted-foreground/60 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProcessAnalysis() {
  const [allProcs, setAllProcs] = useState<ProcessInfo[]>([]);
  const [annotated, setAnnotated] = useState<AnnotatedProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [killing, setKilling] = useState<Set<number>>(new Set());

  const mergeAnnotations = useCallback((procs: ProcessInfo[]): AnnotatedProcess[] => {
    return procs.map((p) => ({ ...p, annotation: findAnnotation(p.name) }));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const procs = await invoke<ProcessInfo[]>("get_all_processes");
      setAllProcs(procs);
      setAnnotated(mergeAnnotations(procs));
    } catch (e) {
      toast.error(`プロセス取得失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [mergeAnnotations]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleKill = useCallback(
    async (pid: number, name: string) => {
      setKilling((prev) => new Set(prev).add(pid));
      try {
        await invoke("kill_process", { pid });
        toast.success(`${name} を停止しました`);
        await refresh();
      } catch (e) {
        toast.error(`停止失敗: ${e}`);
      } finally {
        setKilling((prev) => {
          const next = new Set(prev);
          next.delete(pid);
          return next;
        });
      }
    },
    [refresh]
  );

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-violet-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <Activity className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">プロセス分析</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              実行中プロセスのリソース使用状況とブロートウェア
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          更新
        </button>
      </div>

      {loading && allProcs.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-cyan-400" />
          <span className="text-sm">読み込み中...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* CPU Top 10 */}
          <SectionCard
            icon={<Cpu size={15} />}
            title="CPU使用率 TOP 10"
            badge={`${allProcs.length} プロセス`}
          >
            <CpuTopList procs={allProcs} />
          </SectionCard>

          {/* Memory Top 10 */}
          <SectionCard icon={<MemoryStick size={15} />} title="メモリ使用量 TOP 10">
            <MemTopList procs={allProcs} />
          </SectionCard>

          {/* Bloatware — full width */}
          <div className="xl:col-span-2">
            <SectionCard
              icon={<ShieldAlert size={15} />}
              title="実行中のブロートウェア"
              badge={`${annotated.filter((p) => p.annotation && p.annotation.risk_level !== "keep").length} 件`}
            >
              <BloatwareList procs={annotated} onKill={handleKill} killing={killing} />
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
