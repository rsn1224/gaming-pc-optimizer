# Gaming PC Optimizer - 作業進捗

## Phase 1: ゲームモード（MVP）

### 完了タスク

#### 2026-03-13 作業開始

**プロジェクトスキャフォールド** ✅
- `package.json` - 依存関係設定（React 19, Tauri 2, Zustand, Framer Motion, Lucide, Recharts）
- `index.html`
- `vite.config.ts` - パスエイリアス `@/` 設定
- `tsconfig.json` / `tsconfig.node.json` - strict モード
- `tailwind.config.ts` + `postcss.config.js`

**Reactフロントエンド** ✅
- `src/types/index.ts` - SystemInfo, ProcessInfo, KillResult 型定義
- `src/stores/useAppStore.ts` - Zustand ストア
- `src/hooks/useSystemInfo.ts` - 3秒間隔でシステム情報取得
- `src/lib/utils.ts` - cn, formatMemory, getUsageColor
- `src/index.css` - ダークテーマ CSS変数
- `src/components/ui/progress-bar.tsx` - 使用率バー
- `src/components/ui/stat-card.tsx` - CPU/RAM カード
- `src/components/dashboard/Dashboard.tsx` - ダッシュボード画面
- `src/components/optimization/GameMode.tsx` - ゲームモード画面（メイン機能）
- `src/components/optimization/ComingSoon.tsx` - Phase 2-4 プレースホルダー
- `src/App.tsx` - サイドバーナビゲーション + ルーティング
- `src/main.tsx` - エントリーポイント

**Rustバックエンド** ✅（エージェント作業中）
- `src-tauri/Cargo.toml` - sysinfo, winreg, tokio 依存関係
- `src-tauri/build.rs` - requireAdministrator マニフェスト
- `src-tauri/tauri.conf.json` - ウィンドウ設定
- `src-tauri/src/main.rs` / `lib.rs`
- `src-tauri/src/commands/process.rs` - get_running_processes, kill_bloatware（33種リスト移植済み）
- `src-tauri/src/commands/power.rs` - get_current_power_plan, set_ultimate_performance
- `src-tauri/src/commands/system_info.rs` - get_system_info

### 解決済みの問題

- **STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139)**: `build.rs` の `requireAdministrator` マニフェストが原因。`tauri_build::build()` に簡略化して解決。
- 管理者権限が必要なコマンド（powercfg, kill）は実行時に Windows が昇格ダイアログを表示するため、開発時は requireAdministrator 不要。

### 次のステップ

1. ~~`npm install` で依存関係インストール~~ ✅
2. ~~`cargo tauri dev` でアプリ起動確認~~ ✅ (2026-03-13 解決)
3. ~~Phase 2: Windows設定（winreg crate）~~ ✅ (2026-03-13 完了)
4. ~~Phase 3: ストレージ管理~~ ✅ (2026-03-13 完了)
5. ~~Phase 4: ネットワーク最適化~~ ✅ (2026-03-13 完了)
6. 全 Phase 完了 🎉

### Phase 2 実装内容 (2026-03-13)

**Rustバックエンド** `src-tauri/src/commands/windows_settings.rs`

- `get_windows_settings` → VisualFX / 透明効果 / Game DVR / MenuShowDelay / アニメーション を HKCU から読み取り
- `set_visual_fx(mode)` / `set_transparency(enabled)` / `set_game_dvr(enabled)` / `set_menu_show_delay(delay_ms)` / `set_animate_windows(enabled)` → 個別セッター
- `apply_gaming_windows_settings` → 現在値をバックアップ (`%APPDATA%\gaming-pc-optimizer\settings_backup.json`) してからゲーミング最適値を一括適用
- `restore_windows_settings` → バックアップから復元、なければ Windows デフォルト値に戻す
- `has_windows_settings_backup` → バックアップ有無チェック（UIの状態表示に使用）

**フロントエンド** `src/components/optimization/WindowsSettings.tsx`

- 個別トグル（楽観的更新 → rollback）
- VisualFX ラジオボタン選択
- MenuShowDelay スライダー（0–400ms）
- 「ゲーミング最適化を適用」「復元/デフォルト」ボタン
- 最適化済みバッジ（バックアップ存在時）

### 技術スタック

| レイヤー | 技術 |
|--------|------|
| フレームワーク | Tauri 2.0 |
| フロントエンド | React 19 + TypeScript 5 + Vite 6 |
| UI | Tailwind CSS 3 + shadcn/ui スタイル + Lucide Icons |
| アニメーション | Framer Motion |
| 状態管理 | Zustand 5 |
| バックエンド | Rust + sysinfo + winreg |

### 既存コードからの移植ポイント

- `gaming_optimizer.py` の `BLOATWARE_PROCESSES`（33種）→ `commands/process.rs` の定数配列
- `game_mode_activate()` → `kill_bloatware` Tauriコマンド
- `optimize_power_plan()` → `set_ultimate_performance` コマンド（powercfg経由）
- `optimize_visual_fx()` → `apply_gaming_windows_settings` コマンド（winreg経由）
- バックアップ機構: `apply_gaming_windows_settings` 実行時に `%APPDATA%\gaming-pc-optimizer\settings_backup.json` へ保存

### 注意事項

- `build.rs` の `requireAdministrator` は削除済み（STATUS_ENTRYPOINT_NOT_FOUND 対策）
- winreg は HKCU のみ書き込み → 管理者権限不要
- テスト環境では管理者・非管理者両方で確認推奨
