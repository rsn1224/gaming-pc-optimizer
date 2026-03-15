/**
 * CommandPalette — グローバルコマンドパレット
 * Ctrl+K / Cmd+K で起動。ナビ・クイックアクション・システムコマンドを横断検索。
 */
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Zap, Cpu, Gamepad2, Activity, HardDrive,
  RotateCcw, Calendar, Settings, Search, Play,
  Sparkles, Monitor, BatteryLow, ChevronRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommandPaletteStore } from "@/stores/useCommandPaletteStore";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "@/stores/useToastStore";
import type { ActivePage } from "@/types";

// ── Command definitions ───────────────────────────────────────────────────────

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: string;
  keywords?: string[];
  action: () => void | Promise<void>;
}

function useCommands() {
  const { setActivePage } = useAppStore();
  const { close } = useCommandPaletteStore();

  const nav = useCallback(
    (page: ActivePage) => {
      setActivePage(page);
      close();
    },
    [setActivePage, close]
  );

  const run = useCallback(
    async (fn: () => Promise<void>, successMsg?: string) => {
      close();
      try {
        await fn();
        if (successMsg) toast.success(successMsg);
      } catch (e) {
        toast.error(`実行失敗: ${e}`);
      }
    },
    [close]
  );

  return useMemo<Command[]>(
    () => [
      // ── ナビゲーション ────────────────────────────────────────────────
      {
        id: "nav-home",
        label: "ホーム",
        description: "AI デイリーブリーフィング・システム概要",
        icon: <Home size={14} />,
        category: "ナビゲーション",
        keywords: ["home", "ダッシュボード"],
        action: () => nav("home"),
      },
      {
        id: "nav-optimize",
        label: "最適化ハブ",
        description: "パフォーマンス最適化・プリセット適用",
        icon: <Zap size={14} />,
        category: "ナビゲーション",
        keywords: ["optimize", "最適化", "プリセット"],
        action: () => nav("optimize_hub"),
      },
      {
        id: "nav-process",
        label: "プロセス＆スタートアップ",
        description: "実行中プロセス管理・スタートアップ最適化",
        icon: <Cpu size={14} />,
        category: "ナビゲーション",
        keywords: ["process", "startup", "プロセス", "スタートアップ"],
        action: () => nav("process_startup"),
      },
      {
        id: "nav-games",
        label: "ゲームライブラリ",
        description: "ゲーム管理・パフォーマンスログ",
        icon: <Gamepad2 size={14} />,
        category: "ナビゲーション",
        keywords: ["game", "games", "library", "ゲーム"],
        action: () => nav("games_hub"),
      },
      {
        id: "nav-hardware",
        label: "ハードウェア＆ベンチマーク",
        description: "温度監視・ベンチマーク・AI解析",
        icon: <Activity size={14} />,
        category: "ナビゲーション",
        keywords: ["hardware", "benchmark", "温度", "ベンチ"],
        action: () => nav("hardware_bench"),
      },
      {
        id: "nav-storage",
        label: "ストレージ＆アプリ管理",
        description: "ディスク最適化・アプリアンインストール",
        icon: <HardDrive size={14} />,
        category: "ナビゲーション",
        keywords: ["storage", "disk", "ストレージ", "アプリ"],
        action: () => nav("storage_apps"),
      },
      {
        id: "nav-rollback",
        label: "ロールバック＆ログ",
        description: "変更履歴・エラーログ・安全な復元",
        icon: <RotateCcw size={14} />,
        category: "ナビゲーション",
        keywords: ["rollback", "log", "ロールバック", "ログ", "復元"],
        action: () => nav("rollback_logs"),
      },
      {
        id: "nav-scheduler",
        label: "スケジューラー＆ポリシー",
        description: "自動最適化・AI ポリシー生成",
        icon: <Calendar size={14} />,
        category: "ナビゲーション",
        keywords: ["schedule", "policy", "スケジュール", "ポリシー", "自動化"],
        action: () => nav("scheduler_policy"),
      },
      {
        id: "nav-settings",
        label: "設定",
        description: "外観・AI キー・ホットキー設定",
        icon: <Settings size={14} />,
        category: "ナビゲーション",
        keywords: ["settings", "設定", "config"],
        action: () => nav("settings"),
      },

      // ── クイックアクション ────────────────────────────────────────────
      {
        id: "action-esports",
        label: "Esports モードを適用",
        description: "FPS 最優先・バックグラウンド最小化",
        icon: <Zap size={14} className="text-cyan-400" />,
        category: "クイックアクション",
        keywords: ["esports", "fps", "gaming", "ゲーム", "プリセット"],
        action: () =>
          run(
            () => invoke("apply_preset", { presetId: "esports" }),
            "Esports モードを適用しました"
          ),
      },
      {
        id: "action-streaming",
        label: "配信モードを適用",
        description: "OBS / Streamlabs 向け バランス設定",
        icon: <Monitor size={14} className="text-violet-400" />,
        category: "クイックアクション",
        keywords: ["streaming", "obs", "配信", "ストリーミング"],
        action: () =>
          run(
            () => invoke("apply_preset", { presetId: "streaming" }),
            "配信モードを適用しました"
          ),
      },
      {
        id: "action-quiet",
        label: "省電力モードを適用",
        description: "温度・消費電力を抑えた静音設定",
        icon: <BatteryLow size={14} className="text-emerald-400" />,
        category: "クイックアクション",
        keywords: ["quiet", "battery", "静音", "省電力", "節電"],
        action: () =>
          run(
            () => invoke("apply_preset", { presetId: "quiet" }),
            "省電力モードを適用しました"
          ),
      },
      {
        id: "action-optimize-all",
        label: "全最適化を実行",
        description: "プロセス・電源・ネットワークを一括最適化",
        icon: <Sparkles size={14} className="text-amber-400" />,
        category: "クイックアクション",
        keywords: ["optimize", "all", "全", "最適化", "一括"],
        action: () =>
          run(() => invoke("apply_all"), "全最適化を実行しました"),
      },
      {
        id: "action-game-session",
        label: "ゲームセッション開始",
        description: "Esports モード適用 → ゲームライブラリへ移動",
        icon: <Play size={14} className="text-cyan-400" />,
        category: "クイックアクション",
        keywords: ["game", "session", "start", "ゲーム", "開始", "プレイ"],
        action: async () => {
          close();
          try {
            await invoke("apply_preset", { presetId: "esports" });
            toast.success("Esports モードを適用 — ゲームを起動してください");
          } catch {
            // preset may not exist; proceed anyway
          }
          setActivePage("games_hub");
        },
      },
      {
        id: "action-benchmark",
        label: "ベンチマークを開始",
        description: "AI ボトルネック解析付きベンチマークへ移動",
        icon: <Activity size={14} className="text-amber-400" />,
        category: "クイックアクション",
        keywords: ["benchmark", "bench", "ベンチマーク", "計測"],
        action: () => nav("hardware_bench"),
      },
    ],
    [nav, run, close, setActivePage]
  );
}

