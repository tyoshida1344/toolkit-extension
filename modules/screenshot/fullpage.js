/**
 * fullpage.js — 「ページ全体」キャプチャ（スクロール結合）
 *
 * worker.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * sleep / SCREENSHOT_MAX_SHOTS / SCREENSHOT_CAPTURE_INTERVAL_MS / captureVisibleTabRetry は
 * worker.js 側で定義済みのものを呼び出し時点で参照する。
 */

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

// Service Worker には URL.createObjectURL が無いため、data URL 化して chrome.storage.session 経由でプレビュータブへ渡す
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('blob read failed'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

async function captureFullPage(tab) {
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
    const dataUrl = await captureVisibleTabRetry(tab.windowId);
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

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { url: await blobToDataUrl(blob), truncated };
}
