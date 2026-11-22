---
name: evidence-pack
description: この拡張機能の受入確認のエビデンス（Playwright で撮った動画・画像と確かめたこと）を作り、dev-workbench のエビデンスビューアで見られる形にまとめて Google Drive に上げ、ビューアの URL を PR に載せる。issue-handler のエビデンス作成ステップから呼ばれるほか、「エビデンスを作って」「受入確認の結果をまとめる/共有する」「Playwright で動作確認して記録を残して」「エビデンスビューアで見られるようにする」と言われた時に使う。単に動作を軽く確かめたいだけで記録が要らない時には使わない。
---

# エビデンスを作り、ビューアで見られるようにする

受入確認のケースを作り、Playwright で拡張機能を動かして動画・画像を撮り、確かめたことを `manifest.json` にまとめ、
Drive に上げてエビデンスビューアの URL を PR に載せるまでを行う。

元は dev-workbench の `skills/evidence-pack`（汎用版）。この拡張機能向けに、撮り方（Playwright）・ケースの作り方・Drive への上げ方を足している。

設定は [config.json](config.json)。`viewer`（ビューアの URL）を以下 `<ビューア>`、`driveParentFolder`（親フォルダの ID）を `<親ID>` と書く。

## 守ること

- **エビデンスをリポジトリにコミットしない。** 動画・画像・`manifest.json` はリポジトリの外の作業場所で作る。リポジトリに残すのはビューアの URL だけ
- **撮ったものを加工しない。** 期待どおりでなかったケース（`ng` / `partial`）も消さない
- 確かめたことは**実際に読み取った値**を書く。「正しく表示される」ではなく `文字色欄: #000000` のように書く
- **受け入れ項目の一覧(`00-cases.md`)が正本。** `manifest.json` の節と項目も、PR の Test plan も、それを順番も文言もそのまま写す
- 受け入れ項目の一覧を利用者に確認してもらう必要はない。代わりに、手順2の見直し(自分と別の目)を省かない

## 作業場所

リポジトリの外に1か所決め、Playwright はそこに入れる（リポジトリは依存パッケージを持たないため）。既定は次の場所。

```
~/evidence-work/toolkit-extension/
  package.json, node_modules/     # Playwright（初回だけ入れる）
  scripts/<日付>-issue<番号>.mjs   # 撮影スクリプト（エビデンスには入れない）
  <日付>-issue<番号>/              # エビデンスのフォルダ（平ら。これを Drive に上げる）
```

初回だけ Playwright を入れる。Chromium がすでに入っていれば、その版に合う Playwright を選ぶ（`%LOCALAPPDATA%/ms-playwright/chromium-<revision>` の revision と、`node_modules/playwright-core/browsers.json` の `chromium.revision` を揃える）。

```sh
cd ~/evidence-work/toolkit-extension
npm init -y
npm i playwright            # Chromium が無ければ続けて npx playwright install chromium
```

## 手順

### 1. フォルダを作る

作業場所に、1回の確認につき1つ作る。名前は `<YYYY-MM-DD>-issue<番号>`（イシューが無ければ `-pr<番号>`）。

### 2. 受け入れ項目を決め、見直す

[reference/cases.md](reference/cases.md) の決まりで受け入れ項目を作り、`00-cases.md` に書いてエビデンスのフォルダに入れる。要点:

- 項目は **要件** / **既存機能への影響** / **設計で追加した仕様** の3つの見方に分ける。節もこの3つにする
- 出どころ(イシューの要件、変更した処理の利用元、確定仕様の Q → A・実装中に決めた細部・セルフレビューで足した直し)を全部書き出し、観点の出どころの表を総なめにし、差分を1行ずつ見直して、すべてに項目を付ける
- 1項目は1つの操作の結果。期待する結果は具体的な値で書き、判定は値(DOM の状態・canvas の画素・保存された値)で行う
- `00-cases.md` には、受け入れ項目の一覧(正本)・対応表・まとめた項目・確かめていないことを書く
- cases.md の「撮る前の見直し」を、自分で行ったあと、サブエージェントに別の目で見てもらう。P1・P2 を直してから撮る

### 3. Playwright で撮る

撮影スクリプトを作業場所の `scripts/` に書く。拡張機能の読み込み・ケースごとの動画・画面のエラー集めは
[scripts/extension-harness.mjs](scripts/extension-harness.mjs) にまとめてあるので、それを使う。

```js
import { chromium } from 'playwright'
// Windows では絶対パスを file:/// の URL で書く（例: file:///C:/Users/me/gitrepos/toolkit-extension/...）
import { launchExtension, makeGridImage, openScreenshotPreview } from 'file:///<リポジトリ>/.claude/skills/evidence-pack/scripts/extension-harness.mjs'

const evidenceDir = '<作業場所>/<日付>-issue<番号>'
const ext = await launchExtension(chromium, { evidenceDir })
const dataUrl = await makeGridImage(ext.context)

const c = await ext.startCase('01-bubble-padding', { video: false })
const cv = await openScreenshotPreview(ext, c.page, { dataUrl })
// ... c.page と cv.point(x, y) で操作し、判定に使う値を読む（cv.pixel(x, y) で canvas の画素）...
await c.shot()                  // 画像のケース → 01-bubble-padding.png
const errors = await c.finish() // 動画のケースは { video: true } で 01-….webm が残る
await ext.close()
process.exit(0) // 拡張機能を読み込んだ Chromium の子プロセスが残り、Node が終わらないことがあるため
```

| どんなケースか | 何で撮るか |
|---|---|
| 1つの画面の状態を見れば済む | **画像**（既定）。`c.shot()` |
| 操作の前後や流れを見せる必要がある | **動画**。`startCase(name, { video: true })`。1本は短く（10MB を超えると Drive に上げられない） |

