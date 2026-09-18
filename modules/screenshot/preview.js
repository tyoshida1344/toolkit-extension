async function convertPngDataUrl(dataUrl, format) {
  if (format === 'png') return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas.toDataURL(`image/${format}`, 0.92);
}

function extFor(format) { return format === 'jpeg' ? 'jpg' : format; }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    image.src = src;
  });
}

const ANN_FONT_FAMILY = "'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif";

/**
 * 注釈エディタ本体。canvas に撮影結果を描画し、四角形・矢印・吹き出し・テキストの
 * 追加/選択/移動/削除を扱う。エクスポート（保存・コピー）用に注釈込みの
 * dataURL / Blob を取得する API を返す。
 */
function createAnnotationEditor(canvas, canvasWrap, baseImage) {
  const ctx = canvas.getContext('2d');
  // 選択中図形の枠線は base.css の --tm-accent と揃える（ハードコードによる二重管理を避ける）
  const ACCENT_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--tm-accent').trim() || '#0ea5e9';
  const shapes = [];
  let nextId = 1;
  let currentTool = 'rect';
  let currentColor = '#ff3b30';
  let currentLineWidth = 3;
  let currentFontSize = 20;
  let selectedId = null;
  let draft = null; // 描画中の一時図形（確定前のプレビュー）
  let bubbleAwaitingTail = null; // 吹き出し本体を確定し、尻尾の位置待ちの状態 { x1, y1, x2, y2 }
  let tailPreviewPoint = null;
  let dragMove = null; // 選択中の図形をドラッグ移動中の状態 { id, origin, startPoint }
  let textEditorEl = null;

  // getBoundingClientRect() は1回にまとめ、キャンバス内座標と CSS 表示倍率を同時に返す
  function measurePointer(evt) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    return { scale, x: (evt.clientX - rect.left) / scale, y: (evt.clientY - rect.top) / scale };
  }

  function findShape(id) { return shapes.find(s => s.id === id) || null; }
  function textLines(s) { return (s.text || '').split('\n'); }

  // ── 図形の描画 ──
  function drawRectShape(c, s) {
    c.strokeStyle = s.color; c.lineWidth = s.lineWidth;
    c.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  }

  function drawArrowShape(c, s) {
    const { x1, y1, x2, y2, color, lineWidth } = s;
    const headLen = Math.max(10, lineWidth * 4);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lineWidth; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2 - Math.cos(angle) * headLen * 0.5, y2 - Math.sin(angle) * headLen * 0.5);
    c.stroke();
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
    c.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
    c.closePath();
    c.fill();
  }

  function drawTextShape(c, s) {
    c.fillStyle = s.color; c.font = `${s.fontSize}px ${ANN_FONT_FAMILY}`; c.textBaseline = 'top';
    const lineHeight = s.fontSize * 1.3;
    textLines(s).forEach((line, i) => c.fillText(line, s.x, s.y + i * lineHeight));
  }

  function bubbleRect(s) {
    return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }

  // 吹き出し本体の枠上で、尻尾の先端 (px, py) に最も近い辺の位置を求める
  function bubbleTailBase(rect, px, py) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const dx = rect.w ? (px - cx) / rect.w : 0, dy = rect.h ? (py - cy) / rect.h : 0;
    const off = Math.min(8, rect.w / 2, rect.h / 2);
    if (Math.abs(dx) > Math.abs(dy)) {
      const x = dx > 0 ? rect.x + rect.w : rect.x;
      const y = Math.min(Math.max(py, rect.y + off), rect.y + rect.h - off);
      return { x, y, horiz: false };
    }
    const y = dy > 0 ? rect.y + rect.h : rect.y;
    const x = Math.min(Math.max(px, rect.x + off), rect.x + rect.w - off);
    return { x, y, horiz: true };
  }

  function drawBubbleShape(c, s) {
    const rect = bubbleRect(s);
    if (rect.w < 1 || rect.h < 1) return;
    const r = Math.min(16, rect.w / 2, rect.h / 2);
    const BORDER = 2;

    if (s.tailX != null && s.tailY != null) {
      const base = bubbleTailBase(rect, s.tailX, s.tailY);
      const off = 8;
      const p1 = base.horiz ? { x: base.x - off, y: base.y } : { x: base.x, y: base.y - off };
      const p2 = base.horiz ? { x: base.x + off, y: base.y } : { x: base.x, y: base.y + off };
      c.beginPath();
      c.moveTo(p1.x, p1.y); c.lineTo(s.tailX, s.tailY); c.lineTo(p2.x, p2.y); c.closePath();
      c.fillStyle = '#ffffff'; c.fill();
      c.strokeStyle = s.color; c.lineWidth = BORDER; c.stroke();
    }

    c.beginPath();
    c.moveTo(rect.x + r, rect.y);
    c.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, r);
    c.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, r);
    c.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, r);
    c.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, r);
    c.closePath();
    c.fillStyle = '#ffffff'; c.fill();
    c.strokeStyle = s.color; c.lineWidth = BORDER; c.stroke();

    if (s.text) {
      c.save();
      c.beginPath();
      c.rect(rect.x + 8, rect.y + 6, Math.max(0, rect.w - 16), Math.max(0, rect.h - 12));
      c.clip();
      c.fillStyle = s.color; c.font = `${s.fontSize}px ${ANN_FONT_FAMILY}`; c.textBaseline = 'top';
      const lineHeight = s.fontSize * 1.3;
      textLines(s).forEach((line, i) => c.fillText(line, rect.x + 8, rect.y + 6 + i * lineHeight));
      c.restore();
    }
  }

  function drawShape(c, s) {
    if (s.type === 'rect') drawRectShape(c, s);
    else if (s.type === 'arrow') drawArrowShape(c, s);
    else if (s.type === 'text') drawTextShape(c, s);
    else if (s.type === 'bubble') drawBubbleShape(c, s);
  }

  // ── 当たり判定 ──
  function shapeBounds(s) {
    if (s.type === 'rect' || s.type === 'arrow') {
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    }
    if (s.type === 'bubble') return bubbleRect(s);
    ctx.font = `${s.fontSize}px ${ANN_FONT_FAMILY}`;
    const lineHeight = s.fontSize * 1.3;
    const lines = textLines(s);
    const w = Math.max(...lines.map(l => ctx.measureText(l).width), 1);
    return { x: s.x, y: s.y, w, h: lineHeight * Math.max(lines.length, 1) };
  }

  function pointNearSegment(px, py, x1, y1, x2, y2, tol) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) <= tol;
  }

  function hitTest(px, py) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === 'arrow') {
        if (pointNearSegment(px, py, s.x1, s.y1, s.x2, s.y2, Math.max(8, s.lineWidth))) return s;
        continue;
      }
      const b = shapeBounds(s);
      const tol = 6;
      if (px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol) return s;
      if (s.type === 'bubble' && s.tailX != null) {
        const base = bubbleTailBase(b, s.tailX, s.tailY);
        if (pointNearSegment(px, py, base.x, base.y, s.tailX, s.tailY, 8)) return s;
      }
    }
    return null;
  }

  // ── 全体描画 ──
  function renderScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);
    shapes.forEach(s => drawShape(ctx, s));

    if (draft) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      drawShape(ctx, draft);
      ctx.restore();
    }
    if (bubbleAwaitingTail && tailPreviewPoint) {
      const rect = bubbleRect(bubbleAwaitingTail);
      const base = bubbleTailBase(rect, tailPreviewPoint.x, tailPreviewPoint.y);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tailPreviewPoint.x, tailPreviewPoint.y); ctx.stroke();
      ctx.restore();
    }
    if (selectedId != null) {
      const s = findShape(selectedId);
      if (s) {
        const b = shapeBounds(s);
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = ACCENT_COLOR;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        ctx.restore();
      }
    }
  }

  function getExportDataUrl() {
    const prevSelected = selectedId;
    selectedId = null;
    renderScene();
    const url = canvas.toDataURL('image/png');
    selectedId = prevSelected;
    renderScene();
    return url;
  }

  function getExportBlob() {
    return new Promise(resolve => {
      const prevSelected = selectedId;
      selectedId = null;
      renderScene();
      canvas.toBlob(blob => {
        selectedId = prevSelected;
        renderScene();
        resolve(blob);
      }, 'image/png');
    });
  }

  // ── ツールバー ──
  const toolButtons = _TkUtils.qsa('.ann-tool-btn');
  const colorInput = document.getElementById('ann-color');
  const sizeInput = document.getElementById('ann-size');
  const sizeLabel = document.getElementById('ann-size-label');
  const deleteBtn = document.getElementById('ann-delete');

  function isFontSizeTool(tool) { return tool === 'text' || tool === 'bubble'; }

  function syncStyleInputs() {
    const isSelect = currentTool === 'select';
    colorInput.disabled = isSelect;
    sizeInput.disabled = isSelect;
    const label = isFontSizeTool(currentTool) ? '文字サイズ' : '太さ';
    sizeLabel.textContent = label;
    sizeInput.title = label;
    sizeInput.setAttribute('aria-label', label);
    if (isFontSizeTool(currentTool)) {
      sizeInput.min = '10'; sizeInput.max = '72'; sizeInput.value = String(currentFontSize);
    } else {
      sizeInput.min = '1'; sizeInput.max = '20'; sizeInput.value = String(currentLineWidth);
    }
  }

  function cancelBubbleAwaitingTail() { bubbleAwaitingTail = null; tailPreviewPoint = null; }

  function closeTextEditor(commit) {
    if (!textEditorEl) return;
    const el = textEditorEl;
    const handlers = el._annHandlers;
    const value = el.value;
    textEditorEl = null;
    el.remove();
    if (commit && handlers && handlers.onCommit) handlers.onCommit(value);
  }

  function selectShape(id) {
    selectedId = id;
    deleteBtn.disabled = id == null;
    renderScene();
  }

  function setTool(tool) {
    closeTextEditor(true);
    draft = null;
    cancelBubbleAwaitingTail();
    dragMove = null;
    currentTool = tool;
    selectedId = null;
    toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    deleteBtn.disabled = true;
    syncStyleInputs();
    renderScene();
  }

  toolButtons.forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

  colorInput.addEventListener('input', () => { currentColor = colorInput.value; });
  _TkUtils.clampInput(sizeInput);
  sizeInput.addEventListener('input', () => {
    const n = parseInt(sizeInput.value, 10);
    if (isNaN(n)) return;
    if (isFontSizeTool(currentTool)) currentFontSize = n; else currentLineWidth = n;
  });

  deleteBtn.addEventListener('click', () => {
    if (selectedId == null) return;
    const idx = shapes.findIndex(s => s.id === selectedId);
    if (idx >= 0) shapes.splice(idx, 1);
    selectShape(null);
  });

  // ── テキスト入力 UI ──
  function openTextEditor(opts) {
    closeTextEditor(true);
    const el = document.createElement('textarea');
    el.className = 'ann-text-editor';
    el.style.left = `${opts.cssX}px`;
    el.style.top = `${opts.cssY}px`;
    el.style.width = `${opts.cssWidth}px`;
    el.style.height = `${opts.cssHeight}px`;
    el.style.color = opts.color;
    el.style.fontSize = `${opts.fontSize * opts.scale}px`;
    el.style.resize = opts.resizable ? 'both' : 'none';
    el.value = opts.initialText || '';
    canvasWrap.appendChild(el);
    textEditorEl = el;
    el._annHandlers = { onCommit: opts.onCommit };
    if (opts.autoGrow) {
      const grow = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
      el.addEventListener('input', grow);
      grow();
    }
    el.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        textEditorEl = null;
        el.remove();
      }
    });
    el.addEventListener('blur', () => { if (textEditorEl === el) closeTextEditor(true); });
    el.focus();
  }

  // ── マウス操作 ──
  function applyMoveDelta(s, origin, dx, dy) {
    if (s.type === 'text') { s.x = origin.x + dx; s.y = origin.y + dy; return; }
    s.x1 = origin.x1 + dx; s.y1 = origin.y1 + dy; s.x2 = origin.x2 + dx; s.y2 = origin.y2 + dy;
    if (s.type === 'bubble' && origin.tailX != null) { s.tailX = origin.tailX + dx; s.tailY = origin.tailY + dy; }
  }

  function onWindowMouseMove(evt) {
    const { x, y } = measurePointer(evt);
    if (draft) {
      draft.x2 = x; draft.y2 = y;
      renderScene();
      return;
    }
    if (dragMove) {
      const dx = x - dragMove.startPoint.x, dy = y - dragMove.startPoint.y;
      const s = findShape(dragMove.id);
      if (s) applyMoveDelta(s, dragMove.origin, dx, dy);
      renderScene();
    }
  }

  function onWindowMouseUp(evt) {
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    const { x, y } = measurePointer(evt);
    if (draft) {
      const finished = draft;
      draft = null;
      const w = Math.abs(finished.x2 - finished.x1), h = Math.abs(finished.y2 - finished.y1);
      if (finished.type === 'bubble') {
        if (w < 8 || h < 8) { renderScene(); return; }
        bubbleAwaitingTail = { x1: finished.x1, y1: finished.y1, x2: finished.x2, y2: finished.y2 };
        tailPreviewPoint = { x, y };
        renderScene();
        return;
      }
      if (w < 4 || h < 4) { renderScene(); return; }
      shapes.push({ ...finished, id: nextId++ });
      renderScene();
      return;
    }
    if (dragMove) { dragMove = null; renderScene(); }
  }

  function startDrag() {
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  function onCanvasMouseDown(evt) {
    if (evt.button !== 0) return;
    const { x, y, scale } = measurePointer(evt);
    const p = { x, y };

    if (currentTool === 'bubble' && bubbleAwaitingTail) {
      const body = bubbleAwaitingTail;
      cancelBubbleAwaitingTail();
      const rect = bubbleRect(body);
      shapes.push({
        id: nextId++, type: 'bubble', color: currentColor, fontSize: currentFontSize,
        x1: body.x1, y1: body.y1, x2: body.x2, y2: body.y2, tailX: p.x, tailY: p.y, text: '',
      });
      const shape = shapes[shapes.length - 1];
      renderScene();
      openTextEditor({
        cssX: (rect.x + 8) * scale, cssY: (rect.y + 6) * scale,
        cssWidth: Math.max(20, (rect.w - 16) * scale), cssHeight: Math.max(16, (rect.h - 12) * scale),
        color: currentColor, fontSize: currentFontSize, scale, resizable: false, autoGrow: false,
        onCommit: text => { shape.text = text; renderScene(); },
      });
      return;
    }

    if (currentTool === 'select') {
      const hit = hitTest(p.x, p.y);
      if (!hit) { selectShape(null); return; }
      selectShape(hit.id);
      const origin = hit.type === 'text'
        ? { x: hit.x, y: hit.y }
        : { x1: hit.x1, y1: hit.y1, x2: hit.x2, y2: hit.y2, tailX: hit.tailX, tailY: hit.tailY };
      dragMove = { id: hit.id, origin, startPoint: p };
      startDrag();
      return;
    }

    if (currentTool === 'text') {
      openTextEditor({
        cssX: x * scale, cssY: y * scale,
        cssWidth: Math.max(100, 160 * scale), cssHeight: currentFontSize * scale * 1.6,
        color: currentColor, fontSize: currentFontSize, scale, resizable: true, autoGrow: true,
        onCommit: text => {
          if (!text.trim()) return;
          shapes.push({ id: nextId++, type: 'text', color: currentColor, fontSize: currentFontSize, x: p.x, y: p.y, text });
          renderScene();
        },
      });
      return;
    }

    // rect / arrow / bubble（本体のドラッグ描画）
    draft = { type: currentTool, color: currentColor, lineWidth: currentLineWidth, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    startDrag();
  }

  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('mousemove', evt => {
    if (!bubbleAwaitingTail) return;
    tailPreviewPoint = measurePointer(evt);
    renderScene();
  });

  window.addEventListener('keydown', evt => {
    if (textEditorEl) return; // テキスト入力中は編集用ショートカットを発火させない
    if (evt.key === 'Escape') {
      if (bubbleAwaitingTail) { cancelBubbleAwaitingTail(); renderScene(); return; }
      if (draft) { draft = null; renderScene(); return; }
      if (selectedId != null) { selectShape(null); return; }
    } else if ((evt.key === 'Delete' || evt.key === 'Backspace') && currentTool === 'select' && selectedId != null) {
      evt.preventDefault();
      deleteBtn.click();
    }
  });

  syncStyleInputs();
  renderScene();

  return { getExportDataUrl, getExportBlob };
}

(async () => {
  const canvas = document.getElementById('sp-canvas');
  const canvasWrap = document.getElementById('ann-canvas-wrap');
  const annToolbar = document.getElementById('ann-toolbar');
  const saveBtn = document.getElementById('sp-save');
  const copyBtn = document.getElementById('sp-copy');
  const formatEl = document.getElementById('sp-format');
  const warningEl = document.getElementById('sp-warning');
  const statusEl = document.getElementById('sp-status');

  const data = await chrome.storage.session.get('tm_screenshot_pending');
  chrome.storage.session.remove('tm_screenshot_pending');
  const pending = data.tm_screenshot_pending;

  if (!pending || !pending.dataUrl) {
    statusEl.textContent = '⚠ プレビューを読み込めませんでした。ポップアップから撮影しなおしてください。';
    saveBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }

  let baseImage;
  try {
    baseImage = await loadImage(pending.dataUrl);
  } catch (e) {
    statusEl.textContent = '⚠ プレビューを読み込めませんでした。ポップアップから撮影しなおしてください。';
    saveBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }

  canvas.width = baseImage.naturalWidth;
  canvas.height = baseImage.naturalHeight;
  canvas.hidden = false;
  annToolbar.hidden = false;
  if (pending.truncated) warningEl.hidden = false;

  const editor = createAnnotationEditor(canvas, canvasWrap, baseImage);

  function updateFilenamePreview() {
    const name = `${pending.baseName}.${extFor(formatEl.value)}`;
    document.title = name;
    statusEl.textContent = name;
  }
  updateFilenamePreview();
  formatEl.addEventListener('change', updateFilenamePreview);

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const format = formatEl.value;
      const outUrl = await convertPngDataUrl(editor.getExportDataUrl(), format);
      const filename = `${pending.baseName}.${extFor(format)}`;
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = filename;
      a.click();
      statusEl.textContent = `${filename} を保存しました`;
    } catch (e) {
      statusEl.textContent = '⚠ 保存に失敗しました（' + ((e && e.message) || e) + '）';
    } finally {
      saveBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    copyBtn.disabled = true;
    try {
      // クリップボードへの画像書き込みは実質 PNG のみ安定して動作するため、選択中の保存形式に関わらず PNG（注釈込み）をコピーする
      const blob = await editor.getExportBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      _TkUtils.showToast('📋 クリップボードにコピーしました');
      statusEl.textContent = 'スプレッドシートのセルで貼り付け（Ctrl+V / Cmd+V）できます';
    } catch (e) {
      _TkUtils.showToast('⚠ コピーに失敗しました（' + ((e && e.message) || e) + '）');
    } finally {
      copyBtn.disabled = false;
    }
  });
})();
