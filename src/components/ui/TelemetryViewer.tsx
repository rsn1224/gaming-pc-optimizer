/**
 * TelemetryViewer  ET0/T1/T2 スコアタイムライン表示 (Sprint 3 / S3-02)
 *
 * セチE��ョン ID を受け取り、before→t1_30s→t2_5min の3フェーズめE
 * スコアバ�E + メモリ数値で表示する、E
 * ENABLE_TELEMETRY=false 時�Eコンパクトなプレースホルダーを表示する、E
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BarChart2, Clock, Loader2 } from "lucide-react";
import type { TelemetryRecord, TelemetryPhase } from "@/types";

// ── Feature flag (mirrors Rust) ───────────────────────────────────────────────
export const ENABLE_TELEMETRY_UI = true;

// ── Helpers ───────────────────────────────────────────────────────────────────

const PHASE_META: Record<TelemetryPhase, { label: string; delay: string }> = {
  before: { label: "適用剁E(T0)", delay: "" },
  t1_30s: { label: "30秒征E(T1)", delay: "+30s" },
  t2_5min: { label: "5刁E��E(T2)", delay: "+5min" },
};

const PHASE_ORDER: TelemetryPhase[] = ["before", "t1_30s", "t2_5min"];

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    value >= 80
      ? "bg-emerald-500"
      : value >= 50
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-white/70 w-7 text-right font-mono">{value}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
}

export function TelemetryViewer({ sessionId }: Props) {
  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ENABLE_TELEMETRY_UI || !sessionId) return;
    setLoading(true);
    invoke<TelemetryRecord[]>("get_telemetry_for_session", { sessionId })
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (!ENABLE_TELEMETRY_UI) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-xs py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        チE��メトリ読み込み中...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex items-center gap-2 text-zinc-600 text-xs py-2">
        <BarChart2 className="w-3.5 h-3.5" />
        チE��メトリチE�Eタなし（このセチE��ョンは計測対象外！E
      </div>
    );
  }

  // Build a map by phase for easy lookup
  const byPhase = new Map(records.map((r) => [r.phase, r]));

  // Score delta T0 ↁElatest
  const t0 = byPhase.get("before");
  const latest = byPhase.get("t2_5min") ?? byPhase.get("t1_30s");
  const delta =
    t0 && latest ? latest.score_overall - t0.score_overall : null;

  return (
    <div className="mt-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <BarChart2 className="w-3.5 h-3.5" />
          <span>チE��メトリ  Eスコア推移</span>
        </div>
        {delta !== null && (
          <span
            className={`text-xs font-semibold ${
              delta >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {delta >= 0 ? "+" : ""}{delta} pts
          </span>
        )}
      </div>

      {/* Phase columns */}
      <div className="grid grid-cols-3 gap-2">
        {PHASE_ORDER.map((phase) => {
          const rec = byPhase.get(phase);
          const meta = PHASE_META[phase];

          return (
            <div
              key={phase}
              className={`rounded-lg p-3 space-y-2 border
                ${rec
                  ? "bg-white/[0.03] border-white/[0.06]"
                  : "bg-white/[0.01] border-white/[0.03] opacity-40"
                }`}
            >
              {/* Phase label */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">{meta.label}</span>
                {meta.delay && (
                  <span className="flex items-center gap-0.5 text-[10px] text-zinc-600">
                    <Clock className="w-2.5 h-2.5" />
                    {meta.delay}
                  </span>
                )}
              </div>

              {rec ? (
                <>
                  {/* Overall score big */}
                  <div className="text-center">
                    <span className="text-2xl font-bold text-white/90">
                      {rec.score_overall}
                    </span>
                    <span className="text-xs text-zinc-500 ml-1">/ 100</span>
                  </div>

                  {/* Sub-scores */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
                      <span>プロセス</span>
                    </div>
                    <ScoreBar value={rec.score_process} />
                    <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
                      <span>電溁E/span>
                    </div>
                    <ScoreBar value={rec.score_power} />
                    <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
                      <span>Windows</span>
                    </div>
                    <ScoreBar value={rec.score_windows} />
                    <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
                      <span>ネットワーク</span>
                    </div>
                    <ScoreBar value={rec.score_network} />
                  </div>

                  {/* Memory */}
                  <div className="pt-1 border-t border-white/[0.04] text-[10px] text-zinc-500">
                    メモリ {rec.memory_used_mb.toFixed(0)} MB
                    {" "}({rec.memory_percent.toFixed(1)}%)
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-[10px] text-zinc-700">
                  未計測
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
