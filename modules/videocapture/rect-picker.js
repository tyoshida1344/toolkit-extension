/**
 * rect-picker.js — 動画キャプチャの「矩形選択」UI（ページへ注入するオーバーレイ）
 *
 * worker.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * 見た目・ドラッグ検出は modules/screenshot/rect-picker.js のパターンを踏襲する。
 * 選択が確定して録画が始まると、このオーバーレイは録画内容に映り込まないよう完全に消える。
 * 録画中の状態表示・停止操作はポップアップ（index.js）と拡張機能アイコンのバッジが担う。
 */

// executeScript は func を toString() で直列化して注入するため、外側スコープを参照しない自己完結な関数にすること
function videoRectPickerOverlay() {
  const OV_ATTR = 'data-tm-video-rect-picker-active';
  if (document.documentElement.hasAttribute(OV_ATTR)) return;
  document.documentElement.setAttribute(OV_ATTR, '1');

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

  const hint = createBanner('ドラッグで録画範囲を選択　Esc で中止');
  const MIN_DRAG_SIZE = 4; // これ未満はクリック誤操作として無視し、ドラッグ待ちを継続する

  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646', cursor: 'crosshair' });
  document.documentElement.appendChild(overlay);

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', display: 'none', boxSizing: 'border-box',
    border: '2px solid #0ea5e9', background: 'rgba(14,165,233,0.15)',
  });
  document.documentElement.appendChild(box);

  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', display: 'none',
    background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px',
    fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap',
  });
  document.documentElement.appendChild(label);

  let startX = 0, startY = 0, dragging = false, busy = false;

  function rectFromPoint(x, y) {
    return { left: Math.min(startX, x), top: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY) };
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
    if (e.key === 'Escape') { e.preventDefault(); cancelSelection(); }
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
    document.documentElement.removeAttribute(OV_ATTR);
    overlay.remove(); box.remove(); label.remove(); hint.remove();
  }

  function cancelSelection() {
    if (busy) return;
    busy = true;
    cleanup();
    chrome.runtime.sendMessage({ type: 'vcRectCancelled' });
  }

  function confirmSelection(rect) {
    if (busy) return;
    busy = true;
    cleanup(); // 録画が始まると映り込んでしまうため、選択UIはここで完全に消す（録画中の表示・停止操作はポップアップ側が担う）
    chrome.runtime.sendMessage({
      type: 'vcRectSelected',
      rect,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    });
  }
}

async function runVideoRectPicker(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: videoRectPickerOverlay,
  });
}
