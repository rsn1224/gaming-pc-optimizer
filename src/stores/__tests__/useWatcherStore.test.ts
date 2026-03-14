import { beforeEach, describe, expect, it } from "vitest";
import { useWatcherStore } from "../useWatcherStore";

describe("useWatcherStore", () => {
  beforeEach(() => {
    useWatcherStore.setState({ activeProfileId: null, autoOptimize: false });
  });

  it("setActiveProfileId stores profile id", () => {
    useWatcherStore.getState().setActiveProfileId("game-profile-123");
    expect(useWatcherStore.getState().activeProfileId).toBe("game-profile-123");
  });

  it("setActiveProfileId accepts null to clear", () => {
    useWatcherStore.getState().setActiveProfileId("some-id");
    useWatcherStore.getState().setActiveProfileId(null);
    expect(useWatcherStore.getState().activeProfileId).toBeNull();
  });

  it("setAutoOptimize toggles flag", () => {
    useWatcherStore.getState().setAutoOptimize(true);
    expect(useWatcherStore.getState().autoOptimize).toBe(true);
    useWatcherStore.getState().setAutoOptimize(false);
    expect(useWatcherStore.getState().autoOptimize).toBe(false);
  });

  it("autoOptimize is false by default", () => {
    expect(useWatcherStore.getState().autoOptimize).toBe(false);
  });

  it("activeProfileId is null by default", () => {
    expect(useWatcherStore.getState().activeProfileId).toBeNull();
  });
});
