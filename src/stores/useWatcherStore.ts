import { create } from "zustand";

interface WatcherStore {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  autoOptimize: boolean;
  setAutoOptimize: (enabled: boolean) => void;
}

export const useWatcherStore = create<WatcherStore>((set) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => set({ activeProfileId: id }),
  autoOptimize: false,
  setAutoOptimize: (enabled) => set({ autoOptimize: enabled }),
}));
