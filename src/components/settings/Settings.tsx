import { Settings2, Sun, Moon, Trash2 } from "lucide-react";
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
  const { theme, setTheme, disabledProcesses, setDisabledProcesses } = useAppStore();

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
          <p className="text-sm text-muted-foreground">テーマ・プロセスリストのカスタマイズ</p>
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
              <span className={`text-sm font-mono ${isEnabled(name) ? "text-foreground" : "text-muted-foreground line-through"}`}>
                {name}
              </span>
              <Toggle
                checked={isEnabled(name)}
                onChange={() => toggleProcess(name)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
