import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings2, Sun, Moon, Trash2, Cpu, Bot, Eye, EyeOff, Check } from "lucide-react";
import { useAppStore, type Theme } from "@/stores/useAppStore";
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
  const {
    theme,
    setTheme,
    disabledProcesses,
    setDisabledProcesses,
    autoOptimize,
    setAutoOptimize,
  } = useAppStore();

  const [autoStart, setAutoStartLocal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);

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

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-secondary border border-border rounded-lg">
          <Settings2 className="text-muted-foreground" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">設定</h1>
          <p className="text-sm text-muted-foreground">テーマ・常駐・プロセスリストのカスタマイズ</p>
        </div>
      </div>

      {/* Resident / auto settings */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Cpu size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">常駐設定</span>
        </div>
        <div className="divide-y divide-border/50">
          {/* Auto-start */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">Windows 起動時に自動起動</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ログイン後にトレイアイコンで常駐します
              </p>
            </div>
            <Toggle checked={autoStart} onChange={() => handleAutoStart(!autoStart)} />
          </div>
          {/* Auto-optimize */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">自動最適化を有効にする</p>
              <p className="text-xs text-muted-foreground mt-0.5">
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
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          {theme === "dark" ? (
            <Moon size={16} className="text-muted-foreground" />
          ) : (
            <Sun size={16} className="text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">テーマ</span>
        </div>
        <div className="p-4 flex gap-3">
          {(["dark", "light"] as Theme[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-lg border transition-all
                ${theme === t
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
            >
              {t === "dark" ? <Moon size={20} /> : <Sun size={20} />}
              <span className="text-xs font-medium">{t === "dark" ? "ダーク" : "ライト"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI API Key */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Bot size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">AI プロファイル生成</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Anthropic API キーを登録すると、プロファイルページの「AI推薦を生成」ボタンでドラフトプロファイルの設定を自動補完できます。
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={apiKeyVisible ? "text" : "password"}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary/60 font-mono pr-10"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false); }}
              />
              <button
                type="button"
                onClick={() => setApiKeyVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={apiKeyVisible ? "非表示" : "表示"}
              >
                {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveApiKey}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                apiKeySaved
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {apiKeySaved ? <><Check size={14} /> 保存済み</> : "保存"}
            </button>
          </div>
        </div>
      </div>

      {/* Process List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-muted-foreground" />
            <span className="text-sm font-semibold">ブロートウェアリスト</span>
            <span className="text-xs text-muted-foreground">
              ({enabledCount} / {DEFAULT_PROCESSES.length} 有効)
            </span>
          </div>
          {disabledProcesses.length > 0 && (
            <button
              type="button"
              onClick={enableAll}
              className="text-xs text-primary hover:underline"
            >
              すべて有効化
            </button>
          )}
        </div>
        <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
          無効にしたプロセスはゲームモード最適化でスキップされます
        </p>
        <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {DEFAULT_PROCESSES.map((name) => (
            <div key={name} className="flex items-center justify-between px-4 py-2.5">
              <span
                className={`text-sm font-mono ${
                  isEnabled(name) ? "text-foreground" : "text-muted-foreground line-through"
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
