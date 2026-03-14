/**
 * useEditingStore — 編集状態 (Editing State)
 *
 * 責務: ユーザーが「現在編集中」の対象を保持する。
 *       まだ適用・確定されていない in-progress 状態のみ格納する。
 *
 * 実行状態 (gameModeActive, optimizationStatus など) は useAppStore / useWatcherStore 参照。
 * シミュレーション確認待ち状態 (simulation, onConfirm) は useMetricsStore 参照。
 *
 * [STORE_REFACTOR] このストアは Phase 3 で useAppStore から editingProfileId を分離した結果。
 * 将来的に「編集中のプリセット」「編集中のスケジューラー」などもここに集約する。
 */

import { create } from "zustand";

// ── State ─────────────────────────────────────────────────────────────────────

interface EditingStore {
  /**
   * My ゲーム画面から「Profiles で設定」リンクで遷移する際にセットするプロファイル ID。
   * ProfilesHub がマウント後にこの ID を読み取り、対象プロファイルの編集モーダルを自動展開する。
   * 編集モーダルを開いた後は null にリセットする。
   */
  editingProfileId: string | null;
  setEditingProfileId: (id: string | null) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEditingStore = create<EditingStore>((set) => ({
  editingProfileId: null,
  setEditingProfileId: (id) => set({ editingProfileId: id }),
}));
