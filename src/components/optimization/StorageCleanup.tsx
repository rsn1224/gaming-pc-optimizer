import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  HardDrive,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FolderOpen,
  Brain,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { StorageCategory, CleanResult, AiStorageItem } from "@/types";
import { formatMemory } from "@/lib/utils";

// ── Checkbox ────────────────────────────────────────────────────────────────

function Checkbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
        ${checked
          ? "bg-cyan-500 border-cyan-500"
          : "border-border bg-transparent hover:border-muted-foreground"
        }
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {checked && (
        <svg
          viewBox="0 0 10 8"
          className="w-3 h-3 fill-none stroke-white stroke-2"
        >
          <polyline points="1,4 4,7 9,1" />
        </svg>
      )}
    </button>
  );
}

// ── SizeBar ─────────────────────────────────────────────────────────────────

function SizeBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div
        className="h-full bg-cyan-500/70 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

type Phase = "idle" | "scanning" | "ready" | "cleaning" | "done" | "error";

export function StorageCleanup() {
  const [categories, setCategories] = useState<StorageCategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CleanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<Map<string, AiStorageItem>>(new Map());
  const [aiError, setAiError] = useState("");

  const runAiRecommend = async () => {
    setIsAiLoading(true);
    setAiError("");
    try {
      const items = await invoke<AiStorageItem[]>("get_ai_storage_recommendation");
      const map = new Map(items.map((i) => [i.id, i]));
      setAiItems(map);
      // If we have scan results, update categories shown from AI scan; else trigger a scan
      if (categories.length === 0) {
        const cats = await invoke<StorageCategory[]>("scan_storage");
        setCategories(cats);
        setPhase("ready");
      }
      // Auto-select only what AI recommends
      setSelected(new Set(items.filter((i) => i.recommend).map((i) => i.id)));
    } catch (e) {
      setAiError(String(e));
    } finally {
      setIsAiLoading(false);
    }
  };

  const scan = async () => {
    setPhase("scanning");
    setResult(null);
    setSelected(new Set());
    try {
      const cats = await invoke<StorageCategory[]>("scan_storage");
      setCategories(cats);
      // Pre-select all accessible non-empty categories
      setSelected(
        new Set(
          cats
            .filter((c) => c.accessible && c.size_mb > 0)
            .map((c) => c.id)
        )
      );
      setPhase("ready");
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const selectable = categories
      .filter((c) => c.accessible && c.size_mb > 0)
      .map((c) => c.id);
    if (selectable.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable));
    }
  };

  const clean = async () => {
    setPhase("cleaning");
    try {
      const r = await invoke<CleanResult>("clean_storage", {
        ids: Array.from(selected),
      });
      setResult(r);
      // Re-scan to show updated sizes
      const cats = await invoke<StorageCategory[]>("scan_storage");
      setCategories(cats);
      setSelected(new Set());
      setPhase("done");
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  };

  const maxSize = Math.max(...categories.map((c) => c.size_mb), 1);
  const totalSelected = categories
    .filter((c) => selected.has(c.id))
    .reduce((sum, c) => sum + c.size_mb, 0);
  const totalAll = categories.reduce((sum, c) => sum + c.size_mb, 0);

  const selectableIds = categories
    .filter((c) => c.accessible && c.size_mb > 0)
    .map((c) => c.id);
  const allChecked =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const isBusy = phase === "scanning" || phase === "cleaning";

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 rounded-xl shadow-[0_0_12px_rgba(249,115,22,0.1)]">
            <HardDrive className="text-orange-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ストレージ管理</h1>
            <p className="text-sm text-muted-foreground">
              キャッシュ・一時ファイルのスキャンと選択削除
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runAiRecommend}
            disabled={isBusy || isAiLoading}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              ${isAiLoading
                ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                : "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
              }`}
          >
            {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
            {isAiLoading ? "AI分析中..." : "AIに推奨してもらう"}
          </button>
          <button
            type="button"
            onClick={scan}
            disabled={isBusy || isAiLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:border-muted-foreground hover:text-foreground text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={phase === "scanning" ? "animate-spin" : ""} />
            {phase === "scanning" ? "スキャン中..." : "スキャン"}
          </button>
        </div>
      </div>

      {/* AI error */}
      {aiError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          <XCircle size={16} />
          {aiError}
        </div>
      )}

      {/* AI summary banner */}
      {aiItems.size > 0 && !aiError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-sm">
          <Brain size={14} className="text-purple-400 shrink-0" />
          <span className="text-purple-300 font-medium">AI推奨</span>
          <span className="text-muted-foreground">
            削除OK: <span className="text-foreground font-medium">{[...aiItems.values()].filter((i) => i.recommend).length}件</span>
            、スキップ: <span className="text-foreground font-medium">{[...aiItems.values()].filter((i) => !i.recommend).length}件</span>
          </span>
        </div>
      )}

      {/* Idle state */}
      {phase === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="p-4 bg-secondary rounded-full">
            <FolderOpen size={32} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            「スキャン」を押して一時ファイルを検索します
          </p>
          <button
            onClick={scan}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:brightness-110 active:scale-[0.98] transition-all"
          >
            スキャン開始
          </button>
        </div>
      )}

      {/* Scanning spinner */}
      {phase === "scanning" && (
        <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">一時ファイルをスキャン中...</span>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          <XCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Done result banner */}
      <AnimatePresence>
        {phase === "done" && result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-lg"
          >
            <CheckCircle2 size={18} className="text-green-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-400">
                クリーン完了 — {formatMemory(result.freed_mb)} 解放しました
              </p>
              {result.error_count > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.error_count} 件のファイルは使用中のためスキップ
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category list */}
      {(phase === "ready" || phase === "done" || phase === "cleaning") &&
        categories.length > 0 && (
          <>
            {/* Summary row */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                合計:{" "}
                <span className="text-foreground font-medium">
                  {formatMemory(totalAll)}
                </span>
              </span>
              {totalSelected > 0 && (
                <span>
                  選択中:{" "}
                  <span className="text-cyan-400 font-medium">
                    {formatMemory(totalSelected)}
                  </span>
                </span>
              )}
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Select-all header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/30">
                <Checkbox
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={isBusy || selectableIds.length === 0}
                />
                <span className="text-xs font-semibold text-muted-foreground flex-1">
                  カテゴリ
                </span>
                <span className="text-xs font-semibold text-muted-foreground w-20 text-right">
                  ファイル数
                </span>
                <span className="text-xs font-semibold text-muted-foreground w-20 text-right">
                  サイズ
                </span>
              </div>

              <div className="divide-y divide-border/50">
                {categories.map((cat) => {
                  const canSelect = cat.accessible && cat.size_mb > 0;
                  const isChecked = selected.has(cat.id);
                  return (
                    <div
                      key={cat.id}
                      onClick={() => canSelect && !isBusy && toggleSelect(cat.id)}
                      className={`
                        flex items-center gap-3 px-4 py-3 transition-colors
                        ${canSelect && !isBusy ? "cursor-pointer hover:bg-secondary/40" : "cursor-default"}
                        ${isChecked ? "bg-cyan-500/5" : ""}
                      `}
                    >
                      <Checkbox
                        checked={isChecked}
                        onChange={() => toggleSelect(cat.id)}
                        disabled={!canSelect || isBusy}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{cat.name}</p>
                          {aiItems.has(cat.id) && (
                            <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                              aiItems.get(cat.id)!.recommend
                                ? "bg-green-500/15 text-green-400 border-green-500/30"
                                : "bg-secondary text-muted-foreground border-border"
                            }`}>
                              {aiItems.get(cat.id)!.recommend ? "削除OK" : "スキップ"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {aiItems.get(cat.id)?.reason ?? cat.description}
                        </p>
                      </div>
                      {!cat.accessible ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/60 w-20 justify-end">
                          <AlertCircle size={12} />
                          アクセス不可
                        </span>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                            {cat.file_count.toLocaleString()} 件
                          </span>
                          <div className="flex items-center gap-2 w-20 justify-end">
                            <SizeBar value={cat.size_mb} max={maxSize} />
                            <span
                              className={`text-xs tabular-nums font-medium ${
                                cat.size_mb > 0
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {formatMemory(cat.size_mb)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clean button */}
            <button
              onClick={clean}
              disabled={isBusy || selected.size === 0}
              className={`
                w-full py-3.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2
                ${isBusy || selected.size === 0
                  ? "bg-primary/20 text-primary/60 cursor-not-allowed border border-primary/20"
                  : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] glow-cyan border border-primary/20"
                }
              `}
            >
              {phase === "cleaning" ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  削除中...
                </>
              ) : (
                <>
                  <Trash2 size={18} />
                  選択したファイルを削除
                  {selected.size > 0 && (
                    <span className="ml-1 opacity-70">
                      ({formatMemory(totalSelected)})
                    </span>
                  )}
                </>
              )}
            </button>
          </>
        )}
    </div>
  );
}
