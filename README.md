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
```
