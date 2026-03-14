import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings2, Sun, Moon, Trash2, Cpu, Bot, Eye, EyeOff, Check, Copy, FlaskConical, BarChart3, Zap, Loader2, WifiOff, CheckCircle2, XCircle, Camera, FolderOpen } from "lucide-react";
import { RecommendationMetricsPanel } from "@/components/recommendation/RecommendationMetricsPanel";
import { HagsDisplayOptimizer } from "@/components/optimization/HagsDisplayOptimizer";

// HAGS / Display Hz / Defender 除外 (mirrors Rust ENABLE_HAGS_DISPLAY_OPTIMIZER)
const ENABLE_HAGS_DISPLAY_OPTIMIZER = false;
import { useAppStore, type Theme } from "@/stores/useAppStore";
import { useWatcherStore } from "@/stores/useWatcherStore";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/stores/useToastStore";

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
  const { theme, setTheme, disabledProcesses, setDisabledProcesses, setHasApiKey, setActivePage } = useAppStore();
  const { autoOptimize, setAutoOptimize } = useWatcherStore();

  const [autoStart, setAutoStartLocal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyRiskAcknowledged, setApiKeyRiskAcknowledged] = useState(false);
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
    invoke<string>("get_ai_api_key").then((k) => { setApiKey(k); if (k) setApiKeyRiskAcknowledged(true); }).catch(() => {});
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
      setHasApiKey(true);
    } catch (e) {
      setConnStatus({ state: "error", message: String(e) });
    }
  };


  const handleAutoStart = async (enabled: boolean) => {
    try {
      await invoke("set_auto_start", { enabled });
      setAutoStartLocal(enabled);
    } catch (e) {
      toast.error("自動起動の設定に失敗しました");
    }
  };

  const handleAutoOptimize = async (enabled: boolean) => {
    try {
      await invoke("set_auto_optimize", { enabled });
      setAutoOptimize(enabled);
    } catch (e) {
      toast.error("自動最適化の設定に失敗しました");
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

  // ── Screenshot tour ────────────────────────────────────────────────────────
  const TOUR_PAGES = [
    { id: "home" as const,        label: "ホーム" },
    { id: "optimize" as const,    label: "最適化" },
    { id: "process" as const,     label: "プロセス管理" },
    { id: "windows" as const,     label: "Windows設定" },
    { id: "storage" as const,     label: "ストレージ" },
    { id: "network" as const,     label: "ネットワーク" },
    { id: "games" as const,       label: "ゲーム管理" },
    { id: "profiles" as const,    label: "プロファイル" },
    { id: "gamelog" as const,     label: "ゲームログ" },
    { id: "hardware" as const,    label: "ハードウェア" },
    { id: "benchmark" as const,   label: "ベンチマーク" },
    { id: "startup" as const,     label: "スタートアップ" },
    { id: "scheduler" as const,   label: "スケジューラー" },
    { id: "uninstaller" as const, label: "アンインストーラー" },
    { id: "updates" as const,     label: "アップデート" },
    { id: "settings" as const,    label: "設定" },
  ];

  type TourState = "idle" | "running" | "done" | "error";
  const [tourState, setTourState] = useState<TourState>("idle");
  const [tourIndex, setTourIndex] = useState(-1);
  const [tourZipPath, setTourZipPath] = useState("");
  const [tourError, setTourError] = useState("");
  const tourAborted = useRef(false);

  const runTour = async () => {
    setTourState("running");
    setTourError("");
    setTourZipPath("");
    tourAborted.current = false;

    await invoke("clear_screenshots").catch(() => {});

    for (let i = 0; i < TOUR_PAGES.length; i++) {
      if (tourAborted.current) return;
      const page = TOUR_PAGES[i];
      setTourIndex(i);
      setActivePage(page.id);
      // Wait for the page to render
      await new Promise((r) => setTimeout(r, 900));
      if (tourAborted.current) return;
      try {
        const name = `${String(i + 1).padStart(2, "0")}_${page.id}`;
        await invoke("take_screenshot", { name });
      } catch (e) {
        setTourError(`${page.label}: ${String(e)}`);
        setTourState("error");
        return;
      }
    }

    // Return to settings page
    setActivePage("settings");
    setTourIndex(-1);

    try {
      const zipPath = await invoke<string>("zip_screenshots");
      setTourZipPath(zipPath);
      setTourState("done");
    } catch (e) {
      setTourError(String(e));
      setTourState("error");
    }
  };

  const stopTour = () => {
    tourAborted.current = true;
    setTourState("idle");
    setTourIndex(-1);
    setActivePage("settings");
  };

  // ── Process list helpers ───────────────────────────────────────────────────
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
    <div className="p-5 flex flex-col gap-5">
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
                  : "bg-white/5 border-white/[0.12] text-muted-foreground hover:text-foreground hover:border-white/20"
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
          {/* 接続ステータスバッジ */}
          {connStatus.state === "ok" && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <CheckCircle2 size={10} /> 接続済み · {connStatus.label}
            </span>
          )}
          {connStatus.state === "error" && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5">
              <XCircle size={10} /> 接続エラー
            </span>
          )}
          {connStatus.state === "none" && apiKey && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-400/70 bg-amber-500/5 border border-amber-500/10 rounded-full px-2 py-0.5">
              <WifiOff size={10} /> 未確認
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col gap-3">
          {/* Provider selector */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-muted-foreground/60">AIプロバイダー</p>
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
                    {p === "anthropic" ? "🟠" : "🟢"}
                  </span>
                  <span>{p === "anthropic" ? "Anthropic" : "OpenAI"}</span>
                </button>
              ))}
              <button
                type="button"
                disabled
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium bg-white/[0.02] border-white/[0.05] text-muted-foreground/30 cursor-not-allowed"
              >
                <span className="text-base leading-none">🔵</span>
                <span>Google</span>
                <span className="text-[10px] text-muted-foreground/25">coming soon</span>
              </button>
            </div>
          </div>

          {/* Key input */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-muted-foreground/60">API キー</p>
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
                  aria-label={apiKeyVisible ? "非表示" : "表示"}
                >
                  {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveAndValidate}
                disabled={connStatus.state === "checking" || !apiKey.trim() || !apiKeyRiskAcknowledged}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
                  connStatus.state === "ok"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : connStatus.state === "error"
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97]"
                }`}
              >
                {connStatus.state === "checking" ? (
                  <><Loader2 size={13} className="animate-spin" /> 確認中…</>
                ) : connStatus.state === "ok" ? (
                  <><Check size={13} /> 接続済み</>
                ) : connStatus.state === "error" ? (
                  <><XCircle size={13} /> 再試行</>
                ) : (
                  "保存・接続テスト"
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

          {/* Risk disclosure */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/5 border border-amber-500/15 rounded-lg">
            <span className="text-amber-400 text-xs shrink-0 mt-px">⚠</span>
            <p className="text-[10px] text-amber-300/70 leading-relaxed">
              APIキーはローカルの設定ファイルに平文で保存されます。他のユーザーと共有するPCでの使用は推奨しません。
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={apiKeyRiskAcknowledged}
              onChange={(e) => setApiKeyRiskAcknowledged(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-cyan-500"
            />
            <span className="text-[11px] text-muted-foreground/80">上記リスクを理解した上で保存します</span>
          </label>

          <p className="text-[10px] text-muted-foreground/55 leading-relaxed">
            キーを保存すると接続テストを実行します。成功するとプロファイルページの「AI推薦を生成」が使えるようになります。
          </p>
        </div>
      </div>

      {/* HAGS / Display Hz / Defender exclusions (ENABLE_HAGS_DISPLAY_OPTIMIZER) */}
      {ENABLE_HAGS_DISPLAY_OPTIMIZER && (
        <div className={sectionCls}>
          <div className={headerCls}>
            <Zap size={15} className="text-violet-400" />
            <span className="text-sm font-semibold">GPU スケジューリング・ディスプレイ・Defender</span>
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

      {/* Screenshot Tour */}
      <div className={sectionCls}>
        <div className={headerCls}>
          <Camera size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold">スクリーンショットツアー</span>
          <span className="ml-auto text-[10px] text-muted-foreground/50">{TOUR_PAGES.length} ページ</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/70">
            全ページを自動で巡回してスクリーンショットを撮影し、ZIPにまとめます。<br />
            撮影中はウィンドウを最大化・最前面に表示してください。
          </p>

          {/* Progress */}
          {tourState === "running" && tourIndex >= 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  撮影中: <span className="text-foreground font-medium">{TOUR_PAGES[tourIndex]?.label}</span>
                </span>
                <span className="text-muted-foreground">{tourIndex + 1} / {TOUR_PAGES.length}</span>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                  style={{ width: `${((tourIndex + 1) / TOUR_PAGES.length) * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {TOUR_PAGES.map((p, i) => (
                  <span
                    key={p.id}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      i < tourIndex
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                        : i === tourIndex
                        ? "bg-cyan-500/30 border-cyan-500/60 text-cyan-300 animate-pulse"
                        : "bg-white/[0.04] border-white/[0.10] text-muted-foreground/40"
                    }`}
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Done */}
          {tourState === "done" && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-xs font-medium text-emerald-300">撮影完了！</p>
                <p className="text-[11px] text-muted-foreground break-all">{tourZipPath}</p>
              </div>
              <button
                type="button"
                onClick={() => invoke("open_path", { path: tourZipPath }).catch(() => {})}
                className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                title="フォルダを開く"
              >
                <FolderOpen size={14} className="text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Error */}
          {tourState === "error" && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/25 rounded-lg">
              <XCircle size={15} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive break-all">{tourError}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            {tourState !== "running" ? (
              <button
                type="button"
                onClick={runTour}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500/20 transition-colors"
              >
                <Camera size={14} />
                {tourState === "done" ? "再撮影" : "撮影開始"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopTour}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-destructive/10 border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
              >
                <XCircle size={14} />
                中断
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Process List */}
      <div className={sectionCls}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 size={15} className="text-cyan-400" />
            <span className="text-sm font-semibold">ブロートウェアリスト</span>
            <span className="text-[10px] text-muted-foreground/60 bg-white/5 border border-white/[0.12] rounded-full px-2 py-0.5">
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
