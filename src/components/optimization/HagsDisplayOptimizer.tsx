/**
 * HagsDisplayOptimizer — HAGS / ディスプレイHz / Defender除外 (ENABLE_HAGS_DISPLAY_OPTIMIZER)
 *
 * 3 セクション:
 *   1. HAGS (Hardware-Accelerated GPU Scheduling) — 検出・切替
 *   2. ディスプレイ情報 — 現在Hz・最大Hz
 *   3. Windows Defender ゲームフォルダ除外 — 一覧・追加・削除
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Monitor,
  Shield,
  Zap,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { Toggle } from "@/components/ui/toggle";
import type { DisplayOptimizerStatus, HagsInfo, DisplayInfo } from "@/types";

// ── HAGS section ──────────────────────────────────────────────────────────────

function HagsSection({
  hags,
  onToggle,
  toggling,
}: {
  hags: HagsInfo;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}) {
  const [showReboot, setShowReboot] = useState(false);

  function handleToggle(next: boolean) {
    onToggle(next);
    setShowReboot(true);
  }

  if (!hags.supported) {
    return (
      <div className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <XCircle size={14} className="text-muted-foreground/40 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] text-muted-foreground/60">
            HAGS は Windows 10 version 2004 (build 19041) 以降が必要です
          </p>
          <p className="text-[10px] text-muted-foreground/30 mt-0.5">
            現在のビルド: {hags.winBuild}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Status row */}
      <div className="flex items-center justify-between gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <div className="flex items-center gap-2.5">
          {hags.enabled ? (
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          ) : (
            <XCircle size={14} className="text-muted-foreground/40 shrink-0" />
          )}
          <div>
            <p className="text-[12px] font-medium text-white">
              {hags.enabled ? "有効" : "無効"}
              <span className="ml-2 text-[10px] text-muted-foreground/40 font-normal">
                Win build {hags.winBuild}
              </span>
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              DX12 ゲームの GPU 効率・フレームタイムが改善します
            </p>
          </div>
        </div>
        <Toggle
          checked={hags.enabled}
          onChange={() => handleToggle(!hags.enabled)}
          disabled={toggling}
        />
      </div>

      {/* Reboot notice */}
      {showReboot && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/15 rounded-lg">
          <RotateCcw size={11} className="text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-300/80">
            変更は再起動後に反映されます
          </p>
        </div>
      )}

      {/* Info card */}
      <div className="flex items-start gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
        <Info size={10} className="text-muted-foreground/30 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
          HAGS は GPU スケジューリングを Windows ではなく GPU ドライバーに委ねる機能です。
          対応 GPU・ドライバー（NVIDIA 451.48+ / AMD 20.5.1+）が必要です。
        </p>
      </div>
    </div>
  );
}

// ── Display section ───────────────────────────────────────────────────────────

