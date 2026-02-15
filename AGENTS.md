## プロジェクト概要

PiaCode は、モバイルファーストのピアノ用コード進行学習アプリです。ユーザーはマトリクス入力でコード進行を視覚的に編集し、楽譜（VexFlow）として確認し、音声（Tone.js）で再生できます。GitHub Pages（https://gajumaru314159.github.io/PiaCode/）で公開しています。

## 仕様書

- おおもとの仕様書は `doc/spec.md` です。

## 技術スタック

- **Next.js 16**（App Router）+ React 19 + TypeScript（strict mode）
- `@tailwindcss/postcss` を利用した **Tailwind CSS v4**
- 楽譜レンダリングに **VexFlow 5**
- 音声再生に **Tone.js 15**
- テストフレームワークは未導入

## コマンド

- `npm run dev` — 開発サーバー起動
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint（eslint-config-next）

## アーキテクチャ

### ソース構成（`src/`）

- `app/` — Next.js App Router。単一ページ（`page.tsx`）で `AppProvider` → `AppShell` をラップ。
- `types/music.ts` — 中核ドメイン型: `ChordToken`, `Progression`, `SavedProgression`, `PlaybackState`, `AppOptions`。
- `context/AppContext.tsx` — `useReducer` を使ったグローバル状態管理。`useApp()` フック経由で `state`、`dispatch`、`loadPreset`、`savePreset`、`removePreset` を提供。
- `components/` — タブ型 UI: `EditTab`, `LoadTab`, `PlayTab`, `OptionTab`。加えて `SheetMusic`（VexFlow）, `SavePanel`, `Splash`, `ConfirmDialog`。
- `lib/` — ドメインロジック:
  - `music.ts` — コード/進行ユーティリティ（生成、転調、MIDI 変換、ループ長計算）
  - `audio.ts` — 伴奏パターン定義（`PatternDef`）と MIDI から周波数への変換
  - `storage.ts` — LocalStorage 永続化（自動保存、ユーザープリセット、オプション、lastOpened）
  - `i18n.ts` — 翻訳テーブル（ja/en/zh）と `t(key, lang)` 関数
  - `presets.ts` — システムプリセットのコード進行

### 状態管理

アプリ状態はすべて `AppContext` の reducer パターンで流れます。主な状態は現在タブ、進行データ、再生状態、オプション、ユーザープリセットです。自動保存は 5 秒ごとと、タブ離脱時に実行されます。

### データモデル

- 1 セル = 1 拍。セルは 8 セル単位の行（1 段）で保持。
- 3/4 拍子では各行の 7-8 拍目を非表示（データは保持）。
- LocalStorage キーは `piacode.<domain>.<name>` 命名規則に従う。

### UI パターン

- タブ型 SPA: Edit → Load → Play → Option
- スプラッシュ画面（2 秒）後、Play（`lastOpened` がある場合）または Load に自動遷移
- すべてのコンポーネントは `"use client"`（クライアントサイドレンダリング）
- パスエイリアス: `@/*` は `./src/*` にマップ

## デザイン規約

- 紙ベースのアナログ調デザイン（純白 `#FFFFFF` は使わず、ベース背景は `#D9D9D9`）
- アイコンは絵文字ではなく SVG 描画
- アクセシビリティのためタップターゲットは最小 44px
- 主言語は日本語。コメントと仕様書も日本語
- 関数ドキュメントは `@brief` 形式の JSDoc スタイル
