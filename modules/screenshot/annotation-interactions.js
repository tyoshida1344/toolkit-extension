/**
 * annotation-interactions.js — マウス/キーボード操作とテキスト入力 UI
 *
 * canvas 上での描画・選択・移動・リサイズ操作、Escape/Delete のショートカット、
 * テキスト注釈の入力欄（textarea）の生成・確定を扱う。
 */
function cancelBubbleAwaitingTail(state) { state.bubbleAwaitingTail = null; state.tailPreviewPoint = null; }

function addAnnotationShape(state, props) {
  const range = state.newRange ? state.newRange(state.getTime()) : {};
  const shape = { ...props, ...range, id: state.nextId++ };
  state.shapes.push(shape);
  state.onChange();
  return shape;
}

function closeTextEditor(state, commit) {
  if (!state.textEditorEl) return;
  const el = state.textEditorEl;
  const handlers = el._annHandlers;
  const value = el.value;
  state.textEditorEl = null;
  el.remove();
  if (commit && handlers && handlers.onCommit) handlers.onCommit(value);
}

// ── テキスト入力 UI ──
function openTextEditor(state, opts) {
  closeTextEditor(state, true);
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
  state.canvasWrap.appendChild(el);
  state.textEditorEl = el;
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
      state.textEditorEl = null;
      el.remove();
    }
  });
  el.addEventListener('blur', () => { if (state.textEditorEl === el) closeTextEditor(state, true); });
  // mousedown 側で preventDefault 済みのため、ここでの focus() がブラウザのデフォルト
  // フォーカス処理に奪われずに効く（奪われるとテキストが1文字も入力できなくなる）
  el.focus();
}

// ── マウス操作 ──
function onWindowMouseMove(state, evt) {
  const { x, y } = measurePointer(state.canvas, evt);
  if (state.draft) {
    state.draft.x2 = x; state.draft.y2 = y;
    renderScene(state);
    return;
  }
  if (state.dragMove) {
    const dx = x - state.dragMove.startPoint.x, dy = y - state.dragMove.startPoint.y;
    const s = findShape(state.shapes, state.dragMove.id);
    if (s) applyMoveDelta(s, state.dragMove.origin, dx, dy);
    renderScene(state);
    return;
  }
  if (state.resizeDrag) {
    const dx = x - state.resizeDrag.startPoint.x, dy = y - state.resizeDrag.startPoint.y;
    const s = findShape(state.shapes, state.resizeDrag.id);
    if (s) applyResize(s, state.resizeDrag.handleId, state.resizeDrag.original, dx, dy);
    renderScene(state);
  }
}

function onWindowMouseUp(state, evt) {
  window.removeEventListener('mousemove', state._onWindowMouseMove);
  window.removeEventListener('mouseup', state._onWindowMouseUp);
  const { x, y } = measurePointer(state.canvas, evt);
  if (state.draft) {
    const finished = state.draft;
    state.draft = null;
    if (finished.type === 'bubble') {
      const w = Math.abs(finished.x2 - finished.x1), h = Math.abs(finished.y2 - finished.y1);
      if (w < 8 || h < 8) { renderScene(state); return; }
      state.bubbleAwaitingTail = { x1: finished.x1, y1: finished.y1, x2: finished.x2, y2: finished.y2 };
      state.tailPreviewPoint = { x, y };
      renderScene(state);
      return;
    }
    if (finished.type === 'arrow') {
      // 水平・垂直の矢印は幅か高さのどちらかが0になるため、縦横どちらか一方の判定ではなく線の長さで見る
      if (Math.hypot(finished.x2 - finished.x1, finished.y2 - finished.y1) < 4) { renderScene(state); return; }
      addAnnotationShape(state, finished);
      renderScene(state);
      return;
    }
    const w = Math.abs(finished.x2 - finished.x1), h = Math.abs(finished.y2 - finished.y1);
    if (w < 4 || h < 4) { renderScene(state); return; }
    addAnnotationShape(state, finished);
    renderScene(state);
    return;
  }
  if (state.dragMove) { state.dragMove = null; renderScene(state); state.onChange(); return; }
  if (state.resizeDrag) { state.resizeDrag = null; renderScene(state); state.onChange(); }
}

function startDrag(state) {
  window.addEventListener('mousemove', state._onWindowMouseMove);
  window.addEventListener('mouseup', state._onWindowMouseUp);
}