// ── Search ────────────────────────────────────────────────────────────────────

function matchesQuery(cmd: Command, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (cmd.label.toLowerCase().includes(q)) return true;
  if (cmd.description?.toLowerCase().includes(q)) return true;
  if (cmd.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, close } = useCommandPaletteStore();
  const commands = useCommands();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const matched = commands.filter((c) => matchesQuery(c, query));
    // Group by category
    const grouped: { category: string; items: Command[] }[] = [];
    for (const cmd of matched) {
      const g = grouped.find((g) => g.category === cmd.category);
      if (g) g.items.push(cmd);
      else grouped.push({ category: cmd.category, items: [cmd] });
    }
    return grouped;
  }, [commands, query]);

  const flatFiltered = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeCommand = useCallback(
    async (cmd: Command) => {
      setRunning(cmd.id);
      await cmd.action();
      setRunning(null);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatFiltered[selectedIdx]) {
        e.preventDefault();
        executeCommand(flatFiltered[selectedIdx]);
      }
    },
    [close, flatFiltered, selectedIdx, executeCommand]
  );

  // Scroll selected item into view
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  let flatIdx = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={close}
          />

          {/* Panel — Division 2 glass */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-[18%] left-1/2 -translate-x-1/2 z-[61] w-[560px] max-h-[60vh] flex flex-col panel-hud panel-border-orange panel-shadow-glow-orange overflow-hidden"
          >
            {/* Corner brackets */}
            <span className="bracket bracket-tl" />
            <span className="bracket bracket-tr" />
            <span className="bracket bracket-bl" />
            <span className="bracket bracket-br" />
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]">
              <Search size={15} className="text-muted-foreground/50 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="コマンドを検索..."
                className="flex-1 bg-transparent text-[13px] text-white placeholder:text-muted-foreground/35 focus:outline-none"
              />
              <kbd className="text-[10px] text-muted-foreground/35 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono shrink-0">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="text-center text-[12px] text-muted-foreground/40 py-8">
                  「{query}」に一致するコマンドが見つかりません
                </p>
              ) : (
                filtered.map(({ category, items }) => (
                  <div key={category} className="mb-1">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                      {category}
                    </p>
                    {items.map((cmd) => {
                      const idx = flatIdx++;
                      const isSelected = idx === selectedIdx;
                      const isRunning = running === cmd.id;
                      return (
                        <button
                          key={cmd.id}
                          ref={isSelected ? selectedRef : undefined}
                          type="button"
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                            isSelected
                              ? "bg-white/[0.06] text-white"
                              : "text-muted-foreground/70 hover:bg-white/[0.04]"
                          )}
                        >
                          <span className={cn(
                            "shrink-0 transition-colors",
                            isSelected ? "text-cyan-400" : "text-muted-foreground/40"
                          )}>
                            {isRunning ? <Loader2 size={14} className="animate-spin" /> : cmd.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium leading-none">{cmd.label}</p>
                            {cmd.description && (
                              <p className="text-[10px] text-muted-foreground/45 mt-0.5 truncate">{cmd.description}</p>
                            )}
                          </div>
                          {isSelected && (
                            <ChevronRight size={12} className="shrink-0 text-muted-foreground/30" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-white/[0.05] bg-white/[0.01]">
              {[
                { keys: ["↑", "↓"], label: "移動" },
                { keys: ["Enter"], label: "実行" },
                { keys: ["Esc"], label: "閉じる" },
              ].map(({ keys, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  {keys.map((k) => (
                    <kbd key={k} className="text-[10px] text-muted-foreground/35 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono">
                      {k}
                    </kbd>
                  ))}
                  <span className="text-[10px] text-muted-foreground/35">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
