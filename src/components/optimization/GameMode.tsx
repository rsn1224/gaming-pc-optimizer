import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Gamepad2, Zap, Trash2, RefreshCw, CheckCircle2, XCircle,
  Loader2, RotateCcw, ShieldCheck, AlertTriangle, ShieldOff,
  Bot, Sparkles, ChevronRight, Swords, Radio, Volume2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/useAppStore";
import { ProgressBar } from "@/components/ui/progress-bar";
import { toast } from "@/stores/useToastStore";
import type {
  ProcessInfo, KillResult, AnnotatedProcess, ProcessRiskLevel,
  SystemInfo, SessionMetrics, OptimizationScore, PreCheckResult,
  ApplyPlan, PresetInfo, PresetResult,
  RecommendationInput, RecommendationResult,
} from "@/types";
import { formatMemory, cn } from "@/lib/utils";
import { findAnnotation } from "@/data/process_knowledge";
import { BeforeAfterCard } from "@/components/ui/BeforeAfterCard";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";
import { PreCheckPanel } from "@/components/ui/PreCheckPanel";
import { ENABLE_SAFETY_KERNEL_UI, ENABLE_OPTIMIZE_RESULT_CARD, ENABLE_VERIFY_BANNER } from "@/config/features";

const GAME_MODE_NODES = ["kill_bloatware", "ultimate_power", "gaming_windows", "network_gaming"];

const NODE_DISPLAY: Record<string, string> = {
  kill_bloatware: "不要プロセス停止",
  ultimate_power: "電源プラン",
  gaming_windows: "Windows最適化",
  network_gaming: "ネットワーク",
  dns_gaming: "DNS最適化",
  registry_gaming: "レジストリ",
  storage_light: "ストレージ",
};

type StepStatus = "idle" | "running" | "success" | "error";

interface OptimizationStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  result?: string;
}

// ── Risk badge ────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<
  ProcessRiskLevel,
  { label: string; icon: React.ReactNode; cls: string; dotCls: string }
> = {
  safe_to_kill: {
    label: "停止OK",
    icon: <ShieldCheck size={10} />,
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dotCls: "bg-emerald-400 shadow-[0_0_5px_rgba(34,197,94,0.6)]",
  },
  caution: {
    label: "注意",
    icon: <AlertTriangle size={10} />,
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dotCls: "bg-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.5)]",
  },
  keep: {
    label: "維持推奨",
    icon: <ShieldOff size={10} />,
    cls: "bg-white/5 text-muted-foreground border-white/10",
    dotCls: "bg-muted-foreground/55",
  },
};

function RiskBadge({ level }: { level: ProcessRiskLevel }) {
  const cfg = RISK_CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 shrink-0 ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Process icon ──────────────────────────────────────────────────────────────

const PROC_ICON_COLORS = [
  "bg-cyan-500/20 text-cyan-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-violet-500/20 text-violet-400",
  "bg-amber-500/20 text-amber-400",
  "bg-blue-500/20 text-blue-400",
  "bg-rose-500/20 text-rose-400",
  "bg-orange-500/20 text-orange-400",
  "bg-teal-500/20 text-teal-400",
] as const;

function procIconColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROC_ICON_COLORS[Math.abs(hash) % PROC_ICON_COLORS.length];
}

const exeIconCache = new Map<string, string | null>();