function onCanvasMouseDown(state, evt) {
  if (!state.active || evt.button !== 0) return;
  // これが無いと、mousedown ハンドラ内で textarea を生成して focus() しても
  // ブラウザ既定のフォーカス処理に直後に奪われ、テキストが入力できなくなる
  evt.preventDefault();
  const { x, y, scale } = measurePointer(state.canvas, evt);
  const p = { x, y };

  if (state.currentTool === 'bubble' && state.bubbleAwaitingTail) {
    const body = state.bubbleAwaitingTail;
    cancelBubbleAwaitingTail(state);
    const rect = bubbleRect(body);
    const shape = addAnnotationShape(state, {
      type: 'bubble', color: state.currentColor, opacity: state.currentOpacity, fontSize: state.currentFontSize,
      x1: body.x1, y1: body.y1, x2: body.x2, y2: body.y2, tailX: p.x, tailY: p.y, text: '',
    });
    renderScene(state);
    openTextEditor(state, {
      cssX: (rect.x + 8) * scale, cssY: (rect.y + 6) * scale,
      cssWidth: Math.max(20, (rect.w - 16) * scale), cssHeight: Math.max(16, (rect.h - 12) * scale),
      color: state.currentColor, fontSize: state.currentFontSize, scale, resizable: false, autoGrow: false,
      onCommit: text => { shape.text = text; renderScene(state); state.onChange(); },
    });
    return;
  }

  if (state.currentTool === 'select') {
    if (state.selectedId != null) {
      const selected = findShape(state.shapes, state.selectedId);
      if (selected && (!state.getTime || isShapeVisibleAt(selected, state.getTime()))) {
        const handle = findHandleAt(getHandles(state.ctx, selected), p.x, p.y, scale);
        if (handle) {
          state.resizeDrag = { id: selected.id, handleId: handle.id, original: captureResizeOriginal(state.ctx, selected), startPoint: p };
          startDrag(state);
          return;
        }
      }
    }
    const candidates = state.getTime
      ? state.shapes.filter(s => isShapeVisibleAt(s, state.getTime()))
      : state.shapes;
    const hit = hitTest(state.ctx, candidates, p.x, p.y);
    if (!hit) { selectShape(state, null); return; }
    selectShape(state, hit.id);
    const origin = hit.type === 'text'
      ? { x: hit.x, y: hit.y }
      : { x1: hit.x1, y1: hit.y1, x2: hit.x2, y2: hit.y2, tailX: hit.tailX, tailY: hit.tailY };
    state.dragMove = { id: hit.id, origin, startPoint: p };
    startDrag(state);
    return;
  }

  if (state.currentTool === 'text') {
    openTextEditor(state, {
      cssX: x * scale, cssY: y * scale,
      cssWidth: Math.max(100, 160 * scale), cssHeight: state.currentFontSize * scale * 1.6,
      color: state.currentColor, fontSize: state.currentFontSize, scale, resizable: true, autoGrow: true,
      onCommit: text => {
        if (!text.trim()) return;
        addAnnotationShape(state, { type: 'text', color: state.currentColor, opacity: state.currentOpacity, fontSize: state.currentFontSize, x: p.x, y: p.y, text });
        renderScene(state);
      },
    });
    return;
  }

  // rect / arrow / bubble（本体のドラッグ描画）
  state.draft = {
    type: state.currentTool, color: state.currentColor, opacity: state.currentOpacity, lineWidth: state.currentLineWidth,
    fill: state.currentTool === 'rect' ? state.currentFill : undefined,
    fillColor: state.currentTool === 'rect' ? state.currentFillColor : undefined,
    fillOpacity: state.currentTool === 'rect' ? state.currentFillOpacity : undefined,
    x1: p.x, y1: p.y, x2: p.x, y2: p.y,
  };
  startDrag(state);
}

function wireCanvasEvents(state) {
  // addEventListener/removeEventListener で同一関数参照を使い回すため state に保持する
  state._onWindowMouseMove = evt => onWindowMouseMove(state, evt);
  state._onWindowMouseUp = evt => onWindowMouseUp(state, evt);

  state.canvas.addEventListener('mousedown', evt => onCanvasMouseDown(state, evt));
  state.canvas.addEventListener('mousemove', evt => {
    if (!state.bubbleAwaitingTail) return;
    state.tailPreviewPoint = measurePointer(state.canvas, evt);
    renderScene(state);
  });

  window.addEventListener('keydown', evt => {
    if (!state.active) return;
    if (state.textEditorEl) return; // テキスト入力中は編集用ショートカットを発火させない
    if (evt.key === 'Escape') {
      if (state.bubbleAwaitingTail) { cancelBubbleAwaitingTail(state); renderScene(state); return; }
      if (state.draft) { state.draft = null; renderScene(state); return; }
      if (state.selectedId != null) { selectShape(state, null); return; }
    } else if ((evt.key === 'Delete' || evt.key === 'Backspace') && state.currentTool === 'select' && state.selectedId != null) {
      evt.preventDefault();
      state.deleteBtn.click();
    }
  });
}
