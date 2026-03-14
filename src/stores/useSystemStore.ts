import { create } from "zustand";
import type { SystemInfo } from "@/types";

interface SystemStore {
  systemInfo: SystemInfo | null;
  setSystemInfo: (info: SystemInfo) => void;
  currentPowerPlan: string;
  setCurrentPowerPlan: (plan: string) => void;
}

export const useSystemStore = create<SystemStore>((set) => ({
  systemInfo: null,
  setSystemInfo: (info) => set({ systemInfo: info }),
  currentPowerPlan: "",
  setCurrentPowerPlan: (plan) => set({ currentPowerPlan: plan }),
}));
