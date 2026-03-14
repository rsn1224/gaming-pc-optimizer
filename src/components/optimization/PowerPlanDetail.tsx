import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Zap, Star, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { PowerPlanInfo } from "@/types";

// Well-known GUIDs
const HIGH_PERF_GUID = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

function planTier(plan: PowerPlanInfo): "ultimate" | "high" | "normal" {
  const name = plan.name.toLowerCase();
  const guid = plan.guid.toLowerCase();
  if (guid.startsWith("e9a42b02") || name.includes("ultimate")) return "ultimate";
  if (guid.startsWith("8c5e7fda") || name.includes("high performance") || name.includes("高パフォーマンス")) return "high";
  return "normal";
}

export function PowerPlanDetail() {
  const [plans, setPlans] = useState<PowerPlanInfo[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>("unknown");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planList, current] = await Promise.all([
        invoke<PowerPlanInfo[]>("list_power_plans"),
        invoke<string>("get_power_plan"),
      ]);
      setPlans(planList);
      setCurrentPlan(current);
    } catch (e) {
      toast.error(`電源プランの読み込みに失敗しました: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyByGuid = useCallback(async (guid: string, planName: string) => {
    if (applying) return;
    setApplying(guid);
    try {
      await invoke("set_power_plan_by_guid", { guid });
      toast.success(`「${planName}」を適用しました`);
      await load();
    } catch (e) {
      toast.error(`適用に失敗しました: ${e}`);
    } finally {
      setApplying(null);
    }
  }, [applying, load]);

  const applyQuick = useCallback(async (mode: "ultimate" | "high_performance") => {
    if (applying) return;
    setApplying(mode);
    try {
      if (mode === "ultimate") {
        await invoke("set_ultimate_performance");
        toast.success("Ultimate Performance を適用しました");
      } else {
        await invoke("set_power_plan_by_guid", { guid: HIGH_PERF_GUID });
        toast.success("High Performance を適用しました");
      }
      await load();
    } catch (e) {
      toast.error(`適用に失敗しました: ${e}`);
    } finally {
      setApplying(null);
    }
  }, [applying, load]);

  const currentPlanLabel: Record<string, string> = {
    balanced: "バランス",
    high_performance: "高パフォーマンス",
    ultimate: "Ultimate Performance",
    unknown: "不明",
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-semibold text-white">電源プラン詳細設定</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            現在: <span className="text-cyan-400">{currentPlanLabel[currentPlan] ?? currentPlan}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          更新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Quick-apply buttons */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">クイック適用</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => applyQuick("ultimate")}
              disabled={!!applying}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-300 hover:from-amber-500/30 hover:to-orange-500/20 transition-all disabled:opacity-50"
            >
              {applying === "ultimate" ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
              Ultimate Performance
            </button>
            <button
              type="button"
              onClick={() => applyQuick("high_performance")}
              disabled={!!applying}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 text-cyan-300 hover:from-cyan-500/30 hover:to-blue-500/20 transition-all disabled:opacity-50"
            >
              {applying === "high_performance" ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              High Performance
            </button>
          </div>
        </div>

        {/* Plan list */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">利用可能なプラン</p>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-cyan-400/50" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              電源プランが見つかりませんでした
            </div>
          ) : (
            plans.map((plan) => {
              const tier = planTier(plan);
              const isApplying = applying === plan.guid;

              return (
                <button
                  type="button"
                  key={plan.guid}
                  onClick={() => !plan.is_active && applyByGuid(plan.guid, plan.name)}
                  disabled={plan.is_active || !!applying}
                  className={cn(
                    "w-full text-left bg-white/[0.03] border rounded-2xl p-5 transition-all",
                    plan.is_active
                      ? "border-cyan-500/40 bg-cyan-500/5 cursor-default"
                      : "border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] cursor-pointer disabled:opacity-50",
                    tier === "ultimate" && !plan.is_active && "hover:border-amber-500/30",
                    tier === "high" && !plan.is_active && "hover:border-cyan-500/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "font-medium text-sm",
                          plan.is_active ? "text-white" : "text-slate-300",
                        )}>
                          {plan.name}
                        </span>
                        {plan.is_active && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded-full">
                            <CheckCircle2 size={9} />
                            アクティブ
                          </span>
                        )}
                        {tier === "ultimate" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                            <Star size={9} />
                            最高性能
                          </span>
                        )}
                        {tier === "high" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-cyan-500/10 text-cyan-400/80 border border-cyan-500/20 px-1.5 py-0.5 rounded-full">
                            <Zap size={9} />
                            高性能
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 font-mono mt-1 truncate">
                        {plan.guid}
                      </p>
                    </div>
                    {isApplying && (
                      <Loader2 size={16} className="animate-spin text-cyan-400 shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Info note */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3">
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Ultimate Performance プランが一覧にない場合は「クイック適用」ボタンから自動作成・適用できます。
            電源プランの変更は即座に反映されます。
          </p>
        </div>
      </div>
    </div>
  );
}
