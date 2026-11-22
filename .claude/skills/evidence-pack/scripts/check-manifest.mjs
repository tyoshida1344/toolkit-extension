#!/usr/bin/env node
// エビデンスのフォルダを確かめる。Driveに上げる前に走らせて、綴り違いや数の食い違いを見つける。
//   node check-manifest.mjs <フォルダ>
// 形は ../reference/manifest.md。外のものは何も読み込まない(Node だけで動く)。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const SCHEMA = 'dev-workbench/evidence@1'
const RESULTS = ['ok', 'partial', 'ng']
const VIDEO = /\.(webm|mp4|mov)$/i
const IMAGE = /\.(png|jpe?g|webp)$/i
// Claude in Chrome でDriveへ上げる時、1回に送れるのは 10MB まで(1ファイルずつ送っても超えるものは上げられない)
const UPLOAD_LIMIT = 10 * 1024 * 1024

const errors = []
const warnings = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const warn = (where, message) => warnings.push(`${where}: ${message}`)

const dir = process.argv[2] ?? '.'

// 最後に出すURLは config.json の viewer から作る(URLを書くのはあそこだけ)
let viewer = ''
try { viewer = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8')).viewer ?? '' } catch {}

let names
try {
  names = readdirSync(dir)
}
catch {
  console.error(`フォルダが読めません: ${dir}`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
}
catch (error) {
  console.error(`manifest.json が読めません: ${error.message}`)
  process.exit(1)
}

// 参照されたファイルを、フォルダの中から大文字小文字まで同じ名前で探す。
// Windows と Drive では違いを無視するが、Pages から読む時は区別されるため。
const used = new Set()
function checkFile(where, file, pattern, kind) {
  if (typeof file !== 'string' || !file) return fail(where, 'ファイル名が文字列ではありません')
  if (file !== basename(file)) return fail(where, `ファイル名だけを書きます(パスは書きません): ${file}`)
  if (pattern && !pattern.test(file)) fail(where, `${kind}として開けない拡張子です: ${file}`)
  used.add(file)
  if (names.includes(file)) {
    const size = statSync(join(dir, file)).size
    if (size === 0) fail(where, `中身が空です: ${file}`)
    if (size > UPLOAD_LIMIT) fail(where, `10MB を超えていて Claude in Chrome で上げられません(${(size / 1048576).toFixed(1)}MB): ${file}。動画を短く分けます`)
    return
  }
  const similar = names.find(name => name.toLowerCase() === file.toLowerCase())
  fail(where, similar ? `大文字小文字が違います: ${file} (フォルダには ${similar})` : `フォルダにありません: ${file}`)
}

if (manifest.schema !== SCHEMA) fail('schema', `${SCHEMA} にします(今は ${JSON.stringify(manifest.schema)})`)
if (!manifest.title) fail('title', '見出しがありません')
if (manifest.recordedAt && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.recordedAt)) fail('recordedAt', 'YYYY-MM-DD にします')
if (manifest.notes && !Array.isArray(manifest.notes)) fail('notes', '配列にします')

const counts = { ok: 0, partial: 0, ng: 0 }
const ids = new Map()
const sections = manifest.sections ?? []
if (!sections.length) fail('sections', '節がありません')

sections.forEach((section, s) => {
  const at = `sections[${s}]`
  if (!section.title) fail(at, '節の名前がありません')
  const items = section.items ?? []
  if (!items.length) warn(at, `項目がありません: ${section.title ?? ''}`)
  items.forEach((item, i) => {
    const where = `${at}.items[${i}]${item.id ? ` (#${item.id})` : ''}`
    if (!item.title) fail(where, '受入確認の文言がありません')
    if (item.result === undefined) warn(where, 'result がありません(一覧に印が出ません)')
    else if (!RESULTS.includes(item.result)) fail(where, `result は ${RESULTS.join(' / ')} のどれかにします(今は ${JSON.stringify(item.result)})`)
    else counts[item.result] += 1
    if (item.id !== undefined) {
      const id = String(item.id)
      if (ids.has(id)) fail(where, `id が重なっています: ${id} (${ids.get(id)} と同じ)`)
      else ids.set(id, where)
    }
    if (item.checks !== undefined) {
      if (!Array.isArray(item.checks)) fail(where, 'checks は配列にします')
      else item.checks.forEach((line, c) => {
        if (typeof line !== 'string') fail(`${where}.checks[${c}]`, '文字列にします')
        else if (!/^[○✓△!×✕]\s*\S/.test(line)) warn(`${where}.checks[${c}]`, `行頭に ○ / △ / × を付けると印が出ます: ${line}`)
      })
    }
    if (item.video && item.image) fail(where, 'video と image はどちらか一方にします(両方あると動画だけが出ます)')
    if (item.video) checkFile(where, item.video, VIDEO, '動画')
    else if (item.image) checkFile(where, item.image, IMAGE, '画像')
    else warn(where, '動画も画像も無いので、一覧で押せません')
  })
})

const attachments = manifest.attachments ?? []
if (!Array.isArray(attachments)) fail('attachments', '配列にします')
else attachments.forEach((attachment, a) => {
  const where = `attachments[${a}]`
  if (!attachment.title) fail(where, 'title がありません')
  checkFile(where, attachment.file, null, '添付')
})

if (manifest.summary) {
  for (const result of RESULTS) {
    const written = manifest.summary[result] ?? 0
    if (written !== counts[result]) fail('summary', `${result} は ${counts[result]} 件ですが ${written} と書いてあります`)
  }
}
else warn('summary', '件数がありません(見出しの横に出ません)')

for (const name of names) {
  if (name === 'manifest.json' || name === 'README.md' || used.has(name)) continue
  if (statSync(join(dir, name)).isDirectory()) warn(name, 'サブフォルダは読まれません(フォルダは平らにします)')
  else warn(name, 'manifest.json から参照されていません')
}

const total = counts.ok + counts.partial + counts.ng
for (const line of warnings) console.log(`注意  ${line}`)
for (const line of errors) console.log(`エラー ${line}`)
console.log(`\n${dir}: 項目 ${total} 件(✓${counts.ok} / !${counts.partial} / ✕${counts.ng})、添付 ${attachments.length} 件`)
console.log(errors.length ? `エラー ${errors.length} 件。直してからDriveに上げます。` : 'エラーはありません。')
if (!errors.length && viewer) console.log(`Driveに上げたら: ${viewer}?folder=<フォルダID>`)
process.exit(errors.length ? 1 : 0)
