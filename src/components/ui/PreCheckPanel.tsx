/**
 * PreCheckPanel — 適用前チェック結果表示 (Sprint 2 / S2-06)
 *
 * PreCheckResult を受け取り、ブロッカー / 警告 / 通過 を視覚的に表示する。
 * SafeApplyButton の確認ダイアログ内で使う。
 */
import { ShieldAlert, AlertTriangle, CheckCircle2, Battery, ShieldCheck, HardDrive } from "lucide-react";
import type { PreCheckResult } from "@/types";

interface Props {
  result: PreCheckResult;
}

export function PreCheckPanel({ result }: Props) {
  return (
    <div className="space-y-3">
      {/* ブロッカー */}
      {result.blockers.length > 0 && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>ブロッカー（適用不可）</span>
          </div>
          {result.blockers.map((b, i) => (
            <p key={i} className="text-xs text-red-300 pl-5">
              {b}
            </p>
          ))}
        </div>
      )}

      {/* 警告 */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>警告（適用は可能）</span>
          </div>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-300/80 pl-5">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* ステータス行 */}
      <div className="grid grid-cols-3 gap-2">
        <StatusChip
          icon={<Battery className="w-3 h-3" />}
          label="電源"
          ok={!result.on_battery}
          okText="AC接続"
          ngText="バッテリー"
        />
        <StatusChip
          icon={<ShieldCheck className="w-3 h-3" />}
          label="権限"
          ok={result.is_admin}
          okText="管理者"
          ngText="一般ユーザー"
        />
        <StatusChip
          icon={<HardDrive className="w-3 h-3" />}
          label="空き容量"
          ok={result.free_disk_mb >= 50}
          okText={`${Math.round(result.free_disk_mb)} MB`}
          ngText={`${Math.round(result.free_disk_mb)} MB`}
        />
      </div>

      {/* 全通過バナー */}
      {result.passed && result.blockers.length === 0 && result.warnings.length === 0 && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>全チェック通過 — 安全に適用できます</span>
        </div>
      )}
    </div>
  );
}

function StatusChip({
  icon,
  label,
  ok,
  okText,
  ngText,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  okText: string;
  ngText: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-center
        ${ok ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}
    >
      <span className="opacity-80">{icon}</span>
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="text-[10px] font-medium">{ok ? okText : ngText}</span>
    </div>
  );
}
