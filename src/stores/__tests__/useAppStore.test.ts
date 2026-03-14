import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../useAppStore";
import { useEditingStore } from "../useEditingStore";

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      activePage: "dashboard",
      gameModeActive: false,
      freedMemoryMb: 0,
      optimizationStatus: "idle",
      optimizationMessage: "",
    });
  });

  it("setActivePage updates activePage", () => {
    useAppStore.getState().setActivePage("gamemode");
    expect(useAppStore.getState().activePage).toBe("gamemode");
  });

  it("setGameModeActive toggles gameModeActive", () => {
    useAppStore.getState().setGameModeActive(true);
    expect(useAppStore.getState().gameModeActive).toBe(true);
    useAppStore.getState().setGameModeActive(false);
    expect(useAppStore.getState().gameModeActive).toBe(false);
  });

  it("setFreedMemoryMb stores correct value", () => {
    useAppStore.getState().setFreedMemoryMb(512.5);
    expect(useAppStore.getState().freedMemoryMb).toBe(512.5);
  });

  it("setOptimizationStatus transitions state", () => {
    useAppStore.getState().setOptimizationStatus("running");
    expect(useAppStore.getState().optimizationStatus).toBe("running");
    useAppStore.getState().setOptimizationStatus("idle");
    expect(useAppStore.getState().optimizationStatus).toBe("idle");
  });
});

describe("useEditingStore", () => {
  beforeEach(() => {
    useEditingStore.setState({ editingProfileId: null });
  });

  it("setEditingProfileId stores and clears profile id", () => {
    useEditingStore.getState().setEditingProfileId("profile-abc");
    expect(useEditingStore.getState().editingProfileId).toBe("profile-abc");
    useEditingStore.getState().setEditingProfileId(null);
    expect(useEditingStore.getState().editingProfileId).toBeNull();
  });
});
