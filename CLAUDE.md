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

`popup.js`（`Toolkit` IIFE）は**機能ロジックを一切持たない**。タブ管理・UI 構築・共通ヘルパーだけを担う。各機能は `modules/*.js` が `Toolkit.registerTab()` で自己登録する。

**モジュール追加手順**: `modules/<name>.js` 作成 → `popup.js` の `TAB_MANIFEST` にエントリ追加 → 機能固有スタイルがあれば `styles/<name>.css` も作成 → **README の機能一覧にツールの説明を追加**。1 ファイルで収まらない機能は `modules/<name>/` フォルダに分割し、`registerTab` を呼ぶ主ファイルは `index.js` とする。

**守るべきルール**:
- コピーは `Toolkit.copyButton` のイベント委譲で処理される。モジュール側で独自のコピーハンドラを付けない
- CSS は 1 ツール専用なら `styles/<module>.css`、複数ツールで使うなら component ファイルへ昇格、の基準で振り分ける。`@import` は使わない
- `loadState` のコールバックは**非同期**。DOM 構築直後の同期処理に依存しない
- 独自のストレージキーを使う場合は `TAB_MANIFEST` の `storageKey` に宣言する（ストレージ画面が自動認識する）
- 既存ツールの機能追加・仕様変更を行った場合は、README の該当セクションも実装に合わせて更新する

## 外部連携の注意

- 翻訳は非公式の `translate.googleapis.com` を直接 `fetch` する。ホストを変えるなら `manifest.json` の `host_permissions` も更新が必要
- サイト内検索の注入関数（`engine.js`・`bar.js`）は `func.toString()` で直列化される。**外側スコープを参照しない自己完結なコードにする**こと
