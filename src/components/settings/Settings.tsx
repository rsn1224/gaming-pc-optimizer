import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings2, Sun, Moon, Trash2, Cpu, Bot, Eye, EyeOff, Check, Copy, FlaskConical, BarChart3, Zap, Loader2, WifiOff, CheckCircle2, XCircle } from "lucide-react";
import { RecommendationMetricsPanel } from "@/components/recommendation/RecommendationMetricsPanel";
import { HagsDisplayOptimizer } from "@/components/optimization/HagsDisplayOptimizer";

// HAGS / Display Hz / Defender 髯､螟・(mirrors Rust ENABLE_HAGS_DISPLAY_OPTIMIZER)
const ENABLE_HAGS_DISPLAY_OPTIMIZER = false;
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
  const [apiProvider, setApiProvider] = useState<"anthropic" | "openai">("anthropic");
  const [selfImproveCopied, setSelfImproveCopied] = useState(false);
  const [selfImproveError, setSelfImproveError] = useState("");

  type ConnStatus =
    | { state: "none" }
    | { state: "checking" }
    | { state: "ok"; label: string }
    | { state: "error"; message: string };
  const [connStatus, setConnStatus] = useState<ConnStatus>({ state: "none" });

  // Load initial values from Rust
  useEffect(() => {
    invoke<boolean>("get_auto_start").then(setAutoStartLocal).catch(() => {});
    invoke<boolean>("get_auto_optimize").then(setAutoOptimize).catch(() => {});
    invoke<string>("get_ai_api_key").then(setApiKey).catch(() => {});
    invoke<string>("get_ai_provider")
      .then((p) => setApiProvider(p === "openai" ? "openai" : "anthropic"))
      .catch(() => {});
  }, [setAutoOptimize]);

  const handleSaveAndValidate = async () => {
    setConnStatus({ state: "checking" });
    try {
      await invoke("set_ai_provider", { provider: apiProvider });
      await invoke("set_ai_api_key", { key: apiKey });
      const label = await invoke<string>("validate_ai_api_key", {
        provider: apiProvider,
        key: apiKey,
      });
      setConnStatus({ state: "ok", label });
    } catch (e) {
      setConnStatus({ state: "error", message: String(e) });
    }
  };


  const handleAutoStart = async (enabled: boolean) => {
    try {
      await invoke("set_auto_start", { enabled });
      setAutoStartLocal(enabled);
    } catch (e) {
      alert("閾ｪ蜍戊ｵｷ蜍輔・險ｭ螳壹↓螟ｱ謨励＠縺ｾ縺励◆: " + e);
    }
  };

  const handleAutoOptimize = async (enabled: boolean) => {
    try {
      await invoke("set_auto_optimize", { enabled });
      setAutoOptimize(enabled);
    } catch (e) {
      alert("閾ｪ蜍墓怙驕ｩ蛹悶・險ｭ螳壹↓螟ｱ謨励＠縺ｾ縺励◆: " + e);
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

  const sectionCls = "bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden";
  const headerCls = "px-4 py-3 border-b border-white/[0.06] flex items-center gap-2";

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
          <Settings2 className="text-cyan-400" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">險ｭ螳・/h1>
          <p className="text-xs text-muted-foreground mt-0.5">繝・・繝槭・蟶ｸ鬧舌・繝励Ο繧ｻ繧ｹ繝ｪ繧ｹ繝医・繧ｫ繧ｹ繧ｿ繝槭う繧ｺ</p>
        </div>
      </div>

      {/* Resident / auto settings */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Cpu size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">蟶ｸ鬧占ｨｭ螳・/span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {/* Auto-start */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Windows 襍ｷ蜍墓凾縺ｫ閾ｪ蜍戊ｵｷ蜍・/p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                繝ｭ繧ｰ繧､繝ｳ蠕後↓繝医Ξ繧､繧｢繧､繧ｳ繝ｳ縺ｧ蟶ｸ鬧舌＠縺ｾ縺・
              </p>
            </div>
            <Toggle checked={autoStart} onChange={() => handleAutoStart(!autoStart)} />
          </div>
          {/* Auto-optimize */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">閾ｪ蜍墓怙驕ｩ蛹悶ｒ譛牙柑縺ｫ縺吶ｋ</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                繝励Ο繝輔ぃ繧､繝ｫ縺ｮ exe 襍ｷ蜍輔ｒ讀懃衍縺励※閾ｪ蜍暮←逕ｨ繝ｻ邨ゆｺ・凾縺ｫ閾ｪ蜍募ｾｩ蜈・＠縺ｾ縺・
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
          <span className="text-sm font-semibold">繝・・繝・/span>
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
                  : "bg-white/5 border-white/[0.12] text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
            >
              {t === "dark" ? <Moon size={20} /> : <Sun size={20} />}
              <span className="text-xs font-medium">{t === "dark" ? "繝繝ｼ繧ｯ" : "繝ｩ繧､繝・}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI API Key */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Bot size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">AI 繝励Ο繝輔ぃ繧､繝ｫ逕滓・</span>
          {/* 謗･邯壹せ繝・・繧ｿ繧ｹ繝舌ャ繧ｸ */}
          {connStatus.state === "ok" && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <CheckCircle2 size={10} /> 謗･邯壽ｸ医∩ ﾂｷ {connStatus.label}
            </span>
          )}
          {connStatus.state === "error" && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5">
              <XCircle size={10} /> 謗･邯壹お繝ｩ繝ｼ
            </span>
          )}
          {connStatus.state === "none" && apiKey && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-400/70 bg-amber-500/5 border border-amber-500/10 rounded-full px-2 py-0.5">
              <WifiOff size={10} /> 譛ｪ遒ｺ隱・
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col gap-3">
          {/* Provider selector */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-muted-foreground/60">AI繝励Ο繝舌う繝繝ｼ</p>
            <div className="flex gap-2">
              {(["anthropic", "openai"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setApiProvider(p); setConnStatus({ state: "none" }); }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    apiProvider === p
                      ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                      : "bg-white/[0.03] border-white/[0.12] text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  <span className="text-base leading-none">
                    {p === "anthropic" ? "泛" : "泙"}
                  </span>
                  <span>{p === "anthropic" ? "Anthropic" : "OpenAI"}</span>
                </button>
              ))}
              <button
                type="button"
                disabled
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium bg-white/[0.02] border-white/[0.05] text-muted-foreground/30 cursor-not-allowed"
              >
                <span className="text-base leading-none">鳩</span>
                <span>Google</span>
                <span className="text-[10px] text-muted-foreground/25">coming soon</span>
              </button>
            </div>
          </div>

          {/* Key input */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-muted-foreground/60">API 繧ｭ繝ｼ</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={apiKeyVisible ? "text" : "password"}
                  className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50 font-mono pr-10 transition-colors"
                  placeholder={apiProvider === "openai" ? "sk-..." : "sk-ant-..."}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setConnStatus({ state: "none" }); }}
                />
                <button
                  type="button"
                  onClick={() => setApiKeyVisible((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={apiKeyVisible ? "髱櫁｡ｨ遉ｺ" : "陦ｨ遉ｺ"}
                >
                  {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveAndValidate}
                disabled={connStatus.state === "checking" || !apiKey.trim()}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
                  connStatus.state === "ok"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : connStatus.state === "error"
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97]"
                }`}
              >
                {connStatus.state === "checking" ? (
                  <><Loader2 size={13} className="animate-spin" /> 遒ｺ隱堺ｸｭ窶ｦ</>
                ) : connStatus.state === "ok" ? (
                  <><Check size={13} /> 謗･邯壽ｸ医∩</>
                ) : connStatus.state === "error" ? (
                  <><XCircle size={13} /> 蜀崎ｩｦ陦・/>
                ) : (
                  "菫晏ｭ倥・謗･邯壹ユ繧ｹ繝・
                )}
              </button>
            </div>
          </div>

          {/* Error detail */}
          {connStatus.state === "error" && (
            <p className="text-[11px] text-rose-400/80 bg-rose-500/5 border border-rose-500/10 rounded-lg px-3 py-2">
              {connStatus.message}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/55 leading-relaxed">
            繧ｭ繝ｼ繧剃ｿ晏ｭ倥☆繧九→謗･邯壹ユ繧ｹ繝医ｒ螳溯｡後＠縺ｾ縺吶よ・蜉溘☆繧九→繝励Ο繝輔ぃ繧､繝ｫ繝壹・繧ｸ縺ｮ縲窟I謗ｨ阮ｦ繧堤函謌舌阪′菴ｿ縺医ｋ繧医≧縺ｫ縺ｪ繧翫∪縺吶・
          </p>
        </div>
      </div>

      {/* HAGS / Display Hz / Defender exclusions (ENABLE_HAGS_DISPLAY_OPTIMIZER) */}
      {ENABLE_HAGS_DISPLAY_OPTIMIZER && (
        <div className={sectionCls}>
          <div className={headerCls}>
            <Zap size={15} className="text-violet-400" />
            <span className="text-sm font-semibold">GPU 繧ｹ繧ｱ繧ｸ繝･繝ｼ繝ｪ繝ｳ繧ｰ繝ｻ繝・ぅ繧ｹ繝励Ξ繧､繝ｻDefender</span>
          </div>
          <div className="p-4">
            <HagsDisplayOptimizer />
          </div>
        </div>
      )}

      {/* Recommendation Engine V2 Metrics */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <BarChart3 size={15} className="text-violet-400" />
          <span className="text-sm font-semibold">謗ｨ螂ｨ繧ｨ繝ｳ繧ｸ繝ｳ V2 繝｡繝医Μ繧ｯ繧ｹ</span>
        </div>
        <div className="p-4">
          <RecommendationMetricsPanel />
        </div>
      </div>

      {/* Self-improve */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <FlaskConical size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">閾ｪ蟾ｱ謾ｹ蝟・Ο繧ｰ・磯幕逋ｺ閠・髄縺托ｼ・/span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/70">
            繧｢繝励Μ縺ｮ謫堺ｽ懊Ο繧ｰ・育峩霑・00莉ｶ・峨ｒJSON蠖｢蠑上〒繧ｳ繝斐・縺励∪縺吶・laude 縺ｫ雋ｼ繧贋ｻ倥￠繧九→縲√≠縺ｪ縺溘・菴ｿ縺・婿縺ｮ繝代ち繝ｼ繝ｳ繧貞・譫舌＠縺ｦ謾ｹ蝟・署譯医ｒ逕滓・縺ｧ縺阪∪縺吶・
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
              {selfImproveCopied ? <><Check size={14} /> 繧ｳ繝斐・貂医∩</> : <><Copy size={14} /> 閾ｪ蟾ｱ謾ｹ蝟・さ繝ｳ繝・く繧ｹ繝医ｒ繧ｳ繝斐・</>}
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
            <span className="text-sm font-semibold">繝悶Ο繝ｼ繝医え繧ｧ繧｢繝ｪ繧ｹ繝・/span>
            <span className="text-[10px] text-muted-foreground/60 bg-white/5 border border-white/[0.12] rounded-full px-2 py-0.5">
              {enabledCount} / {DEFAULT_PROCESSES.length} 譛牙柑
            </span>
          </div>
          {disabledProcesses.length > 0 && (
            <button
              type="button"
              onClick={enableAll}
              className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
            >
              縺吶∋縺ｦ譛牙柑蛹・
            </button>
          )}
        </div>
        <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground/60">
          辟｡蜉ｹ縺ｫ縺励◆繝励Ο繧ｻ繧ｹ縺ｯ繧ｲ繝ｼ繝繝｢繝ｼ繝画怙驕ｩ蛹悶〒繧ｹ繧ｭ繝・・縺輔ｌ縺ｾ縺・
        </p>
        <div className="divide-y divide-white/[0.04] max-h-96 overflow-y-auto">
          {DEFAULT_PROCESSES.map((name) => (
            <div key={name} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
              <span
                className={`text-sm font-mono ${
                  isEnabled(name) ? "text-foreground" : "text-muted-foreground/55 line-through"
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
