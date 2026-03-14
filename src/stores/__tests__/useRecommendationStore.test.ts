/**
 * useRecommendationStore — unit tests
 *
 * Tauri invoke は vi.mock でスタブ化する。
 * 実際の API 呼び出しは行わない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecommendationStore } from "../useRecommendationStore";
import type {
  RecommendationInput,
  RecommendationResult,
} from "@/types";

// ── Mock Tauri ────────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockedInvoke = vi.mocked(invoke);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(): RecommendationInput {
  return {
    intent: "fps",
    system: { osVersion: "Windows 11", cpu: "Intel i7", memoryGb: 16 },
  };
}

function makeResult(model = "claude-haiku", fallback = false): RecommendationResult {
  return {
    items: [
      {
        id: "power_plan",
        title: "電源プラン最適化",
        reason: "CPUクロックを最大化",
        confidence: 0.85,
        expectedImpact: { fps: 5, latencyMs: -10 },
        riskLevel: "safe",
      },
    ],
    summary: "テスト推奨サマリー",
    model,
    fallbackUsed: fallback,
    generatedAt: "2026-03-14T12:00:00Z",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useRecommendationStore", () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useRecommendationStore.setState({
      result: null,
      metrics: null,
      history: [],
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  // Initial state

  it("has correct initial state", () => {
    const { result } = renderHook(() => useRecommendationStore());
    expect(result.current.result).toBeNull();
    expect(result.current.metrics).toBeNull();
    expect(result.current.history).toHaveLength(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // generate — success path

  it("sets loading=true during generate then false on success", async () => {
    const rec = makeResult();
    mockedInvoke.mockResolvedValueOnce(rec);

    const { result } = renderHook(() => useRecommendationStore());

    let generatePromise!: Promise<void>;
    act(() => {
      generatePromise = result.current.generate(makeInput());
    });
    expect(result.current.loading).toBe(true);

    await act(async () => { await generatePromise; });
    expect(result.current.loading).toBe(false);
    expect(result.current.result).toEqual(rec);
    expect(result.current.error).toBeNull();
  });

  it("appends result to history on success", async () => {
    const rec1 = makeResult("haiku");
    const rec2 = makeResult("rule_based_v1", true);
    mockedInvoke.mockResolvedValueOnce(rec1).mockResolvedValueOnce(rec2);

    const { result } = renderHook(() => useRecommendationStore());

    await act(async () => { await result.current.generate(makeInput()); });
    await act(async () => { await result.current.generate(makeInput()); });

    expect(result.current.history).toHaveLength(2);
    // most recent first
    expect(result.current.history[0].model).toBe("rule_based_v1");
    expect(result.current.history[1].model).toBe("haiku");
  });

  it("caps history at 10 entries", async () => {
    mockedInvoke.mockResolvedValue(makeResult());
    const { result } = renderHook(() => useRecommendationStore());

    for (let i = 0; i < 12; i++) {
      await act(async () => { await result.current.generate(makeInput()); });
    }
    expect(result.current.history.length).toBeLessThanOrEqual(10);
  });

  // generate — error path

  it("sets error and clears loading on invoke failure", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("ENABLE_RECOMMENDATION_V2 is disabled"));

    const { result } = renderHook(() => useRecommendationStore());
    await act(async () => { await result.current.generate(makeInput()); });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toContain("ENABLE_RECOMMENDATION_V2");
    expect(result.current.result).toBeNull();
  });

  // clearResult

  it("clearResult nulls result without affecting history", async () => {
    mockedInvoke.mockResolvedValueOnce(makeResult());
    const { result } = renderHook(() => useRecommendationStore());

    await act(async () => { await result.current.generate(makeInput()); });
    expect(result.current.result).not.toBeNull();

    act(() => { result.current.clearResult(); });
    expect(result.current.result).toBeNull();
    expect(result.current.history).toHaveLength(1); // history preserved
  });

  // clearError

  it("clearError nulls error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("API error"));
    const { result } = renderHook(() => useRecommendationStore());

    await act(async () => { await result.current.generate(makeInput()); });
    expect(result.current.error).not.toBeNull();

    act(() => { result.current.clearError(); });
    expect(result.current.error).toBeNull();
  });

  // fetchMetrics

  it("fetchMetrics sets metrics on success", async () => {
    const summary = { rangeHours: 24, models: [] };
    mockedInvoke.mockResolvedValueOnce(summary);

    const { result } = renderHook(() => useRecommendationStore());
    await act(async () => { await result.current.fetchMetrics(24); });

    expect(result.current.metrics).toEqual(summary);
  });

  it("fetchMetrics silently ignores errors", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useRecommendationStore());
    await act(async () => { await result.current.fetchMetrics(); });

    // Should not throw and error state should remain null
    expect(result.current.error).toBeNull();
  });

  // generate clears previous error

  it("generate clears previous error before attempting", async () => {
    mockedInvoke
      .mockRejectedValueOnce(new Error("first error"))
      .mockResolvedValueOnce(makeResult());

    const { result } = renderHook(() => useRecommendationStore());

    await act(async () => { await result.current.generate(makeInput()); });
    expect(result.current.error).not.toBeNull();

    await act(async () => { await result.current.generate(makeInput()); });
    expect(result.current.error).toBeNull();
    expect(result.current.result).not.toBeNull();
  });
});
