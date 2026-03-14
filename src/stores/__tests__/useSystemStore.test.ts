import { beforeEach, describe, expect, it } from "vitest";
import { useSystemStore } from "../useSystemStore";
import type { SystemInfo } from "@/types";

const DUMMY_INFO: SystemInfo = {
  cpu_usage: 42.5,
  cpu_name: "Intel Core i9",
  cpu_cores: 16,
  memory_total_mb: 32768,
  memory_used_mb: 16384,
  memory_percent: 50,
  os_name: "Windows",
  os_version: "11",
};

describe("useSystemStore", () => {
  beforeEach(() => {
    useSystemStore.setState({ systemInfo: null, currentPowerPlan: "" });
  });

  it("setSystemInfo stores system info", () => {
    useSystemStore.getState().setSystemInfo(DUMMY_INFO);
    const stored = useSystemStore.getState().systemInfo;
    expect(stored?.cpu_name).toBe("Intel Core i9");
    expect(stored?.cpu_cores).toBe(16);
    expect(stored?.memory_percent).toBe(50);
  });

  it("setCurrentPowerPlan stores power plan string", () => {
    useSystemStore.getState().setCurrentPowerPlan("Ultimate Performance");
    expect(useSystemStore.getState().currentPowerPlan).toBe("Ultimate Performance");
  });

  it("systemInfo is null by default", () => {
    expect(useSystemStore.getState().systemInfo).toBeNull();
  });
});
