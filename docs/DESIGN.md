# Gaming PC Optimizer — 設計書 v1.2.0

> 最終更新: 2026-03-15

---

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│                   Tauri Shell                        │
│  ┌───────────────────┐   ┌────────────────────────┐ │
│  │   React Frontend  │   │    Rust Backend         │ │
│  │  (WebView)        │◄──►  (Native Process)       │ │
│  │                   │   │                         │ │
│  │  React 19         │   │  Tauri 2 Commands       │ │
│  │  TypeScript       │   │  Tokio Async Runtime    │ │
│  │  Zustand          │   │  SQLite (telemetry)     │ │
│  │  Tailwind CSS     │   │  Windows Registry API   │ │
│  │  Recharts         │   │  sysinfo                │ │
│  │  Framer Motion    │   │  keyring                │ │
│  └───────────────────┘   └────────────────────────┘ │
│                                                       │
│  ┌───────────────────────────────────────────────┐   │
│  │             System Tray + Background Watcher  │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   GitHub Releases          AI API
   (latest.json)      (Anthropic / OpenAI)
```

---

## 2. フロントエンド設計

### 2.1 ディレクトリ構成

```
src/
├── App.tsx                   # ルートコンポーネント・ナビゲーション・グローバル監視
├── main.tsx                  # React エントリーポイント
├── config/
│   └── features.ts           # フィーチャーフラグ（全FF一元管理）
├── components/
│   ├── dashboard/            # ホーム・ダッシュボード
│   ├── optimization/         # 最適化系 UI
│   ├── network/              # ネットワーク系
│   ├── games/                # ゲームライブラリ・セッション
│   ├── profiles/             # プロファイル管理
│   ├── hardware/             # ハードウェア監視
│   ├── benchmark/            # ベンチマーク
│   ├── rollback/             # ロールバックセンター
│   ├── policies/             # ポリシーエンジン
│   ├── settings/             # 設定（テーマ・ホットキー等）
│   ├── updates/              # アップデート管理
│   ├── onboarding/           # 初回ウィザード
│   ├── osd/                  # ゲーム内オーバーレイ
│   ├── about/                # バージョン情報
│   └── ui/                   # 共通コンポーネント
├── stores/                   # Zustand ストア
├── types/
│   └── index.ts              # 全型定義（~1100行）
└── lib/
    └── utils.ts              # 共通ユーティリティ（cn 等）
```

### 2.2 状態管理設計

```
useAppStore          ─── ナビゲーション・最適化実行状態・APIキー有無
useWatcherStore      ─── 自動最適化フラグ・アクティブプロファイル
useSafetyStore       ─── ロールバックセッション・ビギナーモード
useSystemStore       ─── システム情報キャッシュ
useMetricsStore      ─── リアルタイムメトリクス
useRecommendationStore ── AI推奨結果キャッシュ
useOptimizeStore     ─── 最適化フロー（Idle→Running→Done）
useEditingStore      ─── プロファイル編集中フラグ
usePolicyStore       ─── ポリシー一覧
useToastStore        ─── トースト通知キュー
```

**設計原則**: Tauri コマンドの呼び出しはコンポーネント内で直接行う。ストアはサーバー状態ではなく UI/セッション状態のみ保持する。

### 2.3 ページルーティング

URL ベースのルーターは使わず、`useAppStore.activePage` によるコンポーネント切り替え方式。

```typescript
type ActivePage =
  | "home" | "optimize" | "presets" | "process"
  | "windows" | "storage" | "network" | "games"
  | "profiles" | "gamelog" | "advisor" | "gameintegrity"
  | "hardware" | "benchmark" | "rollback" | "policies"
  | "graph" | "startup" | "scheduler" | "uninstaller"
  | "updates" | "notifications" | "settings" | "about"
