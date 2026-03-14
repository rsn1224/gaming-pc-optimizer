/**
 * AiProfileGenerator — AI によるゲームプロファイル自動生成モーダル (S9-02)
 *
 * フロー:
 *   1. ゲーム名 (+ 任意の EXE パス) を入力
 *   2. "AI で生成" → generate_ai_profile を呼び出し
 *   3. 生成結果をプレビュー表示（設定サマリー + AI の推薦理由）
 *   4. "保存" → save_profile → onSaved コールバック
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bot, Sparkles, X, Loader2, CheckCircle2, Zap, Monitor,
  HardDrive, Wifi, ShieldCheck, Save, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameProfile } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const POWER_LABEL: Record<string, string> = {
  none: "変更なし",
  ultimate: "Ultimate Performance",
  high_performance: "高パフォーマンス",
};
const WIN_LABEL: Record<string, string> = {
  none: "変更なし",
  gaming: "ゲーミング最適化",
  default: "デフォルト",
};
const STORAGE_LABEL: Record<string, string> = {
  none: "変更なし",
  light: "軽量クリーン",
  deep: "ディープクリーン",
};
const NETWORK_LABEL: Record<string, string> = {
  none: "変更なし",
  gaming: "ゲーミング最適化",
};
const DNS_LABEL: Record<string, string> = {
  none: "変更なし",
  google: "Google (8.8.8.8)",
  cloudflare: "Cloudflare (1.1.1.1)",
  opendns: "OpenDNS",
  dhcp: "DHCP (自動)",
};
const MODE_COLOR: Record<string, string> = {
  competitive: "text-red-400 bg-red-500/10 border-red-500/20",
  balanced:    "text-amber-400 bg-amber-500/10 border-amber-500/20",
  quality:     "text-violet-400 bg-violet-500/10 border-violet-500/20",
};
const MODE_LABEL: Record<string, string> = {
  competitive: "競技",
  balanced:    "バランス",
  quality:     "品質",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SettingRow({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
        <span className="text-muted-foreground/40">{icon}</span>
        {label}
      </div>
      <span className={cn(
        "text-xs font-medium tabular-nums",
        highlight ? "text-cyan-300" : "text-slate-300"
      )}>
        {value}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AiProfileGeneratorProps {
  onClose: () => void;
  onSaved: (profile: GameProfile) => void;
}

export function AiProfileGenerator({ onClose, onSaved }: AiProfileGeneratorProps) {
  const [gameName, setGameName] = useState("");
  const [exePath, setExePath] = useState("");
  const [status, setStatus] = useState<"idle" | "generating" | "preview" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<GameProfile | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(false);

  const handleGenerate = async () => {
    if (!gameName.trim()) return;
    setStatus("generating");
    setErrorMsg("");
    try {
      const profile = await invoke<GameProfile>("generate_ai_profile", {
        gameName: gameName.trim(),
        exePath: exePath.trim() || null,
      });
      setDraft(profile);
      setStatus("preview");
    } catch (e) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await invoke("save_profile", { profile: draft });
      setSaved(true);
      setTimeout(() => {
        onSaved(draft);
        onClose();
      }, 900);
    } catch (e) {
      setErrorMsg(String(e));
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleEditName = (name: string) => {
    if (draft) setDraft({ ...draft, name });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-[#05080c] border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
        {/* Top accent */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/15 border border-violet-500/25 rounded-xl">
              <Bot size={18} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">AI プロファイル生成</h2>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                ゲーム名を入力するだけで最適設定を自動生成します
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-muted-foreground/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Input form */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground/60 block mb-1.5">
                ゲーム名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={gameName}
                onChange={(e) => { setGameName(e.target.value); setStatus("idle"); setDraft(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder="例: Apex Legends, Elden Ring, Valorant..."
                disabled={status === "generating" || saving}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500/40 transition-colors disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground/60 block mb-1.5">
                EXE パス <span className="text-muted-foreground/30">(任意)</span>
              </label>
              <input
                type="text"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                placeholder="例: r5apex.exe"
                disabled={status === "generating" || saving}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-violet-500/40 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Generate button */}
          {status !== "preview" && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!gameName.trim() || status === "generating"}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-gradient-to-r from-violet-500 to-cyan-500 text-white rounded-xl hover:brightness-110 disabled:opacity-50 active:scale-[0.97] transition-all"
            >
              {status === "generating"
                ? <><Loader2 size={15} className="animate-spin" /> AI 解析中...</>
                : <><Sparkles size={15} /> AI で生成</>}
            </button>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="flex items-start gap-2.5 p-3 bg-red-500/8 border border-red-500/20 rounded-xl text-xs text-red-300">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">生成に失敗しました</p>
                <p className="text-muted-foreground/60 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {status === "preview" && draft && (
            <div className="space-y-4">
              {/* Profile name (editable) */}
              <div>
                <label htmlFor="ai-profile-name" className="text-xs font-medium text-muted-foreground/60 block mb-1.5">
                  プロファイル名 <span className="text-muted-foreground/30">(編集可)</span>
                </label>
                <input
                  id="ai-profile-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) => handleEditName(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/40 transition-colors"
                />
              </div>

              {/* Mode badge + confidence */}
              <div className="flex items-center gap-2.5">
                {draft.recommended_mode && (
                  <span className={cn(
                    "text-[11px] font-semibold px-2.5 py-1 rounded-full border",
                    MODE_COLOR[draft.recommended_mode] ?? "text-slate-400 bg-white/[0.05] border-white/[0.10]"
                  )}>
                    {MODE_LABEL[draft.recommended_mode] ?? draft.recommended_mode} モード
                  </span>
                )}
                {draft.recommended_confidence != null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                    <div className="h-1.5 w-20 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full",
                          draft.recommended_confidence >= 80 ? "bg-emerald-500"
                          : draft.recommended_confidence >= 50 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${draft.recommended_confidence}%` }} // eslint-disable-line react/forbid-component-props
                      />
                    </div>
                    <span className="tabular-nums">信頼度 {draft.recommended_confidence}%</span>
                  </div>
                )}
              </div>

              {/* Reason */}
              {draft.recommended_reason && (
                <div className="flex items-start gap-2 p-3 bg-violet-500/8 border border-violet-500/15 rounded-xl">
                  <Bot size={12} className="text-violet-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    {draft.recommended_reason}
                  </p>
                </div>
              )}

              {/* Settings summary */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-1">
                <SettingRow
                  icon={<ShieldCheck size={10} />} label="ブロートウェア終了"
                  value={draft.kill_bloatware ? "有効" : "無効"}
                  highlight={draft.kill_bloatware}
                />
                <SettingRow
                  icon={<Zap size={10} />} label="電源プラン"
                  value={POWER_LABEL[draft.power_plan] ?? draft.power_plan}
                  highlight={draft.power_plan !== "none"}
                />
                <SettingRow
                  icon={<Monitor size={10} />} label="Windows 設定"
                  value={WIN_LABEL[draft.windows_preset] ?? draft.windows_preset}
                  highlight={draft.windows_preset !== "none"}
                />
                <SettingRow
                  icon={<HardDrive size={10} />} label="ストレージ"
                  value={STORAGE_LABEL[draft.storage_mode] ?? draft.storage_mode}
                  highlight={draft.storage_mode !== "none"}
                />
                <SettingRow
                  icon={<Wifi size={10} />} label="ネットワーク"
                  value={NETWORK_LABEL[draft.network_mode] ?? draft.network_mode}
                  highlight={draft.network_mode !== "none"}
                />
                <SettingRow
                  icon={<Wifi size={10} />} label="DNS"
                  value={DNS_LABEL[draft.dns_preset] ?? draft.dns_preset}
                  highlight={draft.dns_preset !== "none"}
                />
              </div>

              {/* Tags */}
              {draft.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {draft.tags.map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-white/[0.05] border border-white/[0.08] rounded-full text-muted-foreground/60">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStatus("idle"); setDraft(null); }}
                  className="flex-1 py-2 text-xs text-muted-foreground/60 hover:text-white border border-white/[0.07] hover:border-white/20 rounded-xl transition-colors"
                >
                  やり直す
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || saved}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-xl hover:brightness-110 disabled:opacity-50 active:scale-[0.97] transition-all"
                >
                  {saved
                    ? <><CheckCircle2 size={13} /> 保存しました</>
                    : saving
                    ? <><Loader2 size={13} className="animate-spin" /> 保存中...</>
                    : <><Save size={13} /> このプロファイルを保存</>}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
