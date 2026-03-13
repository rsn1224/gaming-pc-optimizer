# UI Overhaul Progress

**Completed:** 2026-03-14

## Summary

Full gaming device UI overhaul (Razer/ROG style) applied across all frontend files.
No logic, state management, props types, or Tauri invoke calls were changed.

---

## Design Tokens Applied

| Token | Value |
| --- | --- |
| Base background | `#05070b` (near black) via `--background: 222 47% 3%` |
| Sidebar bg | `#050509` via `--sidebar: 240 50% 3%` |
| Card bg | `#05080c` via `--card: 220 50% 4%` |
| Primary accent | cyan-400 `#22d3ee` |
| Secondary accent | emerald-500 `#22c55e` |
| Border | `border-white/[0.08]` (translucent) |
| Card hover glow | `hover:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]` |
| Primary button | `bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950` |
| Secondary button | `bg-white/5 border-white/[0.10]` |

---

## Files Modified

### 1. `src/index.css`

- Updated all CSS custom properties for deep gaming dark theme
- Added `.nav-active::before` pseudo-element for 3px cyan left bar on active nav items
- Added `.content-glow` radial gradient class for main content area
- Added `.card-glow` hover glow utility class
- Refined scrollbar styling (thin, cyan on hover)

### 2. `tailwind.config.ts`

- Added `sidebar` color token mapped to `hsl(var(--sidebar))`
- Added `box-shadow` extensions: `glow-cyan`, `glow-green`, `card-hover`
- Added `backgroundImage` extensions: `btn-primary`, `content-glow`
- Increased `--radius` to `0.75rem`

### 3. `src/App.tsx`

- Sidebar uses `bg-sidebar` class
- Active nav item uses `.nav-active` CSS class for left cyan indicator bar
- Nav items: cyan icon color when active
- Logo area: gradient icon background, cyan sub-text with tracking

### 4. `src/components/ui/stat-card.tsx`

- Switched to `bg-[#05080c] border-white/[0.08] rounded-xl` panel style
- Added `.card-glow` hover effect

### 5. `src/components/ui/progress-bar.tsx`

- Track changed to `bg-white/[0.06]` (more subtle)
- Bar height reduced to `h-1.5` (sleeker)

### 6. `src/components/dashboard/Dashboard.tsx`

- Added horizontal MiniStat strip at top: CPU / Memory / GPU / Network
- Health ring updated with translucent track
- Optimization CTA uses gradient button
- Quick action buttons use cyan border glow on hover

### 7. `src/components/optimization/GameMode.tsx`

- **2-column layout** on xl: `xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]`
- Left: process list; Right: steps + CTA + restore
- Primary CTA uses gradient button; restore uses secondary style

### 8. `src/components/games/GameCard.tsx`

- Launcher badge with platform-specific color (Steam=blue, Epic=purple, etc.)
- Full-width gradient launch button at bottom

### 9. `src/components/games/GamesLibrary.tsx`

- Header icon uses cyan panel style
- Empty state CTA uses gradient primary button

### 10. `src/components/hardware/Hardware.tsx`

- GPU cards: `bg-[#05080c] rounded-xl card-glow`
- AI banner full-width below header
- GPU grid: `grid-cols-1 lg:grid-cols-2`

### 11. `src/components/updates/Updates.tsx`

- Critical badge has animated pulse dot
- Critical rows: `bg-red-500/5` tint; recommended: `bg-amber-500/5`
- Update button uses gradient primary style

### 12. `src/components/settings/Settings.tsx`

- All section cards use dark glass style
- Save API key button uses gradient style
- Input fields use `bg-white/[0.04] border-white/[0.10]`
- Toggle buttons use `bg-cyan-500` when active

### 13. `src/components/profiles/Profiles.tsx`

- Modals use `bg-[#05080c] border-white/[0.10] rounded-2xl`
- Profile cards use cyan glow on hover/active
- All primary actions use gradient buttons

---

## UIリファイン Round 2（ゲーミングデバイス風） — 2026-03-14

### 追加変更ファイル

#### `src/index.css`

- `.sidebar-dots` 追加（cyan ドットグリッドパターン）
- `.nav-active-bg` 追加（left→right フェードグラデーション、インラインスタイル排除）
- `.section-divider` 追加（横グラデーションライン）
- `.card-active-border` 追加（アクティブカード外枠グロー）
- `.step-number` 追加（ステップ番号バッジ用）
- `.nav-active::before` をシアン→エメラルドグラデーション + box-shadow に強化
- `.content-glow` を楕円形ラジアルグラデーションに強化

#### `src/App.tsx`

- サイドバー幅 w-52→w-56、`sidebar-dots` 適用
- ロゴ: グラデーション背景＋外枠グロー強化
- ロゴ下・フッター上に `.section-divider` 挿入
- ナビ: アイコンサイズ 16→17px、py-2.5、rounded-xl
- フッター: ping アニメーションドット

#### `src/components/dashboard/Dashboard.tsx`

- `MiniStat`: アイコンをボックス化、accent prop 追加
- `HealthRing`: 径拡大 + グロー二重リング追加
- `QuickActionButton`: アイコンを rounded-xl ボックスに格納
- HealthScore カード上部アクセントライン追加

#### `src/components/optimization/GameMode.tsx`

- ステップ idle 時に番号バッジ表示（`.step-number`）
- ステップ結果テキストを色分け
- プロセスヘッダーアイコンをボックス化
- ステップカード上部グラデーションライン追加

#### `src/components/games/GameCard.tsx`

- 上部アクセントライン追加（active 時はシアン→エメラルド）
- **起動ボタン**: 半透明 → ソリッドグラデーション（最大視覚改善）

#### `src/components/hardware/Hardware.tsx`

- `StatCell` をボックス化（p-3 bg rounded-lg border）
- GPU カード上部グラデーションライン追加
- モードボタン rounded-xl + active グロー shadow

#### `src/components/updates/Updates.tsx`

- critical 行: `border-l-2 border-l-red-500/50` で左端ライン強調

#### `src/components/ui/stat-card.tsx`

- 上部 1px グラデーションアクセントライン追加

#### 全ページヘッダーアイコン統一

- `WindowsSettings`, `NetworkOptimizer`, `StorageCleanup`, `Profiles`, `Settings`, `GamesLibrary` のヘッダーアイコンをすべてグラデーション背景＋ shadow に強化

---

## Not Changed

- All logic, state management, Zustand store
- Tauri invoke calls and props/type definitions
- `WindowsSettings.tsx`, `StorageCleanup.tsx`, `NetworkOptimizer.tsx`, `ComingSoon.tsx`, `GameFilters.tsx`, `Toggle.tsx`
- Rust backend (`src-tauri/`)
