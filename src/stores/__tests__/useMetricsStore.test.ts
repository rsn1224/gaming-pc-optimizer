import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMetricsStore } from "../useMetricsStore";
import type { SimulationResult, AllOptimizationResult } from "@/types";

const MOCK_SIMULATION: SimulationResult = {
  changes: [],
  safe_count: 3,
  caution_count: 1,
  advanced_count: 0,
  session_id: "sim-session-1",
};

const MOCK_OPT_RESULT: AllOptimizationResult = {
  process_killed: 2,
  process_freed_mb: 128.5,
  power_plan_set: true,
  windows_applied: false,
  network_applied: true,
  errors: [],
};

describe("useMetricsStore", () => {
  beforeEach(() => {
    useMetricsStore.setState({
      simulation: null,
      onConfirm: null,
      lastOptResult: null,
      executing: false,
    });
  });

  // ── 編集状態 (Editing State) ──────────────────────────────────────────────

  it("simulation is null by default", () => {
    expect(useMetricsStore.getState().simulation).toBeNull();
  });

  it("setSimulation stores simulation result", () => {
    useMetricsStore.getState().setSimulation(MOCK_SIMULATION);
    const sim = useMetricsStore.getState().simulation;
    expect(sim).not.toBeNull();
    expect(sim?.safe_count).toBe(3);
    expect(sim?.caution_count).toBe(1);
    expect(sim?.session_id).toBe("sim-session-1");
  });

  it("setSimulation accepts null to dismiss dialog", () => {
    useMetricsStore.getState().setSimulation(MOCK_SIMULATION);
    useMetricsStore.getState().setSimulation(null);
    expect(useMetricsStore.getState().simulation).toBeNull();
  });

  it("onConfirm is null by default", () => {
    expect(useMetricsStore.getState().onConfirm).toBeNull();
  });

  it("setOnConfirm stores async callback", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    useMetricsStore.getState().setOnConfirm(fn);
    const stored = useMetricsStore.getState().onConfirm;
    expect(stored).not.toBeNull();
    await stored!();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("setOnConfirm accepts null to clear callback", () => {
    useMetricsStore.getState().setOnConfirm(vi.fn().mockResolvedValue(undefined));
    useMetricsStore.getState().setOnConfirm(null);
    expect(useMetricsStore.getState().onConfirm).toBeNull();
  });

  // ── 実行状態 (Execution State) ────────────────────────────────────────────

  it("executing is false by default", () => {
    expect(useMetricsStore.getState().executing).toBe(false);
  });

  it("setExecuting toggles executing flag", () => {
    useMetricsStore.getState().setExecuting(true);
    expect(useMetricsStore.getState().executing).toBe(true);
    useMetricsStore.getState().setExecuting(false);
    expect(useMetricsStore.getState().executing).toBe(false);
  });

  it("lastOptResult is null by default", () => {
    expect(useMetricsStore.getState().lastOptResult).toBeNull();
  });

  it("setLastOptResult stores optimization result", () => {
    useMetricsStore.getState().setLastOptResult(MOCK_OPT_RESULT);
    expect(useMetricsStore.getState().lastOptResult?.process_killed).toBe(2);
    expect(useMetricsStore.getState().lastOptResult?.network_applied).toBe(true);
  });

  it("setLastOptResult accepts null to clear", () => {
    useMetricsStore.getState().setLastOptResult(MOCK_OPT_RESULT);
    useMetricsStore.getState().setLastOptResult(null);
    expect(useMetricsStore.getState().lastOptResult).toBeNull();
  });
});
