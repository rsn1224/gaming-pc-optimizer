import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";
import type { ProcessAffinityInfo } from "@/types";
import { Layers, RefreshCw, AlertTriangle } from "lucide-react";

function AffinityGrid({
  mask,
  cpuCount,
  onChange,
}: {
  mask: number;
  cpuCount: number;
  onChange: (newMask: number) => void;
}) {
  const cores = Math.min(cpuCount, 64);
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: cores }, (_, i) => {
        const bit = 1 << i;
        const active = (mask & bit) !== 0;
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              const newMask = active ? mask & ~bit : mask | bit;
              onChange(newMask || 1); // always keep at least 1 core
            }}
            className={cn(
              "w-9 h-9 rounded-lg text-[10px] font-medium border transition-all",
              active
                ? "bg-cyan-500/25 border-cyan-500/40 text-cyan-300"
                : "bg-white/[0.03] border-white/[0.06] text-muted-foreground hover:border-white/20"
            )}
          >
            {i}
          </button>
        );
      })}
    </div>
  );
}

export function CpuAffinity() {
  const [processes, setProcesses] = useState<ProcessAffinityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [pendingMask, setPendingMask] = useState<number>(0);
  const [applying, setApplying] = useState(false);

  const loadProcesses = async () => {
    setLoading(true);
    try {
      const result = await invoke<ProcessAffinityInfo[]>("get_process_affinities");
      setProcesses(result);
      if (result.length > 0 && selectedPid === null) {
        setSelectedPid(result[0].pid);
        setPendingMask(result[0].affinity_mask);
      }
    } catch (e) {
      toast.error(`読み込み失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProcesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProcess = processes.find((p) => p.pid === selectedPid) ?? null;

  const handleSelectProcess = (proc: ProcessAffinityInfo) => {
    setSelectedPid(proc.pid);
    setPendingMask(proc.affinity_mask);
  };

  const handleApplyAffinity = async () => {
    if (!selectedPid) return;
    setApplying(true);
    try {
      await invoke("set_process_affinity", {
        pid: selectedPid,
        affinityMask: pendingMask,
      });
      toast.success(`設定完了: PID ${selectedPid} のCPUアフィニティを変更しました`);
      await loadProcesses();
    } catch (e) {
      toast.error(`設定失敗: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  const handleResetAffinity = async (pid: number) => {
    setApplying(true);
    try {
      await invoke("reset_process_affinity", { pid });
      toast.success(`リセット完了: PID ${pid} のCPUアフィニティをリセットしました`);
      await loadProcesses();
    } catch (e) {
      toast.error(`リセット失敗: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  const cpuCount = selectedProcess?.cpu_count ?? processes[0]?.cpu_count ?? 8;

  const allCoresMask = cpuCount >= 64 ? Number.MAX_SAFE_INTEGER : (1 << cpuCount) - 1;
  const perfCoresMask = Math.min(0xFF, allCoresMask); // cores 0-7

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Layers size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">CPUアフィニティ</h1>
        </div>
        <button
          type="button"
          onClick={loadProcesses}
          disabled={loading}
          title="再読み込み"
          className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-all"
        >
          <RefreshCw size={15} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* Warning */}
      <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
        <AlertTriangle size={14} className="shrink-0" />
        システムプロセスのアフィニティ変更は危険です。ユーザープロセスのみ操作してください。
      </div>

      <div className="flex-1 overflow-hidden flex gap-0 p-6 pt-4">
        {/* Process list */}
        <div className="w-72 shrink-0 overflow-y-auto pr-4 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
              読み込み中...
            </div>
          ) : (
            processes.map((proc) => (
              <button
                key={proc.pid}
                type="button"
                onClick={() => handleSelectProcess(proc)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                  selectedPid === proc.pid
                    ? "bg-cyan-500/15 border border-cyan-500/25"
                    : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05]"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{proc.name}</p>
                  <p className="text-[11px] text-muted-foreground">PID: {proc.pid}</p>
                </div>
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    proc.using_all_cores
                      ? "bg-emerald-400"
                      : "bg-amber-400"
                  )}
                />
              </button>
            ))
          )}
        </div>

        {/* Affinity detail */}
        <div className="flex-1 overflow-y-auto pl-4 space-y-4">
          {selectedProcess ? (
            <>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">{selectedProcess.name}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">PID: {selectedProcess.pid}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingMask(allCoresMask)}
                      className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-xs text-muted-foreground hover:text-white transition-all"
                    >
                      すべてのコアを使用
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingMask(perfCoresMask)}
                      className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-xs text-muted-foreground hover:text-white transition-all"
                    >
                      パフォーマンスコアのみ
                    </button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  使用するCPUコアを選択してください（青 = 有効）
                </p>

                <AffinityGrid
                  mask={pendingMask}
                  cpuCount={cpuCount}
                  onChange={setPendingMask}
                />

                <div className="mt-4 flex items-center gap-2">
                  <p className="text-xs text-muted-foreground flex-1">
                    マスク値: <span className="font-mono text-white">{pendingMask}</span>
                    {" ("}
                    {pendingMask === selectedProcess.affinity_mask
                      ? "変更なし"
                      : "変更あり"}
                    {")"}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleResetAffinity(selectedProcess.pid)}
                    disabled={applying}
                    className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-xs text-muted-foreground hover:text-white transition-all disabled:opacity-50"
                  >
                    全コアにリセット
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyAffinity}
                    disabled={applying || pendingMask === selectedProcess.affinity_mask}
                    className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-xl text-cyan-300 text-xs font-medium transition-all disabled:opacity-50"
                  >
                    {applying ? "設定中..." : "適用"}
                  </button>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="text-sm font-medium text-white mb-2">使用中のコア数</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-cyan-400">
                    {pendingMask.toString(2).split("").filter((b) => b === "1").length}
                  </span>
                  <span className="text-muted-foreground text-sm">/ {cpuCount} コア</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedProcess.using_all_cores
                    ? "すべてのコアを使用中"
                    : "一部のコアに制限中"}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              左のリストからプロセスを選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
