# Gaming PC Optimizer

Windows向けゲーミングPC最適化ツール（Tauri v2 + Rust + React/TypeScript）。

## 機能

- 不要プロセスの一括停止
- Ultimate Performance 電源プランへの切替と自動復元
- ゲーミング向け Windows レジストリ設定最適化
- DNS プリセット切替（Google / Cloudflare / OpenDNS）
- winget によるアプリ・ドライバ更新確認
- ゲームプロファイル管理（起動検知による自動適用）
- Claude AI による推奨機能
- システムトレイ常駐 + close-to-tray

## 動作環境

| 項目 | 要件 |
|------|------|
| OS | Windows 10 / 11 |
| GPU推奨 | NVIDIA（nvidia-smi 依存機能あり） |
| 管理者権限 | ネットワーク最適化・電源プラン変更に必要 |

---

## インストール時の注意（SmartScreen 警告について）

本アプリはコードサイニング証明書未取得のため、初回起動時に Windows SmartScreen の警告が表示される場合があります。

**対処手順:**
1. 警告ダイアログで「詳細情報」をクリック
2. 「実行」ボタンをクリック

> 本ソフトウェアは GitHub で公開されているオープンソースです。
> 不審に思われる場合はソースコードをご確認ください。

---

## セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバ起動（ホットリロード）
npm run tauri dev

# プロダクションビルド（MSI生成）
cargo tauri build
# 出力: src-tauri/target/release/bundle/msi/*.msi
```

### 必要なツール

- [Rust stable](https://rustup.rs/)
- Node.js 20+
- [Tauri v2 前提条件](https://v2.tauri.app/start/prerequisites/) (Visual Studio Build Tools)

---

## 開発者向け品質チェック

### ローカルで CI 相当を回す

```bash
# ── Rust ────────────────────────────────────────────────
cd src-tauri

# フォーマット確認
cargo fmt --check

# Lintエラーを警告ではなくエラーとして扱う
cargo clippy -- -D warnings

# 型チェック
cargo check

# ユニットテスト実行
cargo test

# ── Frontend ────────────────────────────────────────────
cd ..

# TypeScript 型チェック
npm run typecheck

# ユニットテスト実行
npm test -- --run

# ビルド確認（任意）
npm run build
```

### テスト内容

#### Rust テスト（28件）

| ファイル | テスト観点 |
|----------|-----------|
| `src/error.rs` | AppError の Display / From / Serialize |
| `src/commands/profiles.rs` | is_draft ロジック / GameProfile::default / unix_to_ymd_hms |
| `src/commands/watcher.rs` | exe_matches（完全一致・ファイル名一致・大文字小文字・不一致） |
| `src/commands/power.rs` | parse_active_guid パース / current_power_plan_inner（MockRunner使用） |
| `src/commands/runner.rs` | MockRunner の挙動（成功・失敗・複数キュー） |

```bash
# 特定モジュールのテストのみ実行
cargo test commands::power
cargo test commands::watcher
```

#### TypeScript テスト（13件）

| ファイル | テスト観点 |
|----------|-----------|
| `useAppStore.test.ts` | activePage / gameModeActive / optimizationStatus など |
| `useSystemStore.test.ts` | systemInfo / currentPowerPlan 格納 |
| `useWatcherStore.test.ts` | activeProfileId / autoOptimize フラグ |

```bash
# ウォッチモード（開発中）
npm test

# CI モード（1回実行して終了）
npm test -- --run
```

### CI（GitHub Actions）

`.github/workflows/ci.yml` が push / PR 時に以下を Windows ランナーで実行します。

```
Rust ジョブ:   cargo fmt --check → cargo clippy -D warnings → cargo check → cargo test
Frontend ジョブ: npm ci → npm run typecheck → npm test --run
```

---

## アーキテクチャ概要

```
src/                          # React フロントエンド
  stores/
    useAppStore.ts            # ナビゲーション・ゲームモード・テーマ
    useSystemStore.ts         # CPU/メモリ情報・電源プラン
    useWatcherStore.ts        # アクティブプロファイル・自動最適化フラグ
    useToastStore.ts          # トースト通知
  components/
    dashboard/                # ダッシュボード
    optimization/             # GameMode / WindowsSettings / StorageCleanup / NetworkOptimizer
    games/                    # ゲームライブラリ
    hardware/                 # GPU / CPU / マザーボード
    updates/                  # winget アップデート
    profiles/                 # プロファイル管理
    settings/                 # 設定（APIキー・テーマ）

