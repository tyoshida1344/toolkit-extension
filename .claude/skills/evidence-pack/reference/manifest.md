# manifest.json の形

エビデンスビューアが読むファイル。動画・画像・テキストと同じフォルダに `manifest.json` という名前で置く。
ビューアはフォルダの中をファイル名で探すので、`video` / `image` / `file` には**ファイル名だけ**を書く(パスは書かない)。

おおもとの説明はビューアのリポジトリの `docs/evidence-manifest.md`、
見本は `<ビューア>?base=sample/`(`<ビューア>` は [../config.json](../config.json) の `viewer`)。

| 項目 | 必須 | 中身 |
|---|---|---|
| `schema` | ○ | `dev-workbench/evidence@1` |
| `title` | ○ | 画面の見出し |
| `source` | | どこの何の確認か(`repository` / `pullRequest` / `commit` / `url`)。`url` があれば見出しの下にリンクで出る |
| `recordedAt` | | 撮った日(`YYYY-MM-DD`) |
| `summary` | | 結果の件数。`ok`(期待どおり)/ `partial`(一部だけ確認)/ `ng`(期待どおりでない) |
| `notes` | | 一覧の上に出す、全体にかかる注意(配列) |
| `sections[].title` | ○ | 受入確認の節 |
| `sections[].items[].id` | | 番号。一覧と見出しに出る |
| `sections[].items[].title` | ○ | 受入確認の文言 |
| `sections[].items[].result` | | `ok` / `partial` / `ng`。一覧に ✓ / ! / ✕ で出る(`partial` と `ng` は行に色が付く) |
| `sections[].items[].checks` | | 確かめたこと(1行ずつの配列)。頭に `○` / `△` / `×` を付けると、一覧と同じ印で出て本文から外れる |
| `sections[].items[].note` | | 補足。`※` を付けて出る |
| `sections[].items[].video` | | 動画のファイル名(`.webm` `.mp4` `.mov`)。`image` とはどちらか一方 |
| `sections[].items[].image` | | 画像のファイル名(`.png` `.jpg` `.jpeg` `.webp`)。`video` とはどちらか一方 |
| `attachments[]` | | 添付。`title` と `file`。動画・画像はそのまま、それ以外はテキストとして開く |

## 書く時に気をつけること

- `video` と `image` は、1つの項目にはどちらか一方だけ(両方あれば動画が出る)。どちらも無い項目は押せない
- 前後の変化を見せる必要がある項目は動画、1つの画面の状態を見れば済む項目は画像にする
- 文言の中で `` `…` `` で囲んだところは等幅で出る(画面の文言やコードに使う)
- 文字はすべてテキストとして表示される(HTMLとしては解釈されない)ので、`<` や `&` をそのまま書いてよい
- 連続再生で次へ進むのは動画が終わった時だけ。画像では自動で進まない

## 例

```json
{
  "schema": "dev-workbench/evidence@1",
  "title": "PR #22 アイデア一覧と詳細を作る",
  "source": {
    "repository": "owner/name",
    "pullRequest": 22,
    "commit": "4110199",
    "url": "https://github.com/owner/name/pull/22"
  },
  "recordedAt": "2026-11-03",
  "summary": { "ok": 2, "partial": 1, "ng": 0 },
  "notes": ["Chrome 141、1280×800 で確認"],
  "sections": [
    {
      "title": "追加する",
      "items": [
        {
          "id": "1",
          "title": "最終行に入力して Enter で行が足される",
          "result": "ok",
          "checks": ["○ 一覧: [\"ひとつめ\"]", "○ フォーカス: 新しいアイデア"],
          "video": "01-add-stays.webm"
        },
        {
          "id": "2",
          "title": "足した行に、入力した文字が残る",
          "result": "ok",
          "checks": ["○ 一覧: [\"ひとつめ\", \"ふたつめ\"]"],
          "image": "02-add-keeps-text.png"
        },
        {
          "id": "3",
          "title": "空の行は足されない",
          "result": "partial",
          "checks": ["○ 空のまま Enter: 行は増えない", "△ 空白だけの入力は未確認"],
          "note": "空白だけの場合は別PRで対応する",
          "image": "03-add-rejects-empty.png"
        }
      ]
    }
  ],
  "attachments": [
    { "title": "テストの結果", "file": "00-test.txt" }
  ]
}
```
