/**
 * worker.js — スクリーンショット撮影の Service Worker 側実装
 *
 * background.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * captureScreenshot() が撮影・結合まで行い、常に PNG の data URL を返す。
 * 保存形式の選択・変換とダウンロードは screenshot-preview.html 側で行う。
 */
const SCREENSHOT_MAX_SHOTS = 40; // 非常に長いページでの無限ループを防ぐ安全上限
const SCREENSHOT_CAPTURE_INTERVAL_MS = 550; // captureVisibleTab のレート制限（2回/秒）を避けつつ再描画を待つ

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function screenshotBaseName(title) {
  const safe = (title || 'screenshot').replace(/[\\/:*?"<>| -]/g, '_').trim().slice(0, 80) || 'screenshot';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${safe}_${stamp}`;
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

async function captureVisibleTabRetry(windowId) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
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

async function captureScreenshot(tabId, mode) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは撮影できません');
  const baseName = screenshotBaseName(tab.title);
  let dataUrl, truncated = false;
  if (mode === 'fullpage') {
    ({ url: dataUrl, truncated } = await captureFullPage(tab));
  } else {
    dataUrl = await captureVisibleTabRetry(tab.windowId);
  }
  return { dataUrl, baseName, truncated };
}

async function openPreviewTab({ dataUrl, baseName, truncated }) {
  await chrome.storage.session.set({ tm_screenshot_pending: { dataUrl, baseName, truncated } });
  await chrome.tabs.create({ url: chrome.runtime.getURL('screenshot-preview.html') });
}

async function runCaptureAndOpenPreview(tabId, mode) {
  const { dataUrl, baseName, truncated } = await captureScreenshot(tabId, mode);
  await openPreviewTab({ dataUrl, baseName, truncated });
}

// executeScript は func を toString() で直列化して注入するため、外側スコープを参照しない自己完結な関数にすること
function elementPickerOverlay(shotIntervalMs, maxShots) {
  const OV_ATTR = 'data-tm-element-picker-active';
  if (document.documentElement.hasAttribute(OV_ATTR)) return;
  document.documentElement.setAttribute(OV_ATTR, '1');

  const prevHtmlCursor = document.documentElement.style.cursor;
  const prevBodyCursor = document.body.style.cursor;
  document.documentElement.style.cursor = 'crosshair';
  document.body.style.cursor = 'crosshair';

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', display: 'none', boxSizing: 'border-box',
    border: '2px solid #0ea5e9', background: 'rgba(14,165,233,0.15)',
  });
  document.documentElement.appendChild(box);

  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', display: 'none',
    background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px',
    fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap',
  });
  document.documentElement.appendChild(label);

  function createBanner(text) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647',
      pointerEvents: 'none', background: '#222', color: '#fff', padding: '6px 14px', borderRadius: '999px',
      fontFamily: 'Segoe UI, Hiragino Sans, Meiryo, sans-serif', fontSize: '13px', whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(el);
    return el;
  }

  const hint = createBanner('クリック/Enter で選択　Esc で終了');

  let current = null, busy = false;
  let captureIndicator = null; // ショット撮影の瞬間だけ非表示にする（撮影結果に写り込まないように）

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).join('.');
    return s;
  }

  function render() {
    if (!current) { box.style.display = 'none'; label.style.display = 'none'; return; }
    const r = current.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    label.textContent = describe(current);
    label.style.display = 'block';
    label.style.left = r.left + 'px';
    label.style.top = (r.top >= 22 ? r.top - 22 : r.bottom + 4) + 'px';
  }

  function onMove(e) {
    if (busy) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === label) return;
    current = el;
    render();
  }

  function onClick(e) {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    confirmSelection();
  }

  function onKey(e) {
    if (busy) return;
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); return; }
    if (e.key === 'Enter') { e.preventDefault(); confirmSelection(); }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  function cleanup() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.cursor = prevHtmlCursor;
    document.body.style.cursor = prevBodyCursor;
    document.documentElement.removeAttribute(OV_ATTR);
    box.remove();
    label.remove();
    hint.remove();
  }

  function confirmSelection() {
    if (busy || !current) return;
    busy = true;
    const target = current;
    cleanup();
    captureIndicator = createBanner('📸 要素をキャプチャ中…');
    captureElement(target)
      .catch(() => { chrome.runtime.sendMessage({ type: 'elementCaptureFailed' }); })
      .finally(() => captureIndicator.remove());
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function requestShot() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'captureTab' }, res => resolve(res && res.dataUrl));
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // total を step 幅で刻んだオフセット一覧を返す（最後だけ total に合わせて詰める）
  function axisOffsets(total, step) {
    const offsets = [0];
    let v = 0;
    while (v + step < total) {
      v = Math.min(v + step, total - step);
      offsets.push(v);
    }
    return offsets;
  }

  // ページ全体キャプチャの hideFixedElements/restoreFixedElements と同じ属性方式・スコープ（要素内部の sticky な子要素だけでなく、要素の矩形に重なるページ側の固定要素も対象にできる）
  function hideFixedOrSticky() {
    document.querySelectorAll('body *').forEach(node => {
      const pos = getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'sticky') {
        node.setAttribute('data-tm-screenshot-hidden', node.style.visibility || '');
        node.style.visibility = 'hidden';
      }
    });
  }
  function restoreFixedOrSticky() {
    document.querySelectorAll('[data-tm-screenshot-hidden]').forEach(node => {
      node.style.visibility = node.getAttribute('data-tm-screenshot-hidden');
      node.removeAttribute('data-tm-screenshot-hidden');
    });
  }

  async function captureElement(el) {
    const originalWinX = window.scrollX, originalWinY = window.scrollY;
    const originalElLeft = el.scrollLeft, originalElTop = el.scrollTop;

    const scrollW = el.scrollWidth, scrollH = el.scrollHeight;
    const clientW = el.clientWidth, clientH = el.clientHeight;
    const maxElLeft = Math.max(0, scrollW - clientW), maxElTop = Math.max(0, scrollH - clientH);

    // 要素のドキュメント上の位置（内部スクロールでは変わらない）を基準に、コンテンツ座標→ページスクロール量を逆算する
    const initRect = el.getBoundingClientRect();
    const elDocLeft = window.scrollX + initRect.left, elDocTop = window.scrollY + initRect.top;

    const stepY = Math.max(1, Math.min(clientH, window.innerHeight));
    const stepX = Math.max(1, Math.min(clientW, window.innerWidth));
    const yOffsets = axisOffsets(scrollH, stepY);
    const xOffsets = axisOffsets(scrollW, stepX);

    // 要素内部スクロールで動かせない残り分をページスクロールで補う（要素自体が画面より大きい場合を含む）。
    // 自分自身のスクロール操作でページ全体の寸法は変わらない前提でループ外で一度だけ計算する
    const maxPageY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const maxPageX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

    const shots = [];
    let truncated = false;
    let fixedHidden = false;

    outer:
    for (const contentY of yOffsets) {
      for (const contentX of xOffsets) {
        if (shots.length >= maxShots) { truncated = true; break outer; }

        const elTop = Math.min(contentY, maxElTop), elLeft = Math.min(contentX, maxElLeft);
        el.scrollTop = elTop; el.scrollLeft = elLeft;

        const targetWinY = Math.min(Math.max(0, elDocTop + (contentY - elTop)), maxPageY);
        const targetWinX = Math.min(Math.max(0, elDocLeft + (contentX - elLeft)), maxPageX);
        window.scrollTo(targetWinX, targetWinY);

        if (!fixedHidden) { hideFixedOrSticky(); fixedHidden = true; }
        captureIndicator.style.display = 'none'; // 撮影結果に写り込まないよう、再描画の時間を確保して隠す
        await sleep(shotIntervalMs);

        const r = el.getBoundingClientRect();
        const visLeft = Math.max(r.left, 0), visTop = Math.max(r.top, 0);
        const visRight = Math.min(r.right, window.innerWidth), visBottom = Math.min(r.bottom, window.innerHeight);
        if (visRight - visLeft < 1 || visBottom - visTop < 1) { captureIndicator.style.display = ''; continue; }

        const dataUrl = await requestShot();
        captureIndicator.style.display = '';
        if (!dataUrl) { truncated = true; break outer; }
        shots.push({
          dataUrl,
          screenRect: { left: visLeft, top: visTop, right: visRight, bottom: visBottom },
          contentX: elLeft + (visLeft - r.left),
          contentY: elTop + (visTop - r.top),
        });
      }
    }

    if (fixedHidden) restoreFixedOrSticky();
    el.scrollLeft = originalElLeft; el.scrollTop = originalElTop;
    window.scrollTo(originalWinX, originalWinY);

    if (!shots.length) throw new Error('キャプチャ範囲を取得できませんでした');

    const images = await Promise.all(shots.map(s => loadImage(s.dataUrl)));
    const ratio = images[0].naturalWidth / window.innerWidth; // captureVisibleTab は物理ピクセルで返るため CSS px との比率で換算
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(scrollW * ratio);
    canvas.height = Math.round(scrollH * ratio);
    const ctx = canvas.getContext('2d');
    shots.forEach((s, i) => {
      const sx = Math.round(s.screenRect.left * ratio), sy = Math.round(s.screenRect.top * ratio);
      const sw = Math.round((s.screenRect.right - s.screenRect.left) * ratio);
      const sh = Math.round((s.screenRect.bottom - s.screenRect.top) * ratio);
      ctx.drawImage(images[i], sx, sy, sw, sh, Math.round(s.contentX * ratio), Math.round(s.contentY * ratio), sw, sh);
    });

    chrome.runtime.sendMessage({
      type: 'elementCaptureComplete',
      dataUrl: canvas.toDataURL('image/png'),
      title: document.title,
      truncated,
    });
  }
}