src-tauri/src/                # Rust バックエンド
  lib.rs                      # Tauri セットアップ・トレイ・ウォッチャー起動
  error.rs                    # AppError 型
  commands/
    runner.rs                 # CommandRunner trait (SystemRunner / MockRunner)
    ai.rs                     # Claude API 呼び出し・keyring 連携
    watcher.rs                # ゲーム起動検知ループ（動的インターバル）
    power.rs / network.rs     # 電源・ネットワーク最適化
    process.rs                # プロセス一覧・kill
    profiles.rs               # ゲームプロファイル CRUD・適用
    optimizer.rs              # ワンクリック最適化
    storage.rs / updates.rs   # ストレージ・winget 更新
    windows_settings.rs       # レジストリ設定
    hardware.rs               # GPU/CPU/MB 詳細（WMI）
    steam.rs / icons.rs       # Steam 検出・EXE アイコン抽出
    ai_schema.rs              # V2 データ契約（RecommendationInput/Result 等）
    ai_safety.rs              # SafetyPolicy + Schema Guard
    ai_metrics.rs             # SQLite メトリクス（モデル別成功率/レイテンシ）
    ai_router.rs              # LLM ルーター + ルールベースフォールバック
    recommendation.rs         # V2 エントリーポイント（Tauri コマンド）
```

---

## 本番推奨エンジン V2 (ENABLE_RECOMMENDATION_V2)

マルチモデル対応の AI 推奨エンジンです。
**デフォルト OFF** — 段階的に有効化できます。

### 有効化手順

1. **Rust フラグを ON にする**

   ```rust
   // src-tauri/src/commands/recommendation.rs
   pub const ENABLE_RECOMMENDATION_V2: bool = true;  // false → true
   ```

2. **フロントエンドウィジェットを表示する**

   ```typescript
   // src/components/dashboard/HomeHub.tsx
   const ENABLE_RECOMMENDATION_V2_UI = true;  // false → true
   ```

3. **Anthropic API キーを設定する**
   アプリ内の「設定 → AI 設定」から入力（Windows Credential Manager に保存）。
   API キーなしの場合はルールベースフォールバックで動作します。

### アーキテクチャ

```
generate_recommendation(payload)
  └─ ai_router::select_model()    # intent/laptop → haiku or sonnet
  └─ ai_router::build_prompt()    # システム情報 + 制約をプロンプトに変換
  └─ ai_router::call_api()        # Claude API 呼び出し
      ├─ OK  → parse_response()
      │         └─ ai_safety::guard_result()   # Schema Guard
      │         └─ SafetyPolicy::filter()      # 制約フィルタ
      └─ Err → ai_router::fallback_rule_based() # ルールベース推奨
  └─ ai_metrics::record()         # SQLite にレイテンシ・成功率を記録
```

### フォールバック保証

API キーがない・API エラー・スキーマ違反のいずれの場合も、
`fallback_used: true` のルールベース推奨が返されます（エラーにはなりません）。

### モデル選択ロジック

| 条件 | 使用モデル |
|------|-----------|
| ラップトップ (`isLaptop: true`) | `claude-sonnet-4-6` |
| 静音モード (`intent: "silence"`) | `claude-sonnet-4-6` |
| その他 | `claude-haiku-4-5-20251001` |

### API コマンド

| コマンド | 説明 |
|---------|------|
| `generate_recommendation(payload)` | 推奨一覧を生成する |
| `get_recommendation_metrics(rangeHours?)` | モデル別メトリクスを取得する |

### 環境変数・設定

| 設定 | 場所 | 説明 |
|------|------|------|
| Anthropic API キー | Windows Credential Manager | アプリ「設定」画面から入力 |
| `ENABLE_RECOMMENDATION_V2` | `recommendation.rs` | Rust 側フラグ（default: false） |
| `ENABLE_RECOMMENDATION_V2_UI` | `HomeHub.tsx` | UI 側フラグ（default: false） |

### CI コマンド

```bash
# TypeScript 型チェック
npx tsc --noEmit

# Rust 静的解析
cargo check

# 全テスト（TS 56件 + Rust 108件）
npx vitest run
cargo test
```
