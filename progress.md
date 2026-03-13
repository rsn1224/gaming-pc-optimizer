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
6. ~~Phase 5: ゲームプロファイル機能~~ ✅ (2026-03-14 完了)
7. ~~Phase 6: 常駐型（システムトレイ・自動最適化）~~ ✅ (2026-03-14 完了)
8. ~~Phase 7: AI プロファイルコンテキストエクスポート~~ ✅ (2026-03-14 完了)
9. ~~Phase 8: My Games ライブラリ & プロファイル推薦 UI~~ ✅ (2026-03-14 完了)
10. ~~Phase 9: シームレス AI 推薦生成（Claude API 統合）~~ ✅ (2026-03-14 完了)
11. ~~Phase 10: Steam 自動スキャン & My Games メイン UI 化~~ ✅ (2026-03-14 完了)

### Phase 10 実装内容 (2026-03-14) — Steam 自動スキャン & My Games メイン UI 化

**Rustバックエンド** `src-tauri/src/commands/steam.rs` 新規

- `find_steam_root()`: HKLM/HKCU レジストリ → デフォルトパスのフォールバックで Steam を検出
- `library_steamapps_dirs()`: `libraryfolders.vdf` を解析して全ライブラリパスを収集
- `find_main_exe()`: installdir 内の .exe をスキャン、ヘルパー系を除外し最大サイズのものを返す
- `discover_steam_games()` Tauri コマンド: `appmanifest_*.acf` を全走査、StateFlags=4（完全インストール）のみ抽出
- `discover_and_create_steam_drafts()` Tauri コマンド: 未登録ゲームのドラフト GameProfile を自動作成・保存、全プロファイルを返す

**フロントエンド**

- `src/components/games/GameCard.tsx` 全面改訂:
  - モードバッジ → `<select>` ドロップダウンに変更（Competitive/Balanced/Quality）
  - 選択時に親の `onModeChange` を呼び出し（編集ボタン削除）
- `src/components/games/GamesLibrary.tsx` 全面改訂:
  - `MODE_PRESETS` マップ: モード → kill_bloatware/power_plan/windows_preset/... のプリセット
  - `handleSteamScan()`: スキャン → ドラフト作成 → APIキーあれば自動 AI チューニングまで一気に実行
  - `handleModeChange()`: モード選択時にプリセットをマージして `save_profile`
  - 「Steamスキャン」「AIチューニング」ボタン（未設定プロファイルがある時のみ AIチューニングボタン表示）
  - 空状態にも「Steamライブラリをスキャン」ボタンを配置
- `src/App.tsx`: ナビ順変更 — My Games が 2 番目、プロファイルが「詳細」バッジ付きで下位
- `src/types/index.ts`: `DiscoveredGame` 型追加

#### モードプリセット

| モード | kill_bloatware | power_plan | windows_preset | network_mode | dns_preset |
| --- | --- | --- | --- | --- | --- |
| competitive | true | ultimate | gaming | gaming | cloudflare |
| balanced | false | high_performance | gaming | none | none |
| quality | false | none | none | none | none |

### Phase 9 実装内容 (2026-03-14) — シームレス AI 推薦生成（Claude API 統合）

**Rustバックエンド** `src-tauri/src/commands/ai.rs` 新規

- `get_ai_api_key()` / `set_ai_api_key(key)`: `%APPDATA%\gaming-pc-optimizer\config.json` に保存
- `generate_ai_recommendations()`: Claude Haiku API 呼び出し → ドラフトプロファイルに推薦設定をマージ保存 → 全プロファイルを返す
- `reqwest = { version = "0.12", features = ["json", "rustls-tls"] }` を Cargo.toml に追加

**フロントエンド**

- `src/components/settings/Settings.tsx`: API キー入力欄（パスワード表示/非表示トグル + 保存済みフィードバック）追加
- `src/components/profiles/Profiles.tsx`: 「AI推薦を生成」ボタン（紫）+ AI ログ表示追加

### Phase 8 実装内容 (2026-03-14) — My Games ライブラリ & プロファイル推薦 UI

**Rustバックエンド** `src-tauri/src/commands/profiles.rs`

