/**
 * AboutPage — アプリ情報 + Sprint 履歴 (S7-03)
 */
import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { Gamepad2, ShieldCheck, Bot, GitGraph, Zap, Flame, Library, CheckCircle2 } from "lucide-react";

const APP_NAME = "Gaming PC Optimizer";

interface SprintEntry {
  sprint: string;
  title: string;
  icon: React.ReactNode;
  features: string[];
}

const SPRINT_HISTORY: SprintEntry[] = [
  {
    sprint: "Sprint 1",
    title: "Safety Kernel 基盤",
    icon: <ShieldCheck size={14} className="text-cyan-400" />,
    features: [
      "Safety Kernel — precheck → apply → verify 4フェーズ",
      "Audit Log (AuditActor 対応、500件ローリング)",
      "Telemetry SQLite (T0/T1-30s/T2-5min)",
    ],
  },
  {
    sprint: "Sprint 2",
    title: "Optimization Graph DAG",
    icon: <GitGraph size={14} className="text-violet-400" />,
    features: [
      "OptimizationGraph DAG — Kahn トポロジカルソート",
      "SafeApplyButton / PreCheckPanel UI",
      "Policy Engine 構造体 (PolicyTrigger / PolicyAction)",
    ],
  },
  {
    sprint: "Sprint 3",
    title: "UI 完全化 & AI V2",
    icon: <Bot size={14} className="text-violet-400" />,
    features: [
      "PolicyManager CRUD UI",
      "TelemetryViewer — T0/T1/T2 スコアバー",
      "AuditLogTab — actor フィルター",
      "AI ImpactLevel (low/medium/high/critical) 統合",
    ],
  },
  {
    sprint: "Sprint 4",
    title: "ポリシー実行 & 連携",
    icon: <Zap size={14} className="text-amber-400" />,
    features: [
      "watcher dispatch_policy_action — 実コマンド呼び出し",
      "ENABLE_POLICY_ENGINE=true",
      "GameMode プレチェックゲート (PreCheckPanel モーダル)",
      "ApplyPlan 適用順プレビュー",
      "HomeHub ポリシーウィジェット",
      "RollbackCenter セッション × 監査ログ連携",
    ],
  },
  {
    sprint: "Sprint 5",
    title: "OnSchedule + グラフ可視化",
    icon: <GitGraph size={14} className="text-violet-400" />,
    features: [
      "cron / chrono クレートで OnSchedule トリガー実装",
      "OptimizationGraphView — SVG エッジ DAG ビジュアライザー",
      "カテゴリ別カラムレイアウト + 矢印マーカー",
    ],
  },
  {
    sprint: "Sprint 6",
    title: "監視 & 自動応答",
    icon: <Flame size={14} className="text-red-400" />,
    features: [
      "ENABLE_SCORE_REGRESSION_WATCH — スコア急落検出 + 通知",
      "HomeHub スコアスパークライン",
      "ENABLE_THERMAL_AUTO_REDUCTION — GPU 温度超過で電力制限自動削減",
      "HomeHub GPU ウィジェット熱スロットル表示",
    ],
  },
  {
    sprint: "Sprint 7",
    title: "テンプレート & リリース準備",
    icon: <Library size={14} className="text-emerald-400" />,
    features: [
      "ポリシーテンプレートライブラリ (6件プリセット)",
      "バージョン v1.1.0 リリース",
      "About ページ + Sprint 履歴",
      "初回起動ウィザード (APIキー + ポリシーガイド)",
    ],
  },
];

export function AboutPage() {
  const [version, setVersion] = useState("1.1.0");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Hero */}
      <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 border border-cyan-500/20 rounded-2xl">
        <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-2xl shadow-[0_0_20px_rgba(34,211,238,0.1)]">
          <Gamepad2 size={28} className="text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{APP_NAME}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
              v{version}
            </span>
            <span className="text-[11px] text-muted-foreground/50">
              Tauri 2.0 + React 19 + Rust
            </span>
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-md">
            Windows ゲーミング PC のパフォーマンスを自動最適化する
            セーフ・セミオートノマス最適化プラットフォーム。
          </p>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "最適化ノード",   value: "7",    sub: "DAG グラフ管理" },
          { label: "ポリシートリガー", value: "4",    sub: "cron / game / score / manual" },
          { label: "監査ログ上限",   value: "500件", sub: "ローリングウィンドウ" },
          { label: "テレメトリ",     value: "T0→T2", sub: "30s / 5min 計測" },
          { label: "スプリント完了", value: "7",    sub: "v1.1.0 まで" },
          { label: "ビルド形式",     value: "MSI / NSIS", sub: "Windows x64" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
            <p className="text-[10px] text-muted-foreground/55">{sub}</p>
          </div>
        ))}
      </div>

      {/* Sprint history */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider px-1">
          Sprint 履歴
        </h2>
        {SPRINT_HISTORY.map((entry) => (
          <div
            key={entry.sprint}
            className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
              {entry.icon}
              <span className="text-xs font-semibold text-foreground">{entry.sprint}</span>
              <span className="text-xs text-muted-foreground/60">{entry.title}</span>
              <CheckCircle2 size={11} className="ml-auto text-emerald-400/60" />
            </div>
            <ul className="px-4 py-2.5 space-y-1">
              {entry.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground/60">
                  <span className="text-muted-foreground/30 mt-0.5 shrink-0">·</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Tech stack */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-3">技術スタック</p>
        <div className="flex flex-wrap gap-2">
          {[
            "Tauri 2.0", "Rust", "React 19", "TypeScript 5", "Vite 6",
            "Tailwind CSS 3", "Zustand 5", "Framer Motion",
            "rusqlite", "cron", "chrono", "sysinfo", "winreg",
          ].map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-white/[0.05] border border-white/[0.12] rounded-full text-muted-foreground/70">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
