/**
 * recorder-overlay.js — 動画キャプチャのページ内オーバーレイ（矩形選択UI＋録画中バナー）
 *
 * worker.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * 矩形選択の見た目・ドラッグ検出は modules/screenshot/rect-picker.js のパターンを踏襲する。
 */

// executeScript は func を toString() で直列化して注入するため、外側スコープを参照しない自己完結な関数にすること
function videoCaptureOverlay(mode) {
  const OV_ATTR = 'data-tm-video-capture-active';
  if (document.documentElement.hasAttribute(OV_ATTR)) return;
  document.documentElement.setAttribute(OV_ATTR, '1');

  function createBanner() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', gap: '10px',
      background: '#222', color: '#fff', padding: '6px 10px 6px 14px', borderRadius: '999px',
      fontFamily: 'Segoe UI, Hiragino Sans, Meiryo, sans-serif', fontSize: '13px', whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(el);
    return el;
  }

  const banner = createBanner();
  let phase = 'selecting';

  function onKey(e) {
    if (phase === 'selecting' && e.key === 'Escape') { e.preventDefault(); cancelSelection(); }
  }
  document.addEventListener('keydown', onKey, true);

  function onBgMessage(msg) {
    if (msg.type === 'vcRecordingSaved' || msg.type === 'vcRecordingFailed') cleanup();
    if (msg.type === 'vcAutoStopWarning') showAutoStopWarning();
  }
  chrome.runtime.onMessage.addListener(onBgMessage);

  function showAutoStopWarning() {
    if (phase !== 'recording') return;
    banner.style.background = '#b45309';
    const warn = document.createElement('span');
    warn.textContent = '残り1分で自動停止します';
    banner.insertBefore(warn, banner.firstChild);
  }

  function cleanup() {
    clearInterval(timerId);
    document.removeEventListener('keydown', onKey, true);
    chrome.runtime.onMessage.removeListener(onBgMessage);
    document.documentElement.removeAttribute(OV_ATTR);
    banner.remove();
  }

  // --- 選択フェーズ（矩形選択モードのみ） ---
  let startX = 0, startY = 0, dragging = false, overlay = null, box = null, label = null;
  const MIN_DRAG_SIZE = 4; // これ未満はクリック誤操作として無視し、ドラッグ待ちを継続する

  function showSelectingUI() {
    banner.textContent = 'ドラッグで録画範囲を選択　Esc で中止';

    overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646', cursor: 'crosshair' });
    document.documentElement.appendChild(overlay);

    box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', display: 'none', boxSizing: 'border-box',
      border: '2px solid #0ea5e9', background: 'rgba(14,165,233,0.15)',
    });
    document.documentElement.appendChild(box);

    label = document.createElement('div');
    Object.assign(label.style, {
      position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', display: 'none',
      background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px',
      fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(label);

    overlay.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function rectFromPoint(x, y) {
    return { left: Math.min(startX, x), top: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY) };
  }
  function renderBox(r) {
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    label.textContent = Math.round(r.width) + ' x ' + Math.round(r.height);
    label.style.display = 'block';
    label.style.left = r.left + 'px';
    label.style.top = (r.top >= 22 ? r.top - 22 : r.top + r.height + 4) + 'px';
  }
  function onDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    renderBox({ left: startX, top: startY, width: 0, height: 0 });
  }
  function onMove(e) {
    if (!dragging) return;
    renderBox(rectFromPoint(e.clientX, e.clientY));
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    const r = rectFromPoint(e.clientX, e.clientY);
    if (r.width < MIN_DRAG_SIZE || r.height < MIN_DRAG_SIZE) { box.style.display = 'none'; label.style.display = 'none'; return; }
    confirmSelection(r);
  }

  function removeSelectionUI() {
    overlay.removeEventListener('mousedown', onDown);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    overlay.remove(); box.remove(); label.remove();
  }

  function cancelSelection() {
    removeSelectionUI();
    chrome.runtime.sendMessage({ type: 'vcRectCancelled' });
    cleanup();
  }

  function confirmSelection(rect) {
    removeSelectionUI();
    phase = 'starting';
    banner.textContent = '録画準備中…';
    chrome.runtime.sendMessage({
      type: 'vcRectSelected',
      rect,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }, res => {
      if (!res || !res.ok) { cleanup(); return; }
      showRecordingUI();
    });
  }

  // --- 録画中フェーズ ---
  let startedAt = 0, timerId = 0;

  function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function showRecordingUI() {
    phase = 'recording';
    banner.innerHTML = '';
    const dot = document.createElement('span');
    Object.assign(dot.style, { width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' });
    const timeEl = document.createElement('span');
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.textContent = '⏹ 録画終了';
    Object.assign(stopBtn.style, {
      border: 'none', borderRadius: '999px', padding: '4px 10px', cursor: 'pointer',
      background: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: '600',
    });
    banner.append(dot, timeEl, stopBtn);

    startedAt = Date.now();
    timeEl.textContent = formatElapsed(0);
    timerId = setInterval(() => { timeEl.textContent = formatElapsed(Date.now() - startedAt); }, 1000);

    stopBtn.addEventListener('click', () => {
      stopBtn.disabled = true;
      banner.textContent = '保存中…';
      clearInterval(timerId);
      chrome.runtime.sendMessage({ type: 'vcStopClicked' });
    });
  }

  if (mode === 'rect') showSelectingUI();
  else showRecordingUI();
}

async function runVideoOverlay(tabId, mode) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: videoCaptureOverlay,
    args: [mode],
  });
}
