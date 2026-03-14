/**
 * FirstRunWizard — 初回起動ウィザード (S7-04)
 *
 * Steps:
 *   0  Welcome      — アプリ紹介
 *   1  API Key      — OpenAI APIキー設定
 *   2  AutoOptimize — 自動最適化トグル
 *   3  PolicyGuide  — ポリシーエンジン案内
 *   4  Done         — 完了
 *
 * Persistence: localStorage key "hasSeenWizard_v1"
 */
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, Key, Zap, Bot, CheckCircle2, ArrowRight, ChevronLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WIZARD_KEY = "hasSeenWizard_v1";

// ─── Step types ──────────────────────────────────────────────────────────────

interface WizardStepProps {
  onNext: () => void;
  onBack?: () => void;
}

// ─── Step 0: Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ onNext }: WizardStepProps) {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="p-5 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-3xl shadow-[0_0_40px_rgba(34,211,238,0.15)]">
        <Gamepad2 size={40} className="text-cyan-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Gaming PC Optimizer へようこそ</h2>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">
          Windows ゲーミング PC のパフォーマンスを AI が自動最適化します。
          <br />
          初回セットアップを数ステップで完了しましょう。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground/60">
        {[
          "Safety Kernel 搭載",
          "ポリシー自動化",
          "DAG 最適化グラフ",
          "ロールバック対応",
        ].map((f) => (
          <span key={f} className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.04] border border-white/[0.12] rounded-full">
            <CheckCircle2 size={11} className="text-emerald-400" />
            {f}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-xl hover:brightness-110 active:scale-[0.97] transition-all mt-1"
      >
        はじめる
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

// ─── Step 1: API Key ──────────────────────────────────────────────────────────

function StepApiKey({ onNext, onBack }: WizardStepProps) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");

  const handleSave = async () => {
    if (!key.trim()) { onNext(); return; }
    setSaving(true);
    try {
      await invoke("save_api_key", { key: key.trim() });
      setStatus("ok");
      setTimeout(onNext, 800);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <Key size={20} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold">AI 機能の設定</h2>
          <p className="text-xs text-muted-foreground/60">OpenAI API キーを登録すると AI 推奨が有効になります</p>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <label className="text-xs font-medium text-muted-foreground/70">
          OpenAI API キー <span className="text-muted-foreground/55">（任意）</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => { setKey(e.target.value); setStatus("idle"); }}
              placeholder="sk-..."
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-sm font-mono pr-9 outline-none focus:border-cyan-500/40 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/55 hover:text-white transition-colors"
            >
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
        {status === "ok" && (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={11} /> 保存しました
          </p>
        )}
        {status === "error" && (
          <p className="text-xs text-red-400">保存に失敗しました。後で設定から再登録できます。</p>
        )}
        <p className="text-[11px] text-muted-foreground/55 leading-relaxed">
          キーはシステムキーチェーンに安全に保存されます。
          スキップして後で「設定 → AI 設定」から登録することもできます。
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-white transition-colors">
          <ChevronLeft size={14} /> 戻る
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNext}
            className="px-4 py-2 text-xs text-muted-foreground/60 hover:text-white border border-white/[0.07] hover:border-white/20 rounded-lg transition-colors"
          >
            スキップ
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !key.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-lg hover:brightness-110 disabled:opacity-50 transition-all active:scale-[0.97]"
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            保存して次へ
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Auto-optimize toggle ────────────────────────────────────────────

function StepAutoOptimize({ onNext, onBack }: WizardStepProps) {
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    try {
      await invoke("set_auto_optimize", { enabled });
    } catch {
      // non-fatal
    } finally {
      setSaving(false);
      onNext();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
          <Zap size={20} className="text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold">自動最適化</h2>
          <p className="text-xs text-muted-foreground/60">バックグラウンドでスコアを監視し、自動で最適化します</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={cn(
          "relative flex items-start gap-4 p-4 rounded-xl border transition-all text-left",
          enabled
            ? "bg-cyan-500/10 border-cyan-500/30"
            : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]"
        )}
      >
        {/* Toggle pill */}
        <div className={cn(
          "relative w-10 h-5 rounded-full border shrink-0 mt-0.5 transition-colors",
          enabled ? "bg-cyan-500 border-cyan-500" : "bg-white/[0.08] border-white/[0.12]"
        )}>
          <span className={cn(
            "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
            enabled ? "left-5" : "left-0.5"
          )} />
        </div>
        <div>
          <p className="text-sm font-semibold">{enabled ? "有効" : "無効"}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
            {enabled
              ? "バックグラウンドワーカーがスコア低下を検出したら自動実行します。"
              : "手動で最適化ボタンを押した時のみ実行されます。後から変更可能です。"}
          </p>
        </div>
      </button>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-white transition-colors">
          <ChevronLeft size={14} /> 戻る
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-lg hover:brightness-110 disabled:opacity-50 transition-all active:scale-[0.97]"
        >
          {saving && <Loader2 size={11} className="animate-spin" />}
          次へ <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Policy Guide ─────────────────────────────────────────────────────

function StepPolicyGuide({ onNext, onBack }: WizardStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl">
          <Bot size={20} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold">ポリシーエンジン</h2>
          <p className="text-xs text-muted-foreground/60">ルールベースで PC を自動制御できます</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { trigger: "ゲーム起動時", action: "ブロートウェア自動終了 + 電力プラン切替", color: "emerald" },
          { trigger: "スコアが低下したとき", action: "プリセットを自動適用して回復", color: "amber" },
          { trigger: "毎日深夜 2 時 (cron)", action: "ストレージ軽量クリーン", color: "violet" },
          { trigger: "手動実行", action: "全最適化ワンクリック", color: "cyan" },
        ].map(({ trigger, action, color }) => (
          <div key={trigger} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border shrink-0",
              color === "emerald" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
              color === "amber"   && "bg-amber-500/10  border-amber-500/20  text-amber-400",
              color === "violet"  && "bg-violet-500/10 border-violet-500/20 text-violet-400",
              color === "cyan"    && "bg-cyan-500/10   border-cyan-500/20   text-cyan-400",
            )}>
              {trigger}
            </span>
            <ArrowRight size={11} className="text-muted-foreground/30 shrink-0" />
            <span className="text-xs text-muted-foreground/70">{action}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
        テンプレートライブラリから 1 クリックでインポートできます。
        サイドバーの「ポリシーエンジン」から管理できます。
      </p>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-white transition-colors">
          <ChevronLeft size={14} /> 戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-lg hover:brightness-110 transition-all active:scale-[0.97]"
        >
          次へ <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone({ onNext }: WizardStepProps) {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="p-5 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/30 rounded-3xl shadow-[0_0_40px_rgba(52,211,153,0.15)]">
        <CheckCircle2 size={40} className="text-emerald-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">セットアップ完了！</h2>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">
          Gaming PC Optimizer の準備ができました。
          まずはホーム画面でスコアを確認してみましょう。
        </p>
      </div>
      <div className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 text-left space-y-1.5">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-2">次のステップ</p>
        {[
          "ホームハブで現在の最適化スコアを確認",
          "「最適化」タブで GameMode を実行",
          "ポリシーエンジンでルールを設定",
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground/70">
            <span className="w-4 h-4 flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20 rounded-full text-[10px] text-cyan-400 font-bold shrink-0">
              {i + 1}
            </span>
            {s}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-xl hover:brightness-110 active:scale-[0.97] transition-all"
      >
        <Gamepad2 size={15} />
        始める
      </button>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ["ようこそ", "AI 設定", "自動最適化", "ポリシー", "完了"];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEP_LABELS.map((_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full transition-all",
            i === current
              ? "w-4 h-1.5 bg-cyan-400"
              : i < current
              ? "w-1.5 h-1.5 bg-emerald-400/60"
              : "w-1.5 h-1.5 bg-white/[0.12]"
          )}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FirstRunWizard() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(WIZARD_KEY)) {
      setVisible(true);
    }
  }, []);

  const handleDone = () => {
    localStorage.setItem(WIZARD_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  const next = () => setStep((s) => Math.min(s + 1, 4));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-[#05080c] border border-white/[0.12] rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
        {/* Top accent line */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" />

        {/* Body */}
        <div className="p-8">
          {step === 0 && <StepWelcome onNext={next} />}
          {step === 1 && <StepApiKey onNext={next} onBack={back} />}
          {step === 2 && <StepAutoOptimize onNext={next} onBack={back} />}
          {step === 3 && <StepPolicyGuide onNext={next} onBack={back} />}
          {step === 4 && <StepDone onNext={handleDone} />}
        </div>

        {/* Step indicator */}
        <div className="pb-5">
          <StepDots current={step} />
        </div>
      </div>
    </div>
  );
}
