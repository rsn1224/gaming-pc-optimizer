import { create } from "zustand";
import type { SimulationResult, AllOptimizationResult } from "@/types";

interface MetricsStore {
  // Simulation / confirmation dialog state
  simulation: SimulationResult | null;
  setSimulation: (s: SimulationResult | null) => void;
  onConfirm: (() => Promise<void>) | null;
  setOnConfirm: (fn: (() => Promise<void>) | null) => void;

  // Result from the most recent confirmed optimization
  // (used to notify Dashboard after SimulationPanel executes)
  lastOptResult: AllOptimizationResult | null;
  setLastOptResult: (r: AllOptimizationResult | null) => void;

  // Executing state for the SimulationPanel's "Run" button
  executing: boolean;
  setExecuting: (v: boolean) => void;
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  simulation: null,
  setSimulation: (s) => set({ simulation: s }),
  onConfirm: null,
  setOnConfirm: (fn) => set({ onConfirm: fn }),

  lastOptResult: null,
  setLastOptResult: (r) => set({ lastOptResult: r }),

  executing: false,
  setExecuting: (v) => set({ executing: v }),
}));
