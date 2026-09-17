/**
 * worker.js — スクリーンショット撮影の Service Worker 側実装
 *
 * background.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * captureScreenshot() が撮影・結合・形式変換まで行い、結果（data URL）を返す。
 * 保存（ダウンロード）は screenshot-preview.html 側で chrome.downloads.download により行う。
 */
const SCREENSHOT_MAX_SHOTS = 40; // 非常に長いページでの無限ループを防ぐ安全上限
const SCREENSHOT_CAPTURE_INTERVAL_MS = 550; // captureVisibleTab のレート制限（2回/秒）を避けつつ再描画を待つ

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function screenshotFilename(title, format) {
  const safe = (title || 'screenshot').replace(/[\\/:*?"<>| -]/g, '_').trim().slice(0, 80) || 'screenshot';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = format === 'jpeg' ? 'jpg' : (format || 'png');
  return `${safe}_${stamp}.${ext}`;
}

// Service Worker には URL.createObjectURL が無いため、data URL 化して chrome.storage.session 経由でプレビュータブへ渡す
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('blob read failed'));
    reader.readAsDataURL(blob);
  });
}

async function captureVisibleTabRetry(windowId, format) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: format || 'png' });
    } catch (e) {
      if (attempt >= 2) throw e;
      await sleep(700);
    }
  }
}

async function dataUrlToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

// captureVisibleTab は png/jpeg のみネイティブ対応。webp 等それ以外の形式は PNG で取得後にここで再エンコードする
async function convertPngDataUrl(dataUrl, format) {
  if (format === 'png') return dataUrl;
  const bitmap = await dataUrlToBitmap(dataUrl);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const outBlob = await canvas.convertToBlob({ type: `image/${format}`, quality: 0.92 });
  return blobToDataUrl(outBlob);
}

// executeScript は func を toString() で直列化して注入するため、外側スコープを参照しない自己完結な関数にすること
function getPageMetrics() {
  return {
    scrollY: window.scrollY,
    totalHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  };
}

function scrollPageTo(y) {
  window.scrollTo(0, y);
  return window.scrollY;
}

// 固定ヘッダー等（position: fixed / sticky）を結合画像に重複して写さないよう、2枚目以降の撮影前に非表示にする
function hideFixedElements() {
  document.querySelectorAll('body *').forEach(el => {
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky') {
      el.setAttribute('data-tm-screenshot-hidden', el.style.visibility || '');
      el.style.visibility = 'hidden';
    }
  });
}

function restoreFixedElements() {
  document.querySelectorAll('[data-tm-screenshot-hidden]').forEach(el => {
    el.style.visibility = el.getAttribute('data-tm-screenshot-hidden');
    el.removeAttribute('data-tm-screenshot-hidden');
  });
}

async function execOnTab(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result;
}

async function captureFullPage(tab, format) {
  const metrics = await execOnTab(tab.id, getPageMetrics);
  const originalY = metrics.scrollY;
  const viewportH = metrics.viewportHeight || 1;
  const totalH = metrics.totalHeight || viewportH;

  const shots = [];
  let y = 0, lastY = -1, truncated = true, fixedHidden = false;
  for (let i = 0; i < SCREENSHOT_MAX_SHOTS; i++) {
    const actualY = await execOnTab(tab.id, scrollPageTo, [y]);
    if (actualY === lastY && i > 0) { truncated = false; break; } // これ以上スクロールできない（最下部）
    lastY = actualY;
    await sleep(SCREENSHOT_CAPTURE_INTERVAL_MS);
    const dataUrl = await captureVisibleTabRetry(tab.windowId, 'png'); // 結合前の各ショットは劣化を避けるため常に PNG
    shots.push({ y: actualY, dataUrl });
    if (actualY + viewportH >= totalH) { truncated = false; break; }
    // 先頭（ページ最上部）のみ固定ヘッダー等を写し、以降のキャプチャでは重複を避けるため非表示にする
    if (!fixedHidden) { await execOnTab(tab.id, hideFixedElements); fixedHidden = true; }
    y += viewportH;
  }
  if (fixedHidden) await execOnTab(tab.id, restoreFixedElements);
  await execOnTab(tab.id, scrollPageTo, [originalY]);

  const bitmaps = await Promise.all(shots.map(s => dataUrlToBitmap(s.dataUrl)));
  const ratio = bitmaps[0].width / metrics.viewportWidth; // captureVisibleTab は物理ピクセルで返るため CSS px との比率で換算
  const width = bitmaps[0].width;
  const height = Math.ceil(Math.max(...shots.map((s, i) => s.y * ratio + bitmaps[i].height)));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  shots.forEach((s, i) => ctx.drawImage(bitmaps[i], 0, Math.round(s.y * ratio)));

  const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: format === 'png' ? undefined : 0.92 });
  return { url: await blobToDataUrl(blob), truncated };
}

async function captureScreenshot(tabId, mode, format) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは撮影できません');
  const fmt = format || 'png';
  const filename = screenshotFilename(tab.title, fmt);
  let dataUrl, truncated = false;
  if (mode === 'fullpage') {
    ({ url: dataUrl, truncated } = await captureFullPage(tab, fmt));
  } else if (fmt === 'webp') {
    const raw = await captureVisibleTabRetry(tab.windowId, 'png');
    dataUrl = await convertPngDataUrl(raw, 'webp');
  } else {
    dataUrl = await captureVisibleTabRetry(tab.windowId, fmt); // png/jpeg はネイティブ対応
  }
  return { dataUrl, filename, truncated };
}
