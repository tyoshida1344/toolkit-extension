# リリース手順・リリースノート運用

このリポジトリのリリースノートは **GitHub Releases**（<https://github.com/tyoshida1344/toolkit-extension/releases>）で公開する。
本ファイルはその **書式テンプレート** と **運用ルール** をまとめたもの。新しいリリースを出すときはこの手順に従う。

## リリースの単位・タイミング

- リリースは **PR のマージ単位では行わない。** イシューの PR を `main` にマージしても自動公開はされず、`main` に未リリースの変更が積み上がるだけ。
- **複数の機能・修正をまとめて 1 リリース**とし、区切りの良いタイミングで公開する。公開する版には、直近タグ以降にマージされた変更をすべて含める（通常はまとめて 1 回の MINOR 更新）。
- タイミングはメンテナの裁量（例: 主要機能がいくつかたまったとき、マイルストーン達成時など）。緊急の単発修正だけを出したいときは、PATCH として個別に公開してもよい。
- 公開は `release-publisher` スキル（`.claude/skills/release-publisher/`）で行う。直近タグ以降のコミットを収集し、対話でノート本文を固めてからリリース PR を作成する。

## バージョニング

- [セマンティック バージョニング](https://semver.org/lang/ja/)（`MAJOR.MINOR.PATCH`）に従う。
- リリースのバージョンは `manifest.json` の `version` と一致させる。リリース前に `manifest.json` を更新すること。
  - **MAJOR**: 後方互換性のない変更。
  - **MINOR**: 後方互換の機能追加（新しいツールの追加など）。
  - **PATCH**: 後方互換のバグ修正。
- タグ名は `v` を付けた `vX.Y.Z` 形式（例: `v1.0.0`）。

## リリースノートの書式（Keep a Changelog 準拠）

[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、変更点を以下のカテゴリに分けて記載する。**該当する変更が無いカテゴリの見出しは省く。**

- `### Added` — 新機能。
- `### Changed` — 既存機能の変更。
- `### Deprecated` — 近く削除予定の機能。
- `### Removed` — 削除した機能。
- `### Fixed` — バグ修正。
- `### Security` — 脆弱性に関する修正。

### リリース本文テンプレート

新しいリリースの本文には次のテンプレートを使う（不要な見出しは削除する）。

```markdown
<このリリースの概要を1〜2行で>

### Added
- <追加した機能>

### Changed
- <変更した点>

### Fixed
- <修正した不具合>
```

## 公開手順

リリースは **PR ベース + CI 自動公開** で行う。

1. `release-publisher` スキルで対話しながらリリースノートとバージョンを確定する。
2. スキルが以下を含むリリース PR を作成する:
   - `manifest.json` の `version` 更新
   - `RELEASE_NOTES.md` にリリースノート本文を書き出し
3. PR をレビュー・マージすると、CI（`.github/workflows/release.yml`）が `manifest.json` のバージョンに対応するタグを作成し、`RELEASE_NOTES.md` の内容で GitHub Release を自動公開する。

### CI の動作条件

- `main` への push で `manifest.json` が変更された場合にのみ起動する。
- `manifest.json` の `version` に対応するタグ（`vX.Y.Z`）が**まだ存在しない**場合にのみリリースを作成する（既存タグがあればスキップ）。
