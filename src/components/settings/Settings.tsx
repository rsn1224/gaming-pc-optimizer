import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings2, Sun, Moon, Trash2, Cpu, Bot, Eye, EyeOff, Check, Copy, FlaskConical, BarChart3 } from "lucide-react";
import { RecommendationMetricsPanel } from "@/components/recommendation/RecommendationMetricsPanel";
import { useAppStore, type Theme } from "@/stores/useAppStore";
import { useWatcherStore } from "@/stores/useWatcherStore";
import { Toggle } from "@/components/ui/toggle";

// Full default list (mirrors process.rs)
const DEFAULT_PROCESSES = [
  "OneDrive.exe", "Cortana.exe", "SearchUI.exe", "SearchApp.exe",
  "YourPhone.exe", "PhoneExperienceHost.exe", "GameBarPresenceWriter.exe",
  "SkypeApp.exe", "SkypeBackgroundHost.exe", "Teams.exe",
  "Spotify.exe", "SpotifyWebHelper.exe", "iTunesHelper.exe",
  "AdobeUpdateService.exe", "AdobeARM.exe", "CCXProcess.exe",
  "jusched.exe", "Dropbox.exe", "GoogleDriveSync.exe", "iCloudServices.exe",
  "Discord.exe", "Slack.exe", "Telegram.exe", "WhatsApp.exe",
  "MicrosoftEdgeUpdate.exe", "GoogleUpdate.exe",
  "HPTouchpointAnalyticsService.exe", "ETDCtrl.exe",
  "SynTPEnhService.exe", "TabTip.exe", "CalculatorApp.exe",
  "People.exe", "HxTsr.exe",
];