- `GameProfile` に 3 フィールド追加: `recommended_mode: Option<String>`, `recommended_reason: Option<String>`, `launcher: Option<String>`（`#[serde(default, skip_serializing_if = "Option::is_none")]` で後方互換）
- `launch_game(exe_path)` コマンド: exeの親ディレクトリを `current_dir` に設定して spawn、`Result<(), String>` でエラーをフロントに返す
- `export_profiles_context()` の CPU 二重フェッチ修正 → 単一 `System` インスタンスで統合
- `lib.rs` に `launch_game` 登録

**フロントエンド**

- `src/components/games/GameCard.tsx` 新規:
  - `detectLauncher()` ヒューリスティック（steam/epic/battlenet/custom）
  - `shortPath()` パス短縮（末尾2セグメント）
  - `MODE_CONFIG` → Competitive(赤)/Balanced(緑)/Quality(紫) バッジ
  - `recommended_mode` 未設定時のアンバー「AI未設定」バッジ
  - 「最適化して起動」ボタン（launching 中は Loader2 + 無効化）
- `src/components/games/GameFilters.tsx` 新規:
  - 検索フィールド（X クリアボタン付き）
  - タグチップ + モードチップ（Competitive/Balanced/Quality）
  - `hasAnyMode` prop で未設定プロファイルのみの場合はモードフィルター非表示
  - 「クリア」ボタン（いずれかフィルター適用時）
- `src/components/games/GamesLibrary.tsx` 新規:
  - `invoke("list_profiles")` でプロファイル読み込み
  - `useMemo` で `allTags`・`hasAnyMode` 算出
  - `launchLog` 5秒後自動クリア（`useEffect`）
  - `handleLaunchOptimize`: `apply_profile` → `launch_game`（exe_path あり時）
  - 編集ボタン: `setEditingProfileId(p.id)` + `setActivePage("profiles")` でプロファイル画面へ遷移
  - 空状態: 未登録 → プロファイルページへのリンク、フィルター一致なし → メッセージ
- `src/stores/useAppStore.ts`: `editingProfileId`・`setEditingProfileId` 追加
- `src/components/profiles/Profiles.tsx`: `editingProfileId` を監視し、My Games から遷移時に自動でモーダルを開く `useEffect` 追加
- `src/types/index.ts`: `GameProfile` に optional 3 フィールド追加、`ActivePage` に `"games"` 追加、`ProfilesContext`/`ProfilesContextProfile` 型追加
- `src/App.tsx`: My Games タブ（Library アイコン）追加、`GamesLibrary` コンポーネントルーティング追加
- `tauri.conf.json`: `"withGlobalTauri": true` 追加（DevTools で `window.__TAURI__` 有効化）

#### AI プロファイル生成プロンプトテンプレート

- `export_profiles_context()` の出力を Claude に貼り付けることで、ドラフトプロファイルの `recommended_mode`・`recommended_reason`・最適化設定を自動生成するプロンプトテンプレートを整備

### Phase 7 実装内容 (2026-03-14) — AI プロファイルコンテキストエクスポート

**Rustバックエンド** `src-tauri/src/commands/profiles.rs`

- `export_profiles_context()` Tauriコマンド: システム情報 + GPU + 全プロファイルを単一JSONへ出力
- `is_draft()` ヘルパー: 全設定が "none"/false なら true (構造体に追加せず動的算出)
- `available_options` を JSON に埋め込み: AI が有効な列挙値を把握できる
- `cpu_usage` を意図的に除外: 200ms の sleep ペナルティを回避
- `chrono_now()` + `unix_to_ymd_hms()`: chrono クレート不要の ISO-8601 タイムスタンプ生成
- `lib.rs` に `export_profiles_context` コマンドを登録

**フロントエンド**

- `src/types/index.ts` に `ProfilesContext` / `ProfilesContextProfile` 型定義追加
- `Profiles.tsx`: "ドラフト追加" クイックボタン → 名前+EXEのみ入力モーダル
- `Profiles.tsx`: ProfileCard にドラフトバッジ（amber）表示（全設定が none/false の場合）

### Phase 6 実装内容 (2026-03-14) — 常駐型（システムトレイ・自動最適化）

**Rustバックエンド**

