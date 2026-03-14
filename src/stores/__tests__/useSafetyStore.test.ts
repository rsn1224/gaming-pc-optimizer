import { beforeEach, describe, expect, it } from "vitest";
import { useSafetyStore } from "../useSafetyStore";
import type { OptimizationSession } from "@/types";

const MOCK_SESSION: OptimizationSession = {
  id: "sess-1",
  started_at: "2026-01-01T00:00:00Z",
  ended_at: "2026-01-01T00:01:00Z",
  profile_id: null,
  mode: "real",
  status: "applied",
  snapshot: { power_plan_guid: null, windows_settings: null, network_settings: null, captured_at: "2026-01-01T00:00:00Z" },
  changes: [],
  summary: null,
  metrics_before: null,
  metrics_after: null,
};

describe("useSafetyStore", () => {
  beforeEach(() => {
    useSafetyStore.setState({
      rollbackEnabled: true,
      beginnerMode: false,
      sessions: [],
      loading: false,
    });
  });

  it("rollbackEnabled defaults to true", () => {
    expect(useSafetyStore.getState().rollbackEnabled).toBe(true);
  });

  it("setRollbackEnabled toggles flag", () => {
    useSafetyStore.getState().setRollbackEnabled(false);
    expect(useSafetyStore.getState().rollbackEnabled).toBe(false);
    useSafetyStore.getState().setRollbackEnabled(true);
    expect(useSafetyStore.getState().rollbackEnabled).toBe(true);
  });

  it("beginnerMode defaults to false", () => {
    expect(useSafetyStore.getState().beginnerMode).toBe(false);
  });

  it("setBeginnerMode toggles flag", () => {
    useSafetyStore.getState().setBeginnerMode(true);
    expect(useSafetyStore.getState().beginnerMode).toBe(true);
  });

  it("sessions is empty by default", () => {
    expect(useSafetyStore.getState().sessions).toHaveLength(0);
  });

  it("setSessions stores session list", () => {
    useSafetyStore.getState().setSessions([MOCK_SESSION]);
    expect(useSafetyStore.getState().sessions).toHaveLength(1);
    expect(useSafetyStore.getState().sessions[0].id).toBe("sess-1");
  });

  it("setSessions replaces previous list", () => {
    useSafetyStore.getState().setSessions([MOCK_SESSION]);
    useSafetyStore.getState().setSessions([]);
    expect(useSafetyStore.getState().sessions).toHaveLength(0);
  });

  it("setLoading updates loading flag", () => {
    useSafetyStore.getState().setLoading(true);
    expect(useSafetyStore.getState().loading).toBe(true);
    useSafetyStore.getState().setLoading(false);
    expect(useSafetyStore.getState().loading).toBe(false);
  });
});