```

### 2.4 コンポーネント設計原則

1. **Hub パターン**: 各カテゴリの最上位に `*Hub` コンポーネントを置き、内部でタブ切り替え
2. **Feature Flag**: `src/config/features.ts` の定数で機能を ON/OFF
3. **エラー通知**: `alert()` 禁止。`toast.error()` / `toast.success()` のみ使用
4. **管理者権限エラー**: `AdminErrorBanner` コンポーネントで「管理者として再起動」誘導

---

## 3. バックエンド設計

### 3.1 ディレクトリ構成

```
src-tauri/src/
├── lib.rs              # アプリエントリー・プラグイン登録・invoke_handler・トレイ設定
├── error.rs            # AppError 型定義
├── macros.rs（lib.rs内）# win_cmd! マクロ（CREATE_NO_WINDOW）
└── commands/
    ├── mod.rs          # pub mod 一覧
    ├── runner.rs       # CommandRunner trait（SystemRunner/MockRunner）
    ├── optimizer.rs    # 最適化コア
    ├── ai.rs           # AI統合（ai_router/ai_safety/ai_schema/ai_metrics）
    ├── watcher.rs      # バックグラウンドループ
    ├── safety_kernel.rs # プリチェック・検証
    ├── rollback.rs     # セッション管理
    ├── policy.rs       # ポリシーエンジン
    ├── update_check.rs # アップデートチェック（GitHub API）
    └── [その他 50 モジュール]
```

### 3.2 コマンド実行パターン

```rust
// パターン1: CommandRunner 経由（テスト可能）
pub fn some_command(runner: &impl CommandRunner) -> Result<..> {
    let (code, stdout, _) = runner.run("powercfg", &["/list"])?;
    ...
}

// パターン2: win_cmd! マクロ直接使用（一時的なコマンド）
let out = crate::win_cmd!("powershell")
    .args(["-NoProfile", "-Command", "..."])
    .output()?;

// パターン3: 非同期 Tauri コマンド
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> { ... }
```

### 3.3 `win_cmd!` マクロ

すべての外部プロセス起動は `win_cmd!` を使う。`std::process::Command::new` の直接使用禁止。

```rust
// lib.rs に定義
macro_rules! win_cmd {
    ($program:expr) => {{
        let mut _cmd = std::process::Command::new($program);
        #[cfg(target_os = "windows")]
        { _cmd.creation_flags(0x08000000); } // CREATE_NO_WINDOW
        _cmd
    }};
}
```

### 3.4 データ永続化

| データ | 保存場所 | 形式 |
|---|---|---|
| ゲームプロファイル | `%APPDATA%/gaming-pc-optimizer/profiles.json` | JSON |
| 最適化セッション | `%APPDATA%/gaming-pc-optimizer/sessions.json` | JSON |
| テレメトリー | `%APPDATA%/gaming-pc-optimizer/telemetry.db` | SQLite |
| ゲームセッションログ | `%APPDATA%/gaming-pc-optimizer/game_log.json` | JSON |
| ポリシー | `%APPDATA%/gaming-pc-optimizer/policies.json` | JSON |
| 監査ログ | `%APPDATA%/gaming-pc-optimizer/audit_log.json` | JSON |
| イベントログ | `%APPDATA%/gaming-pc-optimizer/event_log.json` | JSON |
| ベンチマーク履歴 | `%APPDATA%/gaming-pc-optimizer/benchmark_history.json` | JSON |
| ホットキー設定 | `%APPDATA%/gaming-pc-optimizer/hotkeys.json` | JSON |
| アプリ外観設定 | `%APPDATA%/gaming-pc-optimizer/appearance.json` | JSON |
| AI API キー | Windows 認証情報マネージャー | keyring |

### 3.5 バックグラウンドウォッチャー（watcher.rs）

```
watcher_loop() ─── 2〜4 秒ごとに以下をチェック:
  ├── 実行中プロセスのスキャン（ゲーム検知）
  ├── GPU 温度チェック（85℃超で自動低電力）
  ├── スコア回帰チェック（5分ごと、15点以上の低下で通知）
  └── ポリシーエンジン評価（各ポリシーのトリガー条件を確認）