- `src-tauri/src/commands/watcher.rs` 新規: autostart(winreg)、auto_optimize 状態、watcher_loop（4秒ポーリング）
- `src-tauri/src/lib.rs` 全面改訂: WatcherState + AppState、システムトレイメニュー（CheckMenuItem含む）、Close-to-tray、watcher_loop 起動
- `src-tauri/src/commands/power.rs`: power_backup.json でプラン GUID をバックアップ/復元
- `tauri-plugin-notification` でゲーム検出時/終了時にトースト通知
- `src-tauri/capabilities/default.json` 新規: notification 権限

**フロントエンド**

- `src/stores/useAppStore.ts`: activeProfileId, autoOptimize 状態追加
- `src/App.tsx`: active_profile_changed / auto_optimize_changed イベントリスナー、プロファイルタブにシアン点滅ドット
- `src/components/settings/Settings.tsx`: 自動起動トグル、自動最適化トグル
- `src/components/profiles/Profiles.tsx`: isActive prop → シアンボーダー + 適用中バッジ

### Phase 5 実装内容 (2026-03-14)

**Rustバックエンド** `src-tauri/src/commands/profiles.rs`

- `GameProfile` 構造体: id(UUID v4), name, exe_path, tags, kill_bloatware, power_plan, windows_preset, storage_mode, network_mode, dns_preset
- JSON永続化: `%APPDATA%\gaming-pc-optimizer\profiles.json`
- コマンド: `list_profiles`, `save_profile`, `delete_profile`, `apply_profile`
- `apply_profile`: 既存コマンドを順次呼び出し (kill_bloatware → 電源 → Windows → ストレージ → ネット → DNS)

**フロントエンド** `src/components/profiles/Profiles.tsx`

- プロファイル一覧（グリッド表示、name/exe_path/タグ/最適化バッジ）
- 「新規作成」ボタン → モーダルで全設定を編集
- 編集・削除ボタン（削除は confirm ダイアログ）
- 「このプロファイルを適用」ボタン → apply_profile 呼び出し → ログ表示
- `src/types/index.ts` に `GameProfile` 型定義追加
- `src/App.tsx` に「プロファイル」ナビタブ追加（BookMarked アイコン）

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

## Phase X-1/X-2 軽微改善（2026-03-14）

### タスク1: export_updates_context を Tauri コマンドとして公開
- `updates.rs` の `export_updates_context()` に `#[tauri::command]` を追加
- `lib.rs` に `updates::export_updates_context` を登録
- フロントエンド・デバッグから直接呼び出し可能に

### タスク2: suggested_power_limit_percent を UI に表示
- `Hardware.tsx` のAI推奨バナーに「推奨電力比: 0.80（参考値）」を追加
- `aiLog` メッセージにも推奨電力比を含める
- 実際の適用は従来どおり `MODE_CONFIG[mode].powerRatio` の固定比を使用

### タスク3: get_ai_hardware_mode プロンプトにマルチGPU前提を明示
- `ai.rs` のプロンプトに「gpus配列に複数GPUが含まれる場合でも GPU #0 を前提に推奨する」を追記
- `suggested_power_limit_percent` はアプリ側で固定比を使う旨を明記

### タスク4: updates.rs のエラーログ追加
- `check_app_updates` の winget spawn 失敗時に `eprintln!` でログ出力
- `upgrade_apps` の各アプリ失敗時・spawn エラー時に `eprintln!` でログ出力

## Phase: GameMode AI注釈対応（2026-03-14）

### 追加ファイル
- `src/types/index.ts`: `ProcessRiskLevel`, `ProcessAnnotation`, `AnnotatedProcess` 型を追加
- `src/data/process_knowledge.ts`: 33種 BLOATWARE_PROCESSES 全件のアノテーション知識ベース（将来AI拡充想定）

### 変更ファイル
- `src/components/optimization/GameMode.tsx`
  - `findAnnotation()` で ProcessInfo と知識ベースをマージし `AnnotatedProcess[]` を生成
  - ProcessRow コンポーネント: display_name / description / recommended_action / RiskBadge を表示
  - ProcessSummary バー: 「AI推奨: 停止OK N件 / 注意 M件」のサマリを一覧上部に表示
  - リスクバッジ: safe_to_kill=緑, caution=黄, keep=グレー

### 設計方針
- 知識ベース（PROCESS_KNOWLEDGE[]）は TypeScript 配列で管理。JSON移行容易な構造
- 注釈のないプロセスは従来通り exe名・PID・リソースのみ表示（既存挙動を壊さない）
- 実際の停止ロジックは変更なし
