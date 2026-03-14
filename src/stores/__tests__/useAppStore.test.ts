import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../useAppStore";

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      activePage: "dashboard",
      gameModeActive: false,
      freedMemoryMb: 0,
      optimizationStatus: "idle",
      optimizationMessage: "",
      editingProfileId: null,
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

  it("setEditingProfileId stores and clears profile id", () => {
    useAppStore.getState().setEditingProfileId("profile-abc");
    expect(useAppStore.getState().editingProfileId).toBe("profile-abc");
    useAppStore.getState().setEditingProfileId(null);
    expect(useAppStore.getState().editingProfileId).toBeNull();
  });
});
