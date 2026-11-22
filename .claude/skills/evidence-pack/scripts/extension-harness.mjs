// Playwright でこの拡張機能を読み込み、エビデンスを撮るための共通処理。
// リポジトリは依存パッケージを持たないので、Playwright はリポジトリの外（作業場所）に入れ、
// 撮影スクリプトから chromium を渡して使う。使い方は ../SKILL.md の手順3。
//
//   import { chromium } from 'playwright'
//   import { launchExtension } from '<このファイルの絶対パス>'
//   const ext = await launchExtension(chromium, { evidenceDir })
//   const c = await ext.startCase('01-bubble-wrap', { video: true })
//   ... c.page を操作する ...
//   await c.finish()   // 動画は 01-bubble-wrap.webm として evidenceDir に保存される
//   await ext.close()

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// このファイルは <リポジトリ>/.claude/skills/evidence-pack/scripts/ にある
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

export async function launchExtension(chromium, { evidenceDir, extensionPath = REPO_ROOT, viewport = { width: 1600, height: 1000 }, headless = true } = {}) {
  mkdirSync(evidenceDir, { recursive: true })
  const userDataDir = mkdtempSync(join(tmpdir(), 'tk-evidence-'))
  const videoTmp = mkdtempSync(join(tmpdir(), 'tk-evidence-video-'))
  // 拡張機能は Playwright 同梱の Chromium（channel: 'chromium'）でしか読み込めない
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', headless, viewport,
    recordVideo: { dir: videoTmp, size: viewport },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
  const extensionId = new URL(serviceWorker.url()).host
  // recordVideo はコンテキスト単位なので、最初から開いているタブは閉じておく（不要な動画を残さない）
  await Promise.all(context.pages().map(p => p.close()))

  // 1ケース = 1ページ。画面のエラーはケースごとに集め、checks に書けるようにする
  async function startCase(name, { video = false } = {}) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    return {
      page, errors,
      // 画像のケースは、見せたい状態で 1 枚撮る
      shot: (file = `${name}.png`) => page.screenshot({ path: join(evidenceDir, file) }),
      async finish() {
        const rec = page.video()
        // 操作の直後に閉じると最後の状態が動画に残らない（短すぎると 1 フレームも無く保存に失敗する）ので少し待つ
        if (video) await page.waitForTimeout(800)
        await page.close()
        if (video && rec) await rec.saveAs(join(evidenceDir, `${name}.webm`))
        if (rec) await rec.delete()
        return errors
      },
    }
  }

  return {
    context, extensionId, serviceWorker, startCase,
    url: path => `chrome-extension://${extensionId}/${path}`,
    // chrome.storage へ前提のデータを入れる（撮影の操作を省いてプレビュー画面を開く時など）
    seedStorage: (area, data) => serviceWorker.evaluate(([a, d]) => chrome.storage[a].set(d), [area, data]),
    async close() {
      await context.close()
      rmSync(userDataDir, { recursive: true, force: true })
      rmSync(videoTmp, { recursive: true, force: true })
    },
  }
}

// テスト用の背景画像（格子）を dataURL で作る。スクリーンショットのプレビュー画面に渡す
export async function makeGridImage(context, width = 1200, height = 700) {
  const page = await context.newPage()
  const url = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d'); g.fillStyle = '#eef1f5'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#cfd6df'
    for (let x = 0; x < w; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
    for (let y = 0; y < h; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
    return c.toDataURL('image/png')
  }, [width, height])
  const rec = page.video()
  await page.close()
  if (rec) await rec.delete()
  return url
}

// スクリーンショットのプレビュー画面を開く（撮影の操作は省き、worker.js と同じ形でデータを渡す）
export async function openScreenshotPreview(ext, page, { dataUrl, baseName = 'evidence' }) {
  await ext.seedStorage('session', { tm_screenshot_pending: { dataUrl, baseName, truncated: false } })
  await page.goto(ext.url('screenshot-preview.html'))
  await page.waitForSelector('#sp-canvas:not([hidden])')
  return canvasHelpers(page, '#sp-canvas')
}

// canvas 内の座標（画像のピクセル）を画面の座標に直す・画素を読む
export async function canvasHelpers(page, selector) {
  const box = await page.locator(selector).boundingBox()
  const width = await page.$eval(selector, el => el.width)
  const scale = box.width / width
  return {
    scale,
    point: (x, y) => [box.x + x * scale, box.y + y * scale],
    pixel: (x, y) => page.$eval(selector, (el, [px, py]) => Array.from(el.getContext('2d').getImageData(px, py, 1, 1).data), [x, y]),
  }
}
