/**
 * usePolicyStore — Policy Engine 状態管理 (Sprint 3 / S3-04)
 *
 * 責務:
 *   [ポリシーリスト]  policies (UIキャッシュ)
 *   [ローディング]    loading
 *   [編集中]          editingPolicy
 */
import { create } from "zustand";
import type { Policy } from "@/types";

interface PolicyStore {
  policies: Policy[];
  setPolicies: (policies: Policy[]) => void;
  updatePolicy: (policy: Policy) => void;
  removePolicy: (id: string) => void;

  loading: boolean;
  setLoading: (v: boolean) => void;

  editingPolicy: Policy | null;
  setEditingPolicy: (policy: Policy | null) => void;
}

export const usePolicyStore = create<PolicyStore>((set) => ({
  policies: [],
  setPolicies: (policies) => set({ policies }),
  updatePolicy: (policy) =>
    set((s) => ({
      policies: s.policies.some((p) => p.id === policy.id)
        ? s.policies.map((p) => (p.id === policy.id ? policy : p))
        : [...s.policies, policy],
    })),
  removePolicy: (id) =>
    set((s) => ({ policies: s.policies.filter((p) => p.id !== id) })),

  loading: false,
  setLoading: (v) => set({ loading: v }),

  editingPolicy: null,
  setEditingPolicy: (policy) => set({ editingPolicy: policy }),
}));
