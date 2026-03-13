import { create } from "zustand";
import type { SystemInfo, ProcessInfo, OptimizationStatus, ActivePage } from "@/types";

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
  // Navigation
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;

  // System Info
  systemInfo: SystemInfo | null;
  setSystemInfo: (info: SystemInfo) => void;

  // Process list
  bloatwareProcesses: ProcessInfo[];
  setBloatwareProcesses: (procs: ProcessInfo[]) => void;

  // Optimization status
  optimizationStatus: OptimizationStatus;
  setOptimizationStatus: (status: OptimizationStatus) => void;
  optimizationMessage: string;
  setOptimizationMessage: (msg: string) => void;

  // Power plan
  currentPowerPlan: string;
  setCurrentPowerPlan: (plan: string) => void;

  // Game mode
  gameModeActive: boolean;
  setGameModeActive: (active: boolean) => void;
  freedMemoryMb: number;
  setFreedMemoryMb: (mb: number) => void;

  // Settings
  theme: Theme;
  setTheme: (theme: Theme) => void;
  disabledProcesses: string[];
  setDisabledProcesses: (names: string[]) => void;

  // Watcher / tray state
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  autoOptimize: boolean;
  setAutoOptimize: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activePage: "dashboard",
  setActivePage: (page) => set({ activePage: page }),

  systemInfo: null,
  setSystemInfo: (info) => set({ systemInfo: info }),

  bloatwareProcesses: [],
  setBloatwareProcesses: (procs) => set({ bloatwareProcesses: procs }),

  optimizationStatus: "idle",
  setOptimizationStatus: (status) => set({ optimizationStatus: status }),
  optimizationMessage: "",
  setOptimizationMessage: (msg) => set({ optimizationMessage: msg }),

  currentPowerPlan: "",
  setCurrentPowerPlan: (plan) => set({ currentPowerPlan: plan }),

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

  activeProfileId: null,
  setActiveProfileId: (id) => set({ activeProfileId: id }),
  autoOptimize: false,
  setAutoOptimize: (enabled) => set({ autoOptimize: enabled }),
}));
