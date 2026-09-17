/**
 * rect-picker.js — 「矩形選択」キャプチャ（ドラッグで選択したビューポート内の矩形のみを撮影）
 *
 * worker.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * ページスクロールとの結合は行わない（ビューポート基準の固定範囲のみ）。
 */

// executeScript は func を toString() で直列化して注入するため、外側スコープを参照しない自己完結な関数にすること
function rectPickerOverlay(shotIntervalMs) {
  const OV_ATTR = 'data-tm-rect-picker-active';
  if (document.documentElement.hasAttribute(OV_ATTR)) return;
  document.documentElement.setAttribute(OV_ATTR, '1');

  const prevHtmlCursor = document.documentElement.style.cursor;
  const prevBodyCursor = document.body.style.cursor;
  document.documentElement.style.cursor = 'crosshair';
  document.body.style.cursor = 'crosshair';

  // ドラッグ検出用の全画面オーバーレイ（要素選択モードと異なり elementFromPoint は不要なため pointerEvents: auto で受け止める）
  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647', cursor: 'crosshair' });
  document.documentElement.appendChild(overlay);

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

  const hint = createBanner('ドラッグで範囲を選択　Esc で終了');
  const MIN_DRAG_SIZE = 4; // これ未満はクリック誤操作として無視し、ドラッグ待ちを継続する

  let startX = 0, startY = 0, dragging = false, busy = false;
  let captureIndicator = null; // 撮影の瞬間だけ非表示にする（撮影結果に写り込まないように）

  function rectFromPoint(x, y) {
    return {
      left: Math.min(startX, x), top: Math.min(startY, y),
      width: Math.abs(x - startX), height: Math.abs(y - startY),
    };
  }

  function render(r) {
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    label.textContent = Math.round(r.width) + ' x ' + Math.round(r.height);
    label.style.display = 'block';
    label.style.left = r.left + 'px';
    label.style.top = (r.top >= 22 ? r.top - 22 : r.top + r.height + 4) + 'px';
  }

  function onDown(e) {
    if (busy || e.button !== 0) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    render({ left: startX, top: startY, width: 0, height: 0 });
  }

  function onMove(e) {
    if (busy || !dragging) return;
    render(rectFromPoint(e.clientX, e.clientY));
  }

  function onUp(e) {
    if (busy || !dragging) return;
    dragging = false;
    const r = rectFromPoint(e.clientX, e.clientY);
    if (r.width < MIN_DRAG_SIZE || r.height < MIN_DRAG_SIZE) { box.style.display = 'none'; label.style.display = 'none'; return; }
    confirmSelection(r);
  }

  function onKey(e) {
    if (busy) return;
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
  }

  overlay.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKey, true);

  function cleanup() {
    overlay.removeEventListener('mousedown', onDown);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.cursor = prevHtmlCursor;
    document.body.style.cursor = prevBodyCursor;
    document.documentElement.removeAttribute(OV_ATTR);
    overlay.remove();
    box.remove();
    label.remove();
    hint.remove();
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

  function confirmSelection(rect) {
    if (busy) return;
    busy = true;
    cleanup();
    captureIndicator = createBanner('📸 撮影中…');
    captureRect(rect)
      .catch(() => { chrome.runtime.sendMessage({ type: 'pickerCaptureFailed' }); })
      .finally(() => captureIndicator.remove());
  }

  async function captureRect(rect) {
    captureIndicator.style.display = 'none'; // 撮影結果に写り込まないよう、再描画の時間を確保して隠す
    await sleep(shotIntervalMs);
    const dataUrl = await requestShot();
    captureIndicator.style.display = '';
    if (!dataUrl) throw new Error('キャプチャに失敗しました');

    const img = await loadImage(dataUrl);
    const ratio = img.naturalWidth / window.innerWidth; // captureVisibleTab は物理ピクセルで返るため CSS px との比率で換算
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      Math.round(rect.left * ratio), Math.round(rect.top * ratio), canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height
    );

    chrome.runtime.sendMessage({
      type: 'pickerCaptureComplete',
      dataUrl: canvas.toDataURL('image/png'),
      title: document.title,
      truncated: false,
    });
  }
}

async function runRectPicker(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは選択できません');
  await chrome.scripting.executeScript({
    target: { tabId },
    func: rectPickerOverlay,
    args: [SCREENSHOT_CAPTURE_INTERVAL_MS],
  });
}
