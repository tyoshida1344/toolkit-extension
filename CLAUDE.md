# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## これは何か

ポップアップ内にタブ形式の開発者向けツールをまとめた Chrome 拡張機能（Manifest V3）。機能一覧は README を参照。バニラ JS / HTML / CSS で、**ビルド・依存パッケージ・テスト・バンドラーは存在せず**、ソースがそのままブラウザで動く。

## 開発ワークフロー

読み込み手順は README を参照。編集後は `chrome://extensions` の拡張機能カードをリロードしてポップアップを開き直すだけで反映される。lint・test コマンドは無い。完了とみなす前に構文だけは検証すること（テンプレートリテラルのミスは実行時まで表面化しない）:

```sh
node --check popup.js
node --check modules/<編集したファイル>.js
```

## アーキテクチャ

`popup.js` は `Toolkit` シングルトン（IIFE）で、タブ管理・UI 構築・共通 UI ヘルパーだけを担い、**機能ロジックは一切持たない**。各機能は `modules/*.js` にあり、`Toolkit.registerTab(...)` を呼んで自己登録する。

**スクリプト読み込み順の罠（`popup.html`）**: `popup.js` を必ず先に読み込む。モジュールの `html` テンプレートリテラルが**読み込み時点で** `Toolkit.copyButton` / `iconButton` / `ICONS` を呼ぶため、順序を誤ると未定義で落ちる。また **UI のタブ順 = `popup.html` のスクリプト順**。モジュール追加 = `modules/<name>.js` 作成 ＋（その機能固有のスタイルがあれば `styles/<name>.css` も作成）＋ `popup.html` に `<script>`（と必要なら `<link>`）を追加。

**共通 UI ヘルパーを使う**: ボタンやコピーは独自マークアップを書かず `Toolkit.copyButton` / `iconButton` 等を使う。特にコピーは `.tm-copy-btn` への**イベント委譲**で一括処理されるので、モジュール側で独自のコピーハンドラを付けない（対象要素の id を指すボタンを出力するだけ）。コントロールは 34px 高さで統一。

**CSS は `styles/` に 3 層で分割する（1 枚にまとめない）**: スタイルは用途で 3 つに振り分ける。① `styles/base.css` … ほぼ全機能 / `popup.js` コアで使う共通スタイル（レイアウト・フォーム要素・ボタン・`output`・`inline`・`hr`・`icon-btn`・`copy-btn`・`toast` 等）、② component ファイル（例 `styles/modal.css`）… 用途は限られるが**複数ツールで使う部品**をコンポーネント名で切り出す、③ `styles/<module>.css` … **その機能でしか使わない個別スタイル**。判断基準は「何ツールが使うか」: 1 ツール専用なら base に置かず個別ファイルへ、複数ツールで使い回すなら component ファイルへ昇格させる。読み込みは `popup.html` の `<link>` で静的に行い、順序は **base → component → 機能個別**（＝スクリプト順 / タブ順に合わせる）。ビルドが無いので `@import` は使わず `<link>` を並べる。

**状態の永続化**: 入力値・変換結果はモジュール側で `Toolkit.saveState(key, value)` / `loadState(key, cb)` を使って `chrome.storage.local` に保存・復元する（キーは内部で `tm_state_` プレフィックスが付く。`saveState` は同一キー 200ms デバウンス）。保存はモジュール内に閉じる ＝ `popup.js` はストレージ I/O のヘルパーだけを提供し、何を保存するかは各モジュールが決める。新規モジュールでも入力・出力を変える箇所で `saveState` を呼び、`init` 末尾の `loadState` コールバックで復元すること（**コールバックは非同期**なので、DOM 構築直後の同期処理に依存しない）。アクティブタブ自体も `popup.js` が同じ仕組みで `activeTab` キーに保存している。`modules/memo.js` だけは歴史的経緯で独自キー `tm_toolkit_memo` を直接使う。

## 外部連携の注意

翻訳 (`modules/translate.js`) は非公式の `translate.googleapis.com` エンドポイントを直接 `fetch` する。ホストを変えるなら `manifest.json` の `host_permissions` も合わせて更新が必要。
