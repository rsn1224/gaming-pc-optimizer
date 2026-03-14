import { create } from "zustand";
import type { OptimizationSession } from "@/types";

// ── Feature flags (persisted to localStorage) ─────────────────────────────────

function readFlag(key: string, defaultVal: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? defaultVal : raw === "true";
  } catch {
    return defaultVal;
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface SafetyStore {
  // Feature flags
  rollbackEnabled: boolean;
  setRollbackEnabled: (v: boolean) => void;
  beginnerMode: boolean;
  setBeginnerMode: (v: boolean) => void;

  // Session list
  sessions: OptimizationSession[];
  setSessions: (sessions: OptimizationSession[]) => void;

  // Loading state
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export const useSafetyStore = create<SafetyStore>((set) => ({
  rollbackEnabled: readFlag("rollbackEnabled", true),
  setRollbackEnabled: (v) => {
    localStorage.setItem("rollbackEnabled", String(v));
    set({ rollbackEnabled: v });
  },

  beginnerMode: readFlag("beginnerMode", false),
  setBeginnerMode: (v) => {
    localStorage.setItem("beginnerMode", String(v));
    set({ beginnerMode: v });
  },

  sessions: [],
  setSessions: (sessions) => set({ sessions }),

  loading: false,
  setLoading: (v) => set({ loading: v }),
}));
