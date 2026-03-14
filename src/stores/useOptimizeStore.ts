/**
 * useOptimizeStore — Safety Kernel フェーズ状態管理 (Sprint 1 / S1-06)
 *
 * 責務:
 *   [フェーズ]      phase (SafeApplyPhase)
 *   [チェック結果]  preCheckResult / verifyResult
 *   [監査ログ]      auditLog (フロントエンドキャッシュ)
 *   [テレメトリ]    sessionTelemetry
 */
import { create } from "zustand";
import type {
  SafeApplyPhase,
  PreCheckResult,
  VerifyResult,
  AuditLogEntry,
  TelemetryRecord,
} from "@/types";

interface OptimizeStore {
  // ── フェーズ ──────────────────────────────────────────────────────────────
  phase: SafeApplyPhase;
  setPhase: (phase: SafeApplyPhase) => void;

  // ── プリチェック結果 ──────────────────────────────────────────────────────
  preCheckResult: PreCheckResult | null;
  setPreCheckResult: (result: PreCheckResult | null) => void;

  // ── 検証結果 ──────────────────────────────────────────────────────────────
  verifyResult: VerifyResult | null;
  setVerifyResult: (result: VerifyResult | null) => void;

  // ── エラーメッセージ ──────────────────────────────────────────────────────
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;

  // ── 監査ログ (UIキャッシュ) ────────────────────────────────────────────────
  auditLog: AuditLogEntry[];
  setAuditLog: (entries: AuditLogEntry[]) => void;
  appendAuditEntry: (entry: AuditLogEntry) => void;

  // ── テレメトリ (直近セッション) ───────────────────────────────────────────
  sessionTelemetry: TelemetryRecord[];
  setSessionTelemetry: (records: TelemetryRecord[]) => void;

  // ── リセット ──────────────────────────────────────────────────────────────
  reset: () => void;
}

export const useOptimizeStore = create<OptimizeStore>((set) => ({
  phase: "idle",
  setPhase: (phase) => set({ phase }),

  preCheckResult: null,
  setPreCheckResult: (result) => set({ preCheckResult: result }),

  verifyResult: null,
  setVerifyResult: (result) => set({ verifyResult: result }),

  errorMessage: null,
  setErrorMessage: (msg) => set({ errorMessage: msg }),

  auditLog: [],
  setAuditLog: (entries) => set({ auditLog: entries }),
  appendAuditEntry: (entry) =>
    set((s) => ({ auditLog: [entry, ...s.auditLog].slice(0, 200) })),

  sessionTelemetry: [],
  setSessionTelemetry: (records) => set({ sessionTelemetry: records }),

  reset: () =>
    set({
      phase: "idle",
      preCheckResult: null,
      verifyResult: null,
      errorMessage: null,
      sessionTelemetry: [],
    }),
}));
