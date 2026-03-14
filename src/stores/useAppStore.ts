/**
 * useAppStore — アプリグローバル状態
 *
 * 責務の区分:
 *   [ナビゲーション]    activePage
 *   [実行状態]         optimizationStatus / optimizationMessage / gameModeActive / freedMemoryMb
 *   [キャッシュ]        bloatwareProcesses
 *   [永続設定]         theme / disabledProcesses
 *
 * 編集状態 (editingProfileId など) は useEditingStore に分離済み。
 * ウォッチャー実行状態 (activeProfileId, autoOptimize) は useWatcherStore 参照。
 */
import { create } from "zustand";
import type { ProcessInfo, OptimizationStatus, ActivePage } from "@/types";

export type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

const storedTheme = (localStorage.getItem("theme") as Theme | null) ?? "dark";
applyTheme(storedTheme);

const storedDisabled = (() => {
  try {
    return JSON.parse(localStorage.getItem("disabledProcesses") ?? "[]") as string[];
  } catch {
    return [] as string[];
  }
})();

interface AppState {
  // ── ナビゲーション ──────────────────────────────────────────────────────────
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;

  // ── キャッシュ ──────────────────────────────────────────────────────────────
  bloatwareProcesses: ProcessInfo[];
  setBloatwareProcesses: (procs: ProcessInfo[]) => void;

  // ── 実行状態 (Execution State) ──────────────────────────────────────────────
  optimizationStatus: OptimizationStatus;
  setOptimizationStatus: (status: OptimizationStatus) => void;
  optimizationMessage: string;
  setOptimizationMessage: (msg: string) => void;
  gameModeActive: boolean;
  setGameModeActive: (active: boolean) => void;
  freedMemoryMb: number;
  setFreedMemoryMb: (mb: number) => void;

  // ── 永続設定 ────────────────────────────────────────────────────────────────
  theme: Theme;
  setTheme: (theme: Theme) => void;
  disabledProcesses: string[];
  setDisabledProcesses: (names: string[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activePage: "home",
  setActivePage: (page) => set({ activePage: page }),

  bloatwareProcesses: [],
  setBloatwareProcesses: (procs) => set({ bloatwareProcesses: procs }),

  optimizationStatus: "idle",
  setOptimizationStatus: (status) => set({ optimizationStatus: status }),
  optimizationMessage: "",
  setOptimizationMessage: (msg) => set({ optimizationMessage: msg }),

  gameModeActive: false,
  setGameModeActive: (active) => set({ gameModeActive: active }),
  freedMemoryMb: 0,
  setFreedMemoryMb: (mb) => set({ freedMemoryMb: mb }),

  theme: storedTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    localStorage.setItem("theme", theme);
    set({ theme });
  },

  disabledProcesses: storedDisabled,
  setDisabledProcesses: (names) => {
    localStorage.setItem("disabledProcesses", JSON.stringify(names));
    set({ disabledProcesses: names });
  },
}));