export function Settings() {
  const { theme, setTheme, disabledProcesses, setDisabledProcesses } = useAppStore();
  const { autoOptimize, setAutoOptimize } = useWatcherStore();

  const [autoStart, setAutoStartLocal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [selfImproveCopied, setSelfImproveCopied] = useState(false);
  const [selfImproveError, setSelfImproveError] = useState("");

  // Load initial values from Rust
  useEffect(() => {
    invoke<boolean>("get_auto_start").then(setAutoStartLocal).catch(() => {});
    invoke<boolean>("get_auto_optimize").then(setAutoOptimize).catch(() => {});
    invoke<string>("get_ai_api_key").then(setApiKey).catch(() => {});
  }, [setAutoOptimize]);

  const handleSaveApiKey = async () => {
    try {
      await invoke("set_ai_api_key", { key: apiKey });
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      alert("API キーの保存に失敗しました: " + e);
    }
  };

  const handleAutoStart = async (enabled: boolean) => {
    try {
      await invoke("set_auto_start", { enabled });
      setAutoStartLocal(enabled);
    } catch (e) {
      alert("自動起動の設定に失敗しました: " + e);
    }
  };

  const handleAutoOptimize = async (enabled: boolean) => {
    try {
      await invoke("set_auto_optimize", { enabled });
      setAutoOptimize(enabled);
    } catch (e) {
      alert("自動最適化の設定に失敗しました: " + e);
    }
  };

  const handleCopySelfImprove = async () => {
    setSelfImproveError("");
    try {
      const json = await invoke<string>("export_self_improve_context", { limit: 200 });
      await navigator.clipboard.writeText(json);
      setSelfImproveCopied(true);
      setTimeout(() => setSelfImproveCopied(false), 2000);
    } catch (e) {
      setSelfImproveError(String(e));
    }
  };

  const isEnabled = (name: string) => !disabledProcesses.includes(name);

  const toggleProcess = (name: string) => {
    if (disabledProcesses.includes(name)) {
      setDisabledProcesses(disabledProcesses.filter((n) => n !== name));
    } else {
      setDisabledProcesses([...disabledProcesses, name]);
    }
  };

  const enableAll = () => setDisabledProcesses([]);
  const enabledCount = DEFAULT_PROCESSES.length - disabledProcesses.length;

  const sectionCls = "bg-[#05080c] border border-white/[0.08] rounded-xl overflow-hidden";
  const headerCls = "px-4 py-3 border-b border-white/[0.06] flex items-center gap-2";

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
          <Settings2 className="text-cyan-400" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">設定</h1>
          <p className="text-xs text-muted-foreground mt-0.5">テーマ・常駐・プロセスリストのカスタマイズ</p>
        </div>
      </div>

      {/* Resident / auto settings */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Cpu size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">常駐設定</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {/* Auto-start */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Windows 起動時に自動起動</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                ログイン後にトレイアイコンで常駐します
              </p>
            </div>
            <Toggle checked={autoStart} onChange={() => handleAutoStart(!autoStart)} />
          </div>
          {/* Auto-optimize */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">自動最適化を有効にする</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                プロファイルの exe 起動を検知して自動適用・終了時に自動復元します
              </p>
            </div>
            <Toggle
              checked={autoOptimize}
              onChange={() => handleAutoOptimize(!autoOptimize)}
            />
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className={sectionCls}>
        <div className={headerCls}>
          {theme === "dark" ? (
            <Moon size={15} className="text-cyan-400" />
          ) : (
            <Sun size={15} className="text-cyan-400" />
          )}
          <span className="text-sm font-semibold">テーマ</span>
        </div>
        <div className="p-4 flex gap-3">
          {(["dark", "light"] as Theme[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border transition-all
                ${theme === t
                  ? "bg-cyan-500/10 border-cyan-500/35 text-cyan-300"
                  : "bg-white/5 border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
            >
              {t === "dark" ? <Moon size={20} /> : <Sun size={20} />}
              <span className="text-xs font-medium">{t === "dark" ? "ダーク" : "ライト"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI API Key */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Bot size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">AI プロファイル生成</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/70">
            Anthropic API キーを登録すると、プロファイルページの「AI推薦を生成」ボタンでドラフトプロファイルの設定を自動補完できます。
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={apiKeyVisible ? "text" : "password"}
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50 font-mono pr-10 transition-colors"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false); }}
              />
              <button
                type="button"
                onClick={() => setApiKeyVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={apiKeyVisible ? "非表示" : "表示"}
              >
                {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveApiKey}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                apiKeySaved
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97]"
              }`}
            >
              {apiKeySaved ? <><Check size={14} /> 保存済み</> : "保存"}
            </button>
          </div>
        </div>
      </div>

      {/* Recommendation Engine V2 Metrics */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <BarChart3 size={15} className="text-violet-400" />
          <span className="text-sm font-semibold">推奨エンジン V2 メトリクス</span>
        </div>
        <div className="p-4">
          <RecommendationMetricsPanel />
        </div>
      </div>

      {/* Self-improve */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <FlaskConical size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">自己改善ログ（開発者向け）</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/70">
            アプリの操作ログ（直近200件）をJSON形式でコピーします。Claude に貼り付けると、あなたの使い方のパターンを分析して改善提案を生成できます。
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySelfImprove}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                selfImproveCopied
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-white/5 border-white/[0.10] text-muted-foreground hover:text-foreground hover:border-white/20 hover:bg-white/10"
              }`}
            >
              {selfImproveCopied ? <><Check size={14} /> コピー済み</> : <><Copy size={14} /> 自己改善コンテキストをコピー</>}
            </button>
          </div>
          {selfImproveError && (
            <p className="text-xs text-red-400">{selfImproveError}</p>
          )}
        </div>
      </div>

      {/* Process List */}
      <div className={sectionCls}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 size={15} className="text-cyan-400" />
            <span className="text-sm font-semibold">ブロートウェアリスト</span>
            <span className="text-[10px] text-muted-foreground/60 bg-white/5 border border-white/[0.08] rounded-full px-2 py-0.5">
              {enabledCount} / {DEFAULT_PROCESSES.length} 有効
            </span>
          </div>
          {disabledProcesses.length > 0 && (
            <button
              type="button"
              onClick={enableAll}
              className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
            >
              すべて有効化
            </button>
          )}
        </div>
        <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground/60">
          無効にしたプロセスはゲームモード最適化でスキップされます
        </p>
        <div className="divide-y divide-white/[0.04] max-h-96 overflow-y-auto">
          {DEFAULT_PROCESSES.map((name) => (
            <div key={name} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
              <span
                className={`text-sm font-mono ${
                  isEnabled(name) ? "text-foreground" : "text-muted-foreground/40 line-through"
                }`}
              >
                {name}
              </span>
              <Toggle checked={isEnabled(name)} onChange={() => toggleProcess(name)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