async function runElementPicker(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは選択できません');
  await chrome.scripting.executeScript({
    target: { tabId },
    func: elementPickerOverlay,
    args: [SCREENSHOT_CAPTURE_INTERVAL_MS, SCREENSHOT_MAX_SHOTS],
  });
}

// 遅延起動・即時実行の両経路から呼ばれる、モードごとの処理の振り分け
async function runModeAction(tabId, mode) {
  if (mode === 'element') {
    await runElementPicker(tabId);
    return { picking: true };
  }
  await runCaptureAndOpenPreview(tabId, mode);
  return {};
}

const SCREENSHOT_BADGE_COLOR = '#0ea5e9'; // styles/base.css の --tm-accent と統一
const SCREENSHOT_BADGE_ERROR_COLOR = '#dc2626'; // styles/base.css の --tm-error と統一

// ポップアップは既に閉じている想定のため、エラー通知はバッジの一時表示に留める
async function flashBadgeError() {
  await chrome.action.setBadgeBackgroundColor({ color: SCREENSHOT_BADGE_ERROR_COLOR });
  await chrome.action.setBadgeText({ text: '!' });
  await sleep(3000);
  await chrome.action.setBadgeText({ text: '' });
}

// ポップアップはフォーカスが外れると閉じるため、遅延中は拡張機能アイコンのバッジで残り秒数を知らせる
async function runDelayedCapture(tabId, mode, delaySeconds) {
  for (let remaining = delaySeconds; remaining > 0; remaining--) {
    await chrome.action.setBadgeBackgroundColor({ color: SCREENSHOT_BADGE_COLOR });
    await chrome.action.setBadgeText({ text: String(remaining) });
    await sleep(1000);
  }
  await chrome.action.setBadgeText({ text: '' });
  try {
    await runModeAction(tabId, mode);
  } catch (e) {
    await flashBadgeError();
  }
}