function DisplaySection({ displays }: { displays: DisplayInfo[] }) {
  if (displays.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/30 py-2">
        ディスプレイ情報を取得できませんでした
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {displays.map((d, i) => {
        const isMaxHz = d.currentHz >= d.maxHz;
        const hzColor = d.currentHz >= 120
          ? "text-emerald-400"
          : d.currentHz >= 60
          ? "text-amber-400"
          : "text-rose-400";

        return (
          <div
            key={i}
            className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl"
          >
            <Monitor size={13} className="text-muted-foreground/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-slate-200 truncate">{d.name}</p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                最大 {d.maxHz} Hz
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn("text-[15px] font-bold tabular-nums", hzColor)}>
                {d.currentHz} <span className="text-[10px] font-normal">Hz</span>
              </p>
              {!isMaxHz && (
                <p className="text-[9px] text-amber-400/70 mt-0.5">
                  最大未到達
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Info */}
      <div className="flex items-start gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
        <Info size={10} className="text-muted-foreground/30 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
          最大 Hz に達していない場合、ゲーム内またはディスプレイ設定からリフレッシュレートを変更してください。
        </p>
      </div>
    </div>
  );
}

// ── Defender exclusions section ───────────────────────────────────────────────

function DefenderSection({
  exclusions,
  onAdd,
  onRemove,
  loading,
}: {
  exclusions: string[];
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
  loading: boolean;
}) {
  const [newPath, setNewPath] = useState("");

  function handleAdd() {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewPath("");
  }

  return (
    <div className="space-y-2.5">
      {/* Existing exclusions */}
      {exclusions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/30 py-1">
          除外パスがありません
        </p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {exclusions.map((path) => (
            <div
              key={path}
              className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg group"
            >
              <CheckCircle2 size={10} className="text-emerald-400/60 shrink-0" />
              <span className="flex-1 text-[11px] font-mono text-slate-300 truncate" title={path}>
                {path}
              </span>
              <button
                type="button"
                onClick={() => onRemove(path)}
                aria-label={`${path} の除外を削除`}
                disabled={loading}
                className="shrink-0 text-muted-foreground/20 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-20"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="C:\Games\GameName"
          className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] font-mono text-slate-200 placeholder:text-muted-foreground/30 outline-none focus:border-cyan-500/40 transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading || !newPath.trim()}
          aria-label="除外パスを追加"
          className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          追加
        </button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
        <AlertTriangle size={10} className="text-amber-400/60 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
          除外追加・削除には管理者権限が必要です。ゲームの実行ファイルフォルダのみ追加することを推奨します。
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HagsDisplayOptimizer() {
  const [status, setStatus] = useState<DisplayOptimizerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [defLoading, setDefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await invoke<DisplayOptimizerStatus>("get_display_optimizer_status");
      setStatus(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleHagsToggle(enabled: boolean) {
    setToggling(true);
    try {
      const updated = await invoke<HagsInfo>("set_hags_enabled", { enabled });
      setStatus((prev) => prev ? { ...prev, hags: updated } : prev);
      toast.success(enabled ? "HAGS を有効化しました（再起動後に反映）" : "HAGS を無効化しました（再起動後に反映）");
    } catch (e) {
      toast.error(`HAGS 変更失敗: ${String(e)}`);
    } finally {
      setToggling(false);
    }
  }

  async function handleAddExclusion(path: string) {
    setDefLoading(true);
    try {
      const updated = await invoke<string[]>("add_defender_exclusion", { path });
      setStatus((prev) => prev ? { ...prev, defenderExclusions: updated } : prev);
      toast.success(`除外追加: ${path}`);
    } catch (e) {
      toast.error(`除外追加失敗: ${String(e)}`);
    } finally {
      setDefLoading(false);
    }
  }

  async function handleRemoveExclusion(path: string) {
    setDefLoading(true);
    try {
      const updated = await invoke<string[]>("remove_defender_exclusion", { path });
      setStatus((prev) => prev ? { ...prev, defenderExclusions: updated } : prev);
      toast.success(`除外削除: ${path}`);
    } catch (e) {
      toast.error(`除外削除失敗: ${String(e)}`);
    } finally {
      setDefLoading(false);
    }
  }

  const sectionCls = "space-y-2.5";
  const headerCls = "flex items-center gap-2 mb-3";
  const titleCls = "text-[12px] font-semibold text-muted-foreground/80";

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground/40">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[12px]">読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <XCircle size={20} className="text-rose-400/60" />
        <p className="text-[12px] text-rose-300/70 text-center">{error}</p>
        <button
          type="button"
          onClick={fetchStatus}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-white/[0.06] text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          <RefreshCw size={10} /> 再試行
        </button>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-5">

      {/* 1. HAGS */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Zap size={13} className="text-violet-400" />
          <span className={titleCls}>HAGS（GPU スケジューリング高速化）</span>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            aria-label="更新"
            className="ml-auto text-muted-foreground/30 hover:text-muted-foreground transition-colors disabled:opacity-30"
          >
            <RefreshCw size={10} className={cn(loading && "animate-spin")} />
          </button>
        </div>
        <HagsSection
          hags={status.hags}
          onToggle={handleHagsToggle}
          toggling={toggling}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.04]" />

      {/* 2. Display refresh rate */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Monitor size={13} className="text-cyan-400" />
          <span className={titleCls}>ディスプレイ リフレッシュレート</span>
        </div>
        <DisplaySection displays={status.displays} />
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.04]" />

      {/* 3. Defender exclusions */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Shield size={13} className="text-emerald-400" />
          <span className={titleCls}>Windows Defender ゲーム除外</span>
          <span className="ml-1 text-[9px] text-muted-foreground/30 bg-white/[0.03] border border-white/[0.05] rounded-full px-2 py-0.5">
            {status.defenderExclusions.length} 件
          </span>
        </div>
        <DefenderSection
          exclusions={status.defenderExclusions}
          onAdd={handleAddExclusion}
          onRemove={handleRemoveExclusion}
          loading={defLoading}
        />
      </div>

    </div>
  );
}