function ProcessRow({ proc }: { proc: AnnotatedProcess }) {
  const ann = proc.annotation;
  const dotCls = ann ? RISK_CONFIG[ann.risk_level].dotCls : "bg-destructive/60";
  const letter = (proc.name[0] ?? "?").toUpperCase();

  const [icon, setIcon] = useState<string | null>(
    proc.exe_path ? (exeIconCache.get(proc.exe_path) ?? undefined) ?? null : null
  );

  useEffect(() => {
    if (!proc.exe_path) return;
    if (exeIconCache.has(proc.exe_path)) {
      setIcon(exeIconCache.get(proc.exe_path) ?? null);
      return;
    }
    invoke<string>("get_exe_icon_base64", { exePath: proc.exe_path })
      .then((b64) => { exeIconCache.set(proc.exe_path, b64); setIcon(b64); })
      .catch(() => { exeIconCache.set(proc.exe_path, null); });
  }, [proc.exe_path]);

  return (
    <motion.div
      key={proc.pid}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex flex-col px-3 py-2.5 gap-1 hover:bg-white/[0.025] transition-colors border-b border-white/[0.04] last:border-0"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon ? (
            <img src={`data:image/png;base64,${icon}`} alt="" aria-hidden className="w-6 h-6 rounded-lg shrink-0 object-contain" />
          ) : (
            <span className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold ${procIconColor(proc.name)}`}>
              {letter}
            </span>
          )}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
          <span className="text-sm font-medium truncate">{ann ? ann.display_name : proc.name}</span>
          <span className="text-[10px] text-muted-foreground/55 shrink-0 font-mono">PID {proc.pid}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground/60 tabular-nums">{formatMemory(proc.memory_mb)}</span>
          <span className="text-xs text-amber-400/80 tabular-nums w-10 text-right">{proc.cpu_percent.toFixed(1)}%</span>
          {ann && <RiskBadge level={ann.risk_level} />}
        </div>
      </div>
      {ann && (
        <div className="pl-3.5 flex flex-col gap-0.5">
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{ann.description}</p>
          <p className="text-[11px] text-muted-foreground/55">
            <span className="font-medium text-muted-foreground/60">推奨: </span>{ann.recommended_action}
          </p>
        </div>
      )}
    </motion.div>
  );
}

function ProcessSummary({ procs }: { procs: AnnotatedProcess[] }) {
  const safe = procs.filter((p) => p.annotation?.risk_level === "safe_to_kill").length;
  const caution = procs.filter((p) => p.annotation?.risk_level === "caution").length;
  const unknown = procs.filter((p) => !p.annotation).length;
  return (
    <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.05] flex items-center gap-4 flex-wrap">
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">AI推奨</span>
      {safe > 0 && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><ShieldCheck size={11} />停止OK {safe}件</span>}
      {caution > 0 && <span className="flex items-center gap-1.5 text-xs text-amber-400"><AlertTriangle size={11} />注意 {caution}件</span>}
      {unknown > 0 && <span className="text-xs text-muted-foreground/55">未分類 {unknown}件</span>}
    </div>
  );
}

// ── AI Advisor Card ───────────────────────────────────────────────────────────

interface AiAdvisorProps {
  score: number | null;
  procs: AnnotatedProcess[];
  hasApiKey: boolean;
  sysInfo: SystemInfo | null;
}

function buildRuleBasedMessage(score: number | null, procs: AnnotatedProcess[]): string {
  const killable = procs.filter((p) => p.annotation?.risk_level === "safe_to_kill");
  const totalMb = killable.reduce((acc, p) => acc + p.memory_mb, 0);
  const topProcs = killable.slice(0, 3).map((p) => p.annotation?.display_name ?? p.name).join("、");

  if (score === null) return "システム状態を分析しています...";

  if (score >= 85) return "✓ システムは最適化されています。現在の設定を維持してください。";

  if (killable.length === 0 && score >= 70) {
    return `スコア ${Math.round(score)} — 良好な状態です。ネットワーク・電源プランをさらに最適化できます。`;
  }

  if (killable.length > 0) {
    const mbText = totalMb >= 1024 ? `${(totalMb / 1024).toFixed(1)} GB` : `${Math.round(totalMb)} MB`;
    return `${topProcs ? `${topProcs} などの ` : ""}${killable.length} 件のプロセスが ${mbText} を消費しています。Esports プリセットで解放すると FPS 改善が見込めます。`;
  }

  return `スコア ${Math.round(score)} — 最適化の余地があります。プリセットを適用することをお勧めします。`;
}

function AiAdvisorCard({ score, procs, hasApiKey, sysInfo }: AiAdvisorProps) {
  const [aiResult, setAiResult] = useState<RecommendationResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runDeepAnalysis = async () => {
    if (!sysInfo || !hasApiKey) return;
    setAnalyzing(true);
    try {
      const input: RecommendationInput = {
        intent: "fps",
        system: {
          osVersion: sysInfo.os_version,
          cpu: sysInfo.cpu_name,
          memoryGb: sysInfo.memory_total_mb / 1024,
        },
      };
      const result = await invoke<RecommendationResult>("generate_recommendation", { input });
      setAiResult(result);
      setExpanded(true);
    } catch (e) {
      toast.error(`AI分析に失敗しました: ${e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const ruleMessage = buildRuleBasedMessage(score, procs);
  const isGood = score !== null && score >= 85;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      isGood ? "bg-emerald-500/[0.04] border-emerald-500/20" : "bg-cyan-500/[0.04] border-cyan-500/20"
    )}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={cn(
          "p-1.5 rounded-lg border shrink-0 mt-0.5",
          isGood ? "bg-emerald-500/10 border-emerald-500/20" : "bg-cyan-500/10 border-cyan-500/20"
        )}>
          <Bot size={13} className={isGood ? "text-emerald-400" : "text-cyan-400"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">AI アドバイザー</span>
            {aiResult && (
              <span className="text-[10px] text-muted-foreground/40">
                {aiResult.fallbackUsed ? "ローカル分析" : `モデル: ${aiResult.model}`}
              </span>
            )}
          </div>
          <p className="text-sm text-white/80 leading-relaxed">
            {aiResult ? aiResult.summary : ruleMessage}
          </p>

          {/* Deep AI analysis results */}
          {expanded && aiResult && aiResult.items.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              {aiResult.items.slice(0, 3).map((item) => (
                <div key={item.id} className="flex items-start gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
                  <Sparkles size={11} className="text-cyan-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{item.reason}</p>
                    {(item.expectedImpact.fps || item.expectedImpact.latencyMs) && (
                      <p className="text-[10px] text-cyan-400 mt-0.5">
                        {item.expectedImpact.fps && `FPS +${item.expectedImpact.fps}`}
                        {item.expectedImpact.latencyMs && ` / レイテンシ -${item.expectedImpact.latencyMs}ms`}
                      </p>
                    )}
                  </div>
                  <span className={cn(
                    "shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                    item.riskLevel === "safe" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                    item.riskLevel === "caution" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                    "text-red-400 border-red-500/30 bg-red-500/10"
                  )}>
                    {item.riskLevel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deep analysis button */}
        {hasApiKey && !aiResult && (
          <button
            type="button"
            onClick={runDeepAnalysis}
            disabled={analyzing || !sysInfo}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {analyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {analyzing ? "分析中..." : "詳細分析"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Quick Preset Strip ────────────────────────────────────────────────────────

const PRESET_ICONS: Record<string, React.ReactNode> = {
  esports:   <Swords size={16} />,
  streaming: <Radio size={16} />,
  quiet:     <Volume2 size={16} />,
};

const PRESET_COLORS: Record<string, { active: string; border: string; text: string }> = {
  esports:   { active: "bg-cyan-500/15",    border: "border-cyan-500/40",    text: "text-cyan-300" },
  streaming: { active: "bg-violet-500/15",  border: "border-violet-500/40",  text: "text-violet-300" },
  quiet:     { active: "bg-slate-500/15",   border: "border-slate-500/40",   text: "text-slate-300" },
};

interface QuickPresetStripProps {
  presets: PresetInfo[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function QuickPresetStrip({ presets, selectedId, onSelect }: QuickPresetStripProps) {
  if (presets.length === 0) return null;

  return (
    <div className="flex gap-2">
      {presets.map((p) => {
        const isSelected = selectedId === p.id;
        const colors = PRESET_COLORS[p.id] ?? { active: "bg-white/10", border: "border-white/20", text: "text-white" };
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(isSelected ? null : p.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border text-center transition-all",
              isSelected
                ? `${colors.active} ${colors.border} ${colors.text}`
                : "bg-white/[0.02] border-white/[0.08] text-muted-foreground hover:bg-white/[0.05] hover:text-white"
            )}
          >
            <span className={isSelected ? colors.text : "text-muted-foreground/60"}>
              {PRESET_ICONS[p.id] ?? <Zap size={16} />}
            </span>
            <div>
              <p className="text-xs font-semibold leading-none">{p.name}</p>
              <p className="text-[10px] mt-0.5 text-muted-foreground/50 line-clamp-1">{p.description}</p>
            </div>
            {isSelected && (
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">選択中</span>
            )}
          </button>
        );
      })}
      {/* Custom option */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all",
          selectedId === null
            ? "bg-white/[0.07] border-white/20 text-white"
            : "bg-white/[0.02] border-white/[0.08] text-muted-foreground hover:bg-white/[0.05]"
        )}
      >
        <Zap size={16} className={selectedId === null ? "text-white" : "text-muted-foreground/60"} />
        <div>
          <p className="text-xs font-semibold">カスタム</p>
          <p className="text-[10px] mt-0.5 text-muted-foreground/50">全ステップ実行</p>
        </div>
        {selectedId === null && <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">選択中</span>}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GameMode() {
  const {
    bloatwareProcesses, setBloatwareProcesses, setGameModeActive,
    setFreedMemoryMb, gameModeActive, disabledProcesses, hasApiKey,
  } = useAppStore();

  const [annotatedProcs, setAnnotatedProcs] = useState<AnnotatedProcess[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [metricsBefore, setMetricsBefore] = useState<SessionMetrics | null>(null);
  const [metricsAfter, setMetricsAfter] = useState<SessionMetrics | null>(null);
  const [scoreBefore, setScoreBefore] = useState<number | null>(null);
  const [scoreAfter, setScoreAfter] = useState<number | null>(null);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  // Safety kernel
  const [isChecking, setIsChecking] = useState(false);
  const [preCheckResult, setPreCheckResult] = useState<PreCheckResult | null>(null);
  const [showPreCheckModal, setShowPreCheckModal] = useState(false);
  const [failedStepCount, setFailedStepCount] = useState(0);
  const [applyPlan, setApplyPlan] = useState<ApplyPlan | null>(null);
  // Presets
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetApplying, setPresetApplying] = useState(false);

  const [steps, setSteps] = useState<OptimizationStep[]>([
    { id: "processes", label: "不要プロセス停止",     description: "33種のブロートウェアを検出・終了", status: "idle" },
    { id: "power",     label: "電源プラン変更",       description: "Ultimate Performance に切り替え",  status: "idle" },
    { id: "windows",   label: "Windows ゲーミング設定", description: "視覚効果・Game DVR・アニメーションを最適化", status: "idle" },
    { id: "network",   label: "ネットワーク最適化",   description: "NetworkThrottlingIndex・TCP/IP を最適値に変更", status: "idle" },
  ]);

  const mergeAnnotations = useCallback((procs: ProcessInfo[]): AnnotatedProcess[] =>
    procs.map((p) => ({ ...p, annotation: findAnnotation(p.name) })),
  []);

  const scanProcesses = useCallback(async () => {
    setIsScanning(true);
    try {
      const procs = await invoke<ProcessInfo[]>("get_running_processes");
      setBloatwareProcesses(procs);
      setAnnotatedProcs(mergeAnnotations(procs));
    } catch (e) {
      console.error("Failed to scan processes:", e);
    } finally {
      setIsScanning(false);
    }
  }, [setBloatwareProcesses, mergeAnnotations]);

  useEffect(() => {
    scanProcesses();
    // Load score, system info, presets in parallel
    invoke<OptimizationScore>("get_optimization_score")
      .then((s) => setCurrentScore(s.overall)).catch(() => {});
    invoke<SystemInfo>("get_system_info")
      .then(setSysInfo).catch(() => {});
    invoke<PresetInfo[]>("list_presets")
      .then(setPresets).catch(() => {});
    invoke<ApplyPlan>("get_apply_plan", { requested: GAME_MODE_NODES })
      .then(setApplyPlan).catch(() => {});
  }, [scanProcesses]);

  // When a preset is selected, show its steps as preview
  const displaySteps: Array<{ label: string; description: string }> = selectedPresetId
    ? (presets.find((p) => p.id === selectedPresetId)?.steps ?? []).map((s) => ({ label: s, description: "" }))
    : steps.map((s) => ({ label: s.label, description: s.result ?? s.description }));

  const updateStep = (id: string, updates: Partial<OptimizationStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const captureMetrics = async (): Promise<SessionMetrics | null> => {
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      return {
        process_count: bloatwareProcesses.length,
        memory_used_mb: info.memory_used_mb,
        memory_total_mb: info.memory_total_mb,
        memory_percent: info.memory_percent,
        captured_at: new Date().toISOString(),
      };
    } catch { return null; }
  };

  // Apply selected preset directly
  const applySelectedPreset = async () => {
    if (!selectedPresetId) return;
    setPresetApplying(true);
    try {
      const scorePre = await invoke<OptimizationScore>("get_optimization_score").catch(() => null);
      if (scorePre) setScoreBefore(scorePre.overall);
      const before = ENABLE_OPTIMIZE_RESULT_CARD ? await captureMetrics() : null;
      if (before) setMetricsBefore(before);

      const result = await invoke<PresetResult>("apply_preset", { preset: selectedPresetId });

      const scorePost = await invoke<OptimizationScore>("get_optimization_score").catch(() => null);
      if (scorePost) { setScoreAfter(scorePost.overall); setCurrentScore(scorePost.overall); }
      const after = ENABLE_OPTIMIZE_RESULT_CARD ? await captureMetrics() : null;
      if (after) setMetricsAfter(after);

      const freed = result.process_freed_mb;
      toast.success(
        `${presets.find((p) => p.id === selectedPresetId)?.name} を適用しました` +
        (freed > 0 ? ` — ${freed.toFixed(0)} MB 解放` : "")
      );
      setGameModeActive(true);
      await scanProcesses();
    } catch (e) {
      toast.error(`プリセット適用失敗: ${e}`);
    } finally {
      setPresetApplying(false);
    }
  };

  const handleOptimizeClick = async () => {
    if (selectedPresetId) {
      await applySelectedPreset();
      return;
    }
    if (!ENABLE_SAFETY_KERNEL_UI) { await executeOptimization(); return; }
    setIsChecking(true);
    try {
      const result = await invoke<PreCheckResult>("run_safety_prechecks");
      setPreCheckResult(result);
      setShowPreCheckModal(true);
    } catch { await executeOptimization(); }
    finally { setIsChecking(false); }
  };

  const executeOptimization = async () => {
    setShowPreCheckModal(false);
    setIsOptimizing(true);
    setFailedStepCount(0);
    setMetricsBefore(null); setMetricsAfter(null);
    setScoreBefore(null); setScoreAfter(null);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "idle", result: undefined })));

    const before = ENABLE_OPTIMIZE_RESULT_CARD ? await captureMetrics() : null;
    if (before) setMetricsBefore(before);
    if (ENABLE_VERIFY_BANNER) {
      const s = await invoke<OptimizationScore>("get_optimization_score").catch(() => null);
      if (s) setScoreBefore(s.overall);
    }

    updateStep("processes", { status: "running" });
    try {
      const targets = disabledProcesses.length === 0 ? null
        : bloatwareProcesses.filter((p) => !disabledProcesses.includes(p.name)).map((p) => p.name);
      const result = await invoke<KillResult>("kill_bloatware", { targets });
      updateStep("processes", {
        status: "success",
        result: result.killed.length > 0
          ? `${result.killed.length} 個停止 (${result.freed_memory_mb.toFixed(1)} MB 解放)`
          : "対象プロセスなし（既にクリーン）",
      });
      setFreedMemoryMb(result.freed_memory_mb);
    } catch (e) { updateStep("processes", { status: "error", result: String(e) }); }

    updateStep("power", { status: "running" });
    try {
      await invoke<string>("set_ultimate_performance");
      updateStep("power", { status: "success", result: "Ultimate Performance に切り替えました" });
    } catch (e) { updateStep("power", { status: "error", result: String(e) }); }

    updateStep("windows", { status: "running" });
    try {
      await invoke("apply_gaming_windows_settings");
      updateStep("windows", { status: "success", result: "視覚効果・Game DVR を最適化しました" });
    } catch (e) { updateStep("windows", { status: "error", result: String(e) }); }

    updateStep("network", { status: "running" });
    try {
      await invoke("apply_network_gaming");
      updateStep("network", { status: "success", result: "TCP/IP・NetworkThrottlingIndex を最適化しました" });
    } catch (e) { updateStep("network", { status: "error", result: String(e) }); }

    await scanProcesses();
    if (ENABLE_OPTIMIZE_RESULT_CARD) {
      const after = await captureMetrics();
      if (after) setMetricsAfter(after);
    }
    if (ENABLE_VERIFY_BANNER) {
      const s = await invoke<OptimizationScore>("get_optimization_score").catch(() => null);
      if (s) { setScoreAfter(s.overall); setCurrentScore(s.overall); }
    }
    setSteps((prev) => { setFailedStepCount(prev.filter((s) => s.status === "error").length); return prev; });
    setGameModeActive(true);
    setIsOptimizing(false);
  };

  const restoreOptimization = async () => {
    setIsRestoring(true);
    try {
      await invoke("restore_all");
      setGameModeActive(false);
      setSteps((prev) => prev.map((s) => ({ ...s, status: "idle", result: undefined })));
      const s = await invoke<OptimizationScore>("get_optimization_score").catch(() => null);
      if (s) setCurrentScore(s.overall);
    } catch (e) { toast.error("復元に失敗しました: " + String(e)); }
    finally { setIsRestoring(false); }
  };

  const isBusy = isOptimizing || isRestoring || isChecking || presetApplying;
  const totalMemory = bloatwareProcesses.reduce((sum, p) => sum + p.memory_mb, 0);

  return (
    <div className="p-5 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <Gamepad2 className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ゲームモード</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              AIが分析 → ワンクリックで最大パフォーマンス
            </p>
          </div>
        </div>
        {gameModeActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wide">有効</span>
          </div>
        )}
      </div>

      {/* AI Advisor */}
      <AiAdvisorCard
        score={currentScore}
        procs={annotatedProcs}
        hasApiKey={hasApiKey}
        sysInfo={sysInfo}
      />

      {/* Quick Preset Strip */}
      {presets.length > 0 && (
        <QuickPresetStrip
          presets={presets}
          selectedId={selectedPresetId}
          onSelect={setSelectedPresetId}
        />
      )}

      {/* 2-column layout */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">

        {/* Left — Steps + CTA */}
        <div className="flex flex-col gap-3">
          {/* Steps preview */}
          <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden card-glow">
            <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
            <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
              <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <Zap size={13} className="text-cyan-400" />
              </div>
              <span className="text-sm font-semibold">
                {selectedPresetId
                  ? `${presets.find((p) => p.id === selectedPresetId)?.name ?? "プリセット"} の内容`
                  : "最適化ステップ"}
              </span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {selectedPresetId
                ? displaySteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <ChevronRight size={14} className="text-cyan-400/50 shrink-0" />
                      <p className="text-sm text-muted-foreground/80">{s.label}</p>
                    </div>
                  ))
                : steps.map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-3 px-4 py-3.5">
                      <StepIcon status={step.status} index={idx + 1} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{step.label}</p>
                        <p className={cn(
                          "text-xs truncate mt-0.5",
                          step.status === "success" ? "text-emerald-400" :
                          step.status === "error" ? "text-red-400" : "text-muted-foreground"
                        )}>
                          {step.result ?? step.description}
                        </p>
                      </div>
                      {step.status === "running" && (
                        <div className="w-16 shrink-0"><ProgressBar value={50} colorByValue={false} showLabel={false} /></div>
                      )}
                    </div>
                  ))
              }
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleOptimizeClick}
              disabled={isBusy}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-3",
                isBusy
                  ? "bg-cyan-500/8 text-cyan-400/40 cursor-not-allowed border border-cyan-500/10"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-[0.97] glow-cyan"
              )}
            >
              {(isOptimizing || presetApplying) ? <><Loader2 size={20} className="animate-spin" />最適化中...</> :
               isChecking ? <><Loader2 size={20} className="animate-spin" />チェック中...</> :
               selectedPresetId
                 ? <><Zap size={20} />{presets.find((p) => p.id === selectedPresetId)?.name} を適用</>
                 : <><Gamepad2 size={20} />ワンクリック最適化</>}
            </button>

            {gameModeActive && (
              <button
                type="button"
                onClick={restoreOptimization}
                disabled={isBusy}
                className={cn(
                  "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border",
                  isBusy
                    ? "opacity-30 cursor-not-allowed border-white/[0.06] text-muted-foreground"
                    : "border-white/[0.10] bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground hover:border-white/20"
                )}
              >
                {isRestoring ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                設定を復元
              </button>
            )}
          </div>

          {/* Result cards */}
          {ENABLE_OPTIMIZE_RESULT_CARD && metricsBefore && metricsAfter && (
            <BeforeAfterCard before={metricsBefore} after={metricsAfter} />
          )}
          {ENABLE_VERIFY_BANNER && scoreBefore !== null && scoreAfter !== null && (
            <div className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm",
              scoreAfter >= scoreBefore
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
            )}>
              <ShieldCheck size={15} className="flex-shrink-0" />
              <span>
                スコア: <strong>{Math.round(scoreBefore)}</strong> → <strong>{Math.round(scoreAfter)}</strong>
                {" "}({scoreAfter >= scoreBefore ? "+" : ""}{Math.round(scoreAfter - scoreBefore)} pts)
              </span>
            </div>
          )}
          {failedStepCount > 0 && gameModeActive && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold">{failedStepCount} ステップが失敗</p>
                <p className="text-[11px] text-amber-400/70 mt-0.5">「設定を復元」で元の状態に戻せます。</p>
              </div>
            </div>
          )}
          {ENABLE_OPTIMIZE_RESULT_CARD && gameModeActive && (
            <div className="flex justify-end"><RollbackEntryPoint /></div>
          )}
        </div>

        {/* Right — Detected Processes */}
        <div className="bg-[#05080c] border border-white/[0.12] rounded-xl overflow-hidden flex flex-col card-glow">
          <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-red-500/10 rounded-lg border border-red-500/20">
                <Trash2 size={13} className="text-red-400/70" />
              </div>
              <span className="text-sm font-semibold">検出されたプロセス</span>
              {bloatwareProcesses.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 rounded-full font-semibold">
                  {bloatwareProcesses.length} 件
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={scanProcesses}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-white/[0.07] hover:border-white/15 rounded-lg transition-colors"
            >
              <RefreshCw size={11} className={isScanning ? "animate-spin" : ""} />
              スキャン
            </button>
          </div>

          {isScanning ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 size={15} className="animate-spin text-cyan-400" />
              <span className="text-sm">スキャン中...</span>
            </div>
          ) : annotatedProcs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <CheckCircle2 size={20} className="text-emerald-400/60" />
              <span className="text-sm">不要プロセスは検出されませんでした</span>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence>
                  {annotatedProcs.map((proc) => <ProcessRow key={proc.pid} proc={proc} />)}
                </AnimatePresence>
              </div>
              <ProcessSummary procs={annotatedProcs} />
              <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.05] flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  合計メモリ: <span className="text-foreground font-medium">{formatMemory(totalMemory)}</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Precheck modal */}
      {ENABLE_SAFETY_KERNEL_UI && showPreCheckModal && preCheckResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#05080c] border border-white/[0.12] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                <ShieldCheck size={18} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="font-semibold text-base">最適化プレチェック</h2>
                <p className="text-xs text-muted-foreground/60">適用前の安全確認</p>
              </div>
            </div>
            {applyPlan && applyPlan.order.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-wider">適用順序</p>
                <div className="flex flex-wrap gap-1.5">
                  {applyPlan.order.map((nodeId, i) => (
                    <span key={nodeId} className="flex items-center gap-1 px-2 py-1 bg-white/[0.05] border border-white/[0.12] rounded-full text-[11px] text-muted-foreground">
                      <span className="text-cyan-500/50 font-mono tabular-nums">{i + 1}.</span>
                      {NODE_DISPLAY[nodeId] ?? nodeId}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <PreCheckPanel result={preCheckResult} />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowPreCheckModal(false)}
                className="flex-1 py-2 rounded-lg border border-white/[0.10] text-sm text-muted-foreground hover:bg-white/[0.06] transition-colors">
                キャンセル
              </button>
              <button type="button" onClick={executeOptimization}
                disabled={preCheckResult.blockers.length > 0}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-semibold transition-all",
                  preCheckResult.blockers.length > 0
                    ? "bg-white/[0.04] text-muted-foreground/55 cursor-not-allowed border border-white/[0.06]"
                    : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110"
                )}>
                {preCheckResult.blockers.length > 0 ? "適用不可" : "確認して最適化"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  switch (status) {
    case "running": return <Loader2 size={18} className="text-cyan-400 animate-spin shrink-0" />;
    case "success": return <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />;
    case "error":   return <XCircle size={18} className="text-destructive shrink-0" />;
    default:        return <div className="step-number shrink-0">{index}</div>;
  }
}