- **1項目につき1つ。** 1ケース = 1ページ（`startCase` ごとに新しいタブ）。動画もケースごとに1本になる
- 撮り方のこつ（結果が出てから撮る、ブラウザの確認は映らない、日本語入力の変換中の作り方など）は [reference/capture.md](reference/capture.md)
- スクリプトは判定に使った値を `console.log` で出し、それを `checks` に写す。画面のエラー（`finish()` の戻り値）が出たら `checks` に書く
- ポップアップは `ext.url('popup.html')` を開いて操作できる。撮影操作（`chrome.tabs.captureVisibleTab` 等）が要る画面は、前提データを `ext.seedStorage` で入れて開く（スクリーンショットのプレビューは `openScreenshotPreview`）
- 動画のプレビューのように前提データを用意しにくい画面は、確かめられないケースを `partial` にして理由を書く。消さない
- 撮った画像は自分でも開いて見る（文字の重なり・はみ出し・ツールチップの隠れなど、値に出ない崩れを拾う）
- **期待どおりにならなかった項目も撮って残す。** 直して撮り直した時は、前のものを `番号-内容-修正前.拡張子` に名前を変えて残し、`attachments` に載せる
- 構文検証（`node --check`）など、コマンドで確かめたものは出力を `00-check.txt` などに保存して `attachments` に載せる

### 4. manifest.json を書く

[templates/manifest.json](templates/manifest.json) を写して埋める。形は [reference/manifest.md](reference/manifest.md)。

- `title`: `#<番号> <イシューのタイトル>`、`source`: リポジトリ・PR 番号・コミット・PR の URL
- `notes`: 確かめた環境（Playwright 同梱 Chromium の版、画面サイズ）と、確かめていないこと
- `sections` と `items`: `00-cases.md` の受け入れ項目を、**順番も文言もそのまま**写す（`id` は一覧の番号、`title` は一覧の文言）
- 画像の項目は `checks` が唯一の手がかり。**画面のどこを見て○にしたか**と、画像だけでは分からない値を書く
- `source.commit` は撮った時のコミット。直して一部だけ撮り直したなら、最後のコミットを書き、どの項目をどのコミットで撮ったかを `notes` に書く
- `attachments`: `{ "title": "受け入れ項目", "file": "00-cases.md" }` と、コマンドの出力・修正前のファイル
- `summary` の件数は `result` の数と合わせる

### 5. 形を確かめる

```sh
node <リポジトリ>/.claude/skills/evidence-pack/scripts/check-manifest.mjs <エビデンスのフォルダ>
```

ファイル名の違い、拡張子、`summary` の食い違い、使っていないファイル、10MB を超えるファイルを見つける。エラーが無くなるまで直す。

### 6. Claude in Chrome で Drive に上げる

コネクタは大きいファイルに向かないため、利用者の Chrome（Claude in Chrome）で Drive の画面から上げる。

1. `<親ID>` が空なら、エビデンスを置く親フォルダの URL を利用者に聞き、ID を [config.json](config.json) に書く
2. Claude in Chrome のツールを読み込む（`ToolSearch` で `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__file_upload` をまとめて1回）。新しいタブで作業し、利用者のタブは触らない
3. `https://drive.google.com/drive/folders/<親ID>` を開き、「新規」→「新しいフォルダ」で手順1と同じ名前のフォルダを作って開く。URL の `folders/<ID>` からフォルダの ID を控える
4. 「新規」→「ファイルのアップロード」は押さない（OS のダイアログが開いて操作できない）。`find` で `input[type=file]` を探し、`file_upload` にエビデンスのフォルダのファイルの絶対パスを渡す。1回の合計は 10MB まで、超える時は数回に分ける
5. アップロードが終わったら、フォルダ内のファイル名と件数が手元と一致するかを画面で確かめる
6. 共有設定は親フォルダから引き継ぐ。「リンクを知っている全員」の共有は足さない。個別に共有を変える必要があれば、変える前に利用者に確認する
7. Google のログイン画面が出たら、ログインは利用者に頼む（パスワードは入力しない）

### 7. URL を渡す

```
<ビューア>?folder=<フォルダのID>
```

開いて一覧と画像・動画が出ることを確かめてから、PR の本文（issue-handler から呼ばれた時）またはコメントに貼る。

```
## Evidence
受入確認: 全 N 項目（✓x / !y / ✕z）
<ビューア>?folder=<フォルダのID>
```

`partial` / `ng` があれば、その番号と理由も1行ずつ添える。

PR の Test plan は、`00-cases.md` の受け入れ項目を順番も文言もそのまま写し、**エビデンスで ok だった項目にだけ**チェックを付ける。`partial` / `ng` とエビデンスを取れていない項目には付けない。付ける前に、Test plan と `manifest.json` の項目が順番も文言も一致していることを確かめる。

## つまずいた時

| 見えたこと | 直し方 |
|---|---|
| `launchPersistentContext` で拡張機能が読み込まれない | `channel: 'chromium'` が要る（Chrome 本体は `--load-extension` を無視する）。harness はそうしている |
| Playwright の起動時にブラウザが無いと言われる | Playwright の版と、入っている Chromium の revision が合っていない。版を合わせるか `npx playwright install chromium` |
| ビューアが「ログインして開く」のまま | そのアカウントがフォルダを読めるか、共有設定を見る |
| 項目を押しても何も出ない | `video` / `image` が無いケース。撮り直すか、`partial` にして理由を書く |
| 「見つかりません」と出る | ファイル名の綴りか大文字小文字。手順5のスクリプトで照合する |