```

### 3.6 AI ルーター（ai_router.rs）

```
AI 呼び出しフロー:
  1. プロバイダー確認（anthropic / openai）
  2. APIキー取得（keyring）
  3. モデル選択（Anthropic: claude-* / OpenAI: gpt-4o等）
  4. システムプロンプト + コンテキスト構築
  5. HTTP リクエスト（reqwest）
  6. レスポンスのJSONパース
  7. ai_safety.rs で結果検証
  8. ai_metrics.rs で使用量記録
```

### 3.7 ロールバックシステム

```
OptimizationSession {
  id: UUID
  started_at / ended_at: ISO8601
  status: "applied" | "rolled_back" | "partial"
  changes: ChangeRecord[]  ← 適用前の値を保存
  snapshot: {              ← 適用前の全設定スナップショット
    power_plan_guid,
    windows_settings,
    network_settings,
    processes_killed[]
  }
}

restore_session(id):
  1. セッション読み込み
  2. snapshot の各値を逆順で復元
  3. ステータスを "rolled_back" に更新
```

---

## 4. プラグイン・依存関係

### 4.1 Tauri プラグイン

| プラグイン | 用途 |
|---|---|
| tauri-plugin-shell | シェルコマンド実行 |
| tauri-plugin-notification | システム通知 |
| tauri-plugin-updater | 自動アップデート |
| tauri-plugin-process | アプリ再起動（relaunch） |

### 4.2 主要 Rust クレート

| クレート | 用途 |
|---|---|
| sysinfo 0.33 | CPU・メモリ・プロセス情報 |
| winreg 0.55 | Windows レジストリ R/W |
| tokio 1 | 非同期ランタイム |
| reqwest 0.12 | HTTP（AI API・GitHub API） |
| keyring 3 | OS 認証情報への安全なアクセス |
| rusqlite 0.31 | SQLite（テレメトリー DB） |
| chrono 0.4 | 日時処理 |
| cron 0.12 | スケジュール式パース |
| uuid 1 | セッション ID 生成 |

### 4.3 主要 npm パッケージ

| パッケージ | 用途 |
|---|---|
| react 19 | UI フレームワーク |
| zustand 5 | 軽量状態管理 |
| recharts 2 | スコア・メトリクスグラフ |
| framer-motion 11 | ページ遷移・アニメーション |
| lucide-react | アイコン |
| tailwindcss 3 | ユーティリティ CSS |

---

## 5. 自動アップデートフロー

```
1. アプリ起動時に UpdateChecker が check() を呼び出す
2. tauri-plugin-updater が latest.json を取得
   └── https://raw.githubusercontent.com/rsn1224/gaming-pc-optimizer/main/latest.json
3. バージョン比較（semver）
4. 更新あり → 「ダウンロード & インストール」ボタンを表示
5. ユーザーがボタン押下 → downloadAndInstall() 実行
   └── 進捗バー表示（Started→Progress→Finished イベント）
6. 署名検証（minisign 公開鍵）
7. インストール完了 → relaunch() で自動再起動

リリース手順:
  1. Cargo.toml / tauri.conf.json のバージョンを上げる
  2. TAURI_SIGNING_PRIVATE_KEY_PATH 設定してビルド
     OR: npx tauri build → npx tauri signer sign -f <key> -p "" <exe>
  3. GitHub Release に .exe と .sig をアップロード
  4. latest.json を更新してプッシュ（main ブランチ）
