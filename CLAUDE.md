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

**モジュールの遅延ロード**: `popup.html` は `popup.js` だけを静的に読み込む。各モジュールのスクリプトと CSS は `popup.js` 内の `TAB_MANIFEST` に定義され、**タブを使用するタイミングで動的にロード**される（初期描画を高速化するため）。モジュールの `html` テンプレートリテラルは**読み込み時点で** `Toolkit.copyButton` / `iconButton` / `ICONS` を呼ぶため、`popup.js` が先にロードされている必要があるが、動的ロードの仕組みでこの順序は保証される。**UI のタブ順 = `TAB_MANIFEST` の配列順**。モジュール追加 = `modules/<name>.js` 作成 ＋（その機能固有のスタイルがあれば `styles/<name>.css` も作成）＋ `popup.js` の `TAB_MANIFEST` にエントリを追加。モジュール側の `registerTab` には `html` と `init` だけ渡す（id は `TAB_MANIFEST` の `scripts` 定義から `document.currentScript` で自動解決される）。

**機能が複数ファイルに分かれる場合はフォルダにまとめる**: 1 ファイルで収まらない機能は `modules/<name>/` に分割してよい（例: `modules/sitesearch/` … `index.js`＝`Toolkit.registerTab` を呼ぶ主ファイル、`engine.js`／`bar.js`＝ページへ注入する補助、`results.js`＝描画専用）。`registerTab` を呼ぶ主ファイルは `index.js` とし、`TAB_MANIFEST` の `scripts` 配列には依存順（補助 → 主）で列挙する。**タブを登録しない補助モジュール**（注入用・描画専用など）は機能ロジックを持ってよいが、`window.SiteSearchEngine` のような名前空間で公開し主ファイルから呼ぶ（`Toolkit` の「機能ロジックを持たない」原則はあくまで `popup.js` コアの話）。CSS はフォルダに同梱せず従来どおり `styles/<name>.css` に置き、`TAB_MANIFEST` の `styles` に指定する。

**共通 UI ヘルパーを使う**: ボタンやコピーは独自マークアップを書かず `Toolkit.copyButton` / `iconButton` 等を使う。特にコピーは `.tm-copy-btn` への**イベント委譲**で一括処理されるので、モジュール側で独自のコピーハンドラを付けない（対象要素の id を指すボタンを出力するだけ）。コントロールは 34px 高さで統一。

**CSS は `styles/` に 3 層で分割する（1 枚にまとめない）**: スタイルは用途で 3 つに振り分ける。① `styles/base.css` … ほぼ全機能 / `popup.js` コアで使う共通スタイル（レイアウト・フォーム要素・ボタン・`output`・`inline`・`hr`・`icon-btn`・`copy-btn`・`toast` 等）、② component ファイル（例 `styles/modal.css`）… 用途は限られるが**複数ツールで使う部品**をコンポーネント名で切り出す、③ `styles/<module>.css` … **その機能でしか使わない個別スタイル**。判断基準は「何ツールが使うか」: 1 ツール専用なら base に置かず個別ファイルへ、複数ツールで使い回すなら component ファイルへ昇格させる。`base.css` だけが `popup.html` で静的に読み込まれ、**それ以外は `TAB_MANIFEST` の `styles` で指定し、タブ使用時に動的ロード**される（ポップアップの初期表示を高速化するため）。ビルドが無いので `@import` は使わない。

**状態の永続化**: 入力値・変換結果はモジュール側で `Toolkit.saveState(key, value)` / `loadState(key, cb)` を使って `chrome.storage.local` に保存・復元する（キーは内部で `tm_state_` プレフィックスが付く。`saveState` は同一キー 200ms デバウンス）。保存はモジュール内に閉じる ＝ `popup.js` はストレージ I/O のヘルパーだけを提供し、何を保存するかは各モジュールが決める。新規モジュールでも入力・出力を変える箇所で `saveState` を呼び、`init` 末尾の `loadState` コールバックで復元すること（**コールバックは非同期**なので、DOM 構築直後の同期処理に依存しない）。アクティブタブ自体も `popup.js` が同じ仕組みで `activeTab` キーに保存している。`modules/memo.js` だけは歴史的経緯で独自キー `tm_toolkit_memo` を使うが、`TAB_MANIFEST` に `storageKey: 'tm_toolkit_memo'` を宣言して**どのキーを使うかをレジストリに公開**している。

**ストレージキーはレジストリで一元管理する**: 各タブの保存先キーは `TAB_MANIFEST` の `storageKey` で宣言できる（省略時は既定の `tm_state_<id>`）。`storage.js`（設定の「ストレージ」セクション）はこの宣言を `Toolkit.getTabs()` から読み、使用量表示・個別/一括クリアの一覧を**登録済みタブから動的生成**する（ハードコードの重複一覧は持たない）。つまり `TAB_MANIFEST` にタブを足すだけでストレージ画面に自動反映され、独自キーを使う場合も `storageKey` を宣言すれば特別扱い不要。

## 外部連携の注意

翻訳 (`modules/translate.js`) は非公式の `translate.googleapis.com` エンドポイントを直接 `fetch` する。ホストを変えるなら `manifest.json` の `host_permissions` も合わせて更新が必要。

サイト内検索 (`modules/sitesearch/`) は `chrome.scripting.executeScript`（`world: 'MAIN'`）でページに検索・ハイライト処理を注入する。注入される関数（`engine.js` の `run`、`bar.js` の `install`）は `func.toString()` で直列化されるため、**外側スコープを参照しない自己完結なコードにする**こと（引数だけで動かす）。`scripting` 権限と http(s) の `host_permissions` が必要で、対象を変えるなら `manifest.json` も更新する。`chrome://`・Web ストア・PDF 等は注入できない。
