import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import type { DiskHealthReport, DiskInfo } from "@/types";

// ── Circular health indicator ─────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const R = 28;
  const circ = 2 * Math.PI * R;
  const offset = circ - (score / 100) * circ;
  const color =
    score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";

  return (
    <svg width={72} height={72}>
      <circle cx={36} cy={36} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle
        cx={36} cy={36} r={R}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        className="transition-[stroke-dashoffset] duration-[600ms] ease-in-out"
      />
      <text x={36} y={41} textAnchor="middle" fontSize={14} fontWeight={700} fill={color}>
        {score}
      </text>
    </svg>
  );
}

// ── Disk card ─────────────────────────────────────────────────────────────────

function DiskCard({ disk }: { disk: DiskInfo }) {
  const scoreColor =
    disk.health_score >= 80
      ? "text-emerald-400"
      : disk.health_score >= 50
      ? "text-amber-400"
      : "text-red-400";

  const badgeCls =
    disk.media_type === "NVMe SSD"
      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
      : disk.media_type === "SSD"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : disk.media_type === "HDD"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-white/5 text-muted-foreground border-white/[0.06]";

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-5">
      <HealthRing score={disk.health_score} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white truncate">{disk.caption}</p>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border shrink-0", badgeCls)}>
            {disk.media_type}
          </span>
        </div>
        <p className={cn("text-xs font-medium mb-1", scoreColor)}>{disk.status}</p>
        <p className="text-xs text-muted-foreground">
          容量: {disk.size_gb.toFixed(0)} GB
          {disk.serial && <span className="ml-3 opacity-60">S/N: {disk.serial}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-muted-foreground mb-0.5">健全性スコア</p>
        <p className={cn("text-xl font-bold tabular-nums", scoreColor)}>{disk.health_score}</p>
        <p className="text-[10px] text-muted-foreground">/ 100</p>
      </div>
    </div>
  );
}

// ── Overall badge ─────────────────────────────────────────────────────────────

function OverallBadge({ health }: { health: string }) {
  if (health === "健全") {
    return (
      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5">
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        <span className="text-sm font-medium text-emerald-400">すべてのディスクは健全です</span>
      </div>
    );
  }
  if (health === "注意") {
    return (
      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
        <AlertTriangle size={16} className="text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-amber-400">一部のディスクに注意が必要です</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
      <XCircle size={16} className="text-red-400 shrink-0" />
      <span className="text-sm font-medium text-red-400">ディスクに重大な問題が検出されました</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiskHealth() {
  const [report, setReport] = useState<DiskHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastScanned, setLastScanned] = useState<Date | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<DiskHealthReport>("get_disk_health");
      setReport(data);
      setLastScanned(new Date());
    } catch (e) {
      toast.error(`スキャン失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">ディスク健全性チェック</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastScanned && (
            <span className="text-xs text-muted-foreground">
              最終スキャン: {lastScanned.toLocaleTimeString("ja-JP")}
            </span>
          )}
          <button
            type="button"
            onClick={scan}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            再スキャン
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Loading */}
        {loading && !report && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <RefreshCw size={24} className="animate-spin text-cyan-400" />
            <p className="text-sm">スキャン中...</p>
          </div>
        )}

        {report && (
          <>
            {/* Overall health */}
            <OverallBadge health={report.overall_health} />

            {/* Disk cards */}
            {report.disks.length > 0 ? (
              <div className="space-y-3">
                {report.disks.map((disk, i) => (
                  <DiskCard key={i} disk={disk} />
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center text-muted-foreground text-sm">
                ディスク情報が取得できませんでした
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                <p className="text-xs text-muted-foreground mb-3">推奨事項</p>
                <ul className="space-y-2">
                  {report.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Note */}
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5 text-xs text-muted-foreground/60">
              ※ 詳細なSMART情報はサードパーティツール（CrystalDiskInfo等）でご確認ください。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