```

---

## 6. フィーチャーフラグ管理

`src/config/features.ts` に全フラグを一元管理。

```typescript
// ON にする際のチェックリスト:
// 1. features.ts のフラグを true に変更
// 2. 対応する Rust コマンドが lib.rs の invoke_handler に登録されているか確認
// 3. ビルドして動作確認
// 4. ドキュメント更新
```

| フラグ | 現在値 | 次期予定 |
|---|---|---|
| ENABLE_MULTI_LAUNCHER | false | **true へ** |
| ENABLE_HAGS_DISPLAY_OPTIMIZER | false | **true へ** |
| ENABLE_BENCHMARK_HISTORY | false | **true へ** |
| ENABLE_RECOMMENDATION_V2_UI | false | 検討中 |
| ENABLE_FRAMETIME_OVERLAY_UI | false | 検討中 |
| ENABLE_PROFILE_SSOT | false | 削除検討 |
| ENABLE_GLOBAL_ROLLBACK_HEADER | false | 削除検討 |
| ENABLE_PROFILE_PREVIEW | false | 削除検討 |

---

## 7. ビルド・リリースフロー

```
開発:
  npm run dev          # Vite dev server + Tauri dev window

テスト:
  npx tsc --noEmit     # TypeScript 型チェック
  cargo check          # Rust コンパイルチェック
  cargo test           # Rust ユニットテスト
  npm run test         # Vitest（フロントエンドテスト）

リリースビルド:
  npx tauri build      # dist/ + src-tauri/target/release/bundle/

署名（必須）:
  npx tauri signer sign -f ~/.tauri/gaming-pc-optimizer.key -p "" <installer.exe>

配布物:
  Gaming PC Optimizer_X.Y.Z_x64-setup.exe   # NSIS インストーラー
  Gaming PC Optimizer_X.Y.Z_x64-setup.exe.sig  # 署名
  Gaming PC Optimizer_X.Y.Z_x64_en-US.msi   # MSI（参考）
```

---

## 8. テスト設計

### 8.1 現在のテスト範囲

| テスト | 場所 | 内容 |
|---|---|---|
| Rust ユニットテスト | `runner.rs` | MockRunner の動作確認 |
| Rust ユニットテスト | `example.rs` | serde camelCase 確認 |
| Vitest | `useSystemStore.test.ts` | ストアの初期値確認 |

### 8.2 次期追加が必要なテスト

```
Rust:
  - compare_versions() のエッジケース
  - rollback.rs のセッション操作
  - safety_kernel.rs のプリチェック結果

TypeScript:
  - UpdateChecker のステート遷移
  - Zustand ストアの CRUD
  - App.tsx のページ遷移
```

---

## 9. 技術負債・改善項目

| 項目 | 優先度 | 詳細 |
|---|---|---|
| package.json の version が 1.1.0 のまま | 低 | Cargo.toml と同期必要（次回ビルドで修正） |
| `use std::process::Command` の残存 | ✅ 修正済 | win_cmd! マクロで一括対応 |
| GamesLibrary のローカル FF 上書き | 低 | features.ts の値と二重管理になっている |
| OSD ウィンドウの hash ベース判定 | 中 | `window.location.hash === "#/osd"` は脆弱 |
| AI キー検証の非同期処理 | 低 | エラーハンドリングが粗い箇所あり |
| update_check.rs が残存 | 低 | tauri-plugin-updater 移行後も旧コマンドが残っている |
| AboutPage のハードコード履歴 | 低 | スプリント履歴が手動管理 |
| レガシー Dashboard/DashboardV2 | 低 | HomeHub に統合後も旧コンポーネントが残っている |

---

## 10. セキュリティ設計

```
外部プロセス:
  - 全コマンドに CREATE_NO_WINDOW (0x08000000) を適用（win_cmd! マクロ）
  - コマンドインジェクション対策: args() で配列渡し、文字列結合禁止

認証情報:
  - AI API キーは keyring（OS の認証情報マネージャー）のみに保存
  - localStorage / ファイルへの平文保存禁止

更新署名:
  - minisign キーペア（~/.tauri/gaming-pc-optimizer.key）で署名
  - 公開鍵は tauri.conf.json に埋め込み
  - 秘密鍵は絶対にリポジトリにコミットしない

CSP:
  - 現在: null（無効）
  - 次期: 適切な CSP ヘッダーを設定する
```
