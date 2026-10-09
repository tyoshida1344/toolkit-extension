/**
 * annotation-interactions.js — canvas 上のマウス操作
 *
 * 描画・選択・移動・リサイズ・ダブルクリックでの文字再編集を扱う。座標は annotation-snap.js の
 * 吸着を通す。キーボードは annotation-keyboard.js、テキスト入力欄は annotation-text-editor.js が担う。
 */
function cancelBubbleAwaitingTail(state) { state.bubbleAwaitingTail = null; state.tailPreviewPoint = null; state.guides = []; }

// 動画では現在の時刻に表示されている注釈だけが選択・編集の対象になる
function selectableShapes(state) {
  return state.getTime ? state.shapes.filter(s => isShapeVisibleAt(s, state.getTime())) : state.shapes;
}

function addAnnotationShape(state, props) {
  const range = state.newRange ? state.newRange(state.getTime()) : {};
  const shape = { ...props, ...range, id: state.nextId++ };
  state.shapes.push(shape);
  state.onChange();
  return shape;
}

// ── マウス操作 ──
function onWindowMouseMove(state, evt) {
  const { x, y } = measurePointer(state.canvas, evt);
  if (state.draft) {
    const p = snapPoint(state, x, y);
    state.draft.x2 = p.x; state.draft.y2 = p.y;
    renderScene(state);
    return;
  }
  if (state.dragMove) {
    const { id, bounds, origin, startPoint } = state.dragMove;
    const { dx, dy } = snapMoveDelta(state, id, bounds, x - startPoint.x, y - startPoint.y);
    const s = findShape(state.shapes, id);
    if (s) applyMoveDelta(s, origin, dx, dy);
    renderScene(state);
    return;
  }
  if (state.resizeDrag) {
    const { id, handleId, original, startPoint } = state.resizeDrag;
    const { dx, dy } = snapResizeDelta(state, id, handleId, original, x - startPoint.x, y - startPoint.y);
    const s = findShape(state.shapes, id);
    if (s) applyResize(s, handleId, original, dx, dy);
    renderScene(state);
  }
}

function onWindowMouseUp(state, evt) {
  window.removeEventListener('mousemove', state._onWindowMouseMove);
  window.removeEventListener('mouseup', state._onWindowMouseUp);
  state.guides = [];
  if (state.draft) {
    const finished = state.draft;
    state.draft = null;
    if (finished.type === 'bubble') {
      const w = Math.abs(finished.x2 - finished.x1), h = Math.abs(finished.y2 - finished.y1);
      if (w < 8 || h < 8) { renderScene(state); return; }
      state.bubbleAwaitingTail = { x1: finished.x1, y1: finished.y1, x2: finished.x2, y2: finished.y2 };
      state.tailPreviewPoint = { x: finished.x2, y: finished.y2 };
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
  // preventDefault によりブラウザ既定の blur が起きないため、開いたままの入力欄はここで確定する
  closeTextEditor(state, true);
  const { scale, ...raw } = measurePointer(state.canvas, evt);
  // 描画の始点・テキストの位置・吹き出しの尻尾の先端は、クリックした位置を他の注釈へ吸着させる
  const p = state.currentTool === 'select' ? raw : snapPoint(state, raw.x, raw.y);
  state.guides = [];

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
        const handle = findHandleAt(getHandles(state.ctx, selected), raw.x, raw.y, scale);
        if (handle) {
          state.resizeDrag = { id: selected.id, handleId: handle.id, original: captureResizeOriginal(state.ctx, selected), startPoint: raw };
          startDrag(state);
          return;
        }
      }
    }
    const hit = hitTest(state.ctx, selectableShapes(state), raw.x, raw.y);
    if (!hit) { selectShape(state, null); return; }
    selectShape(state, hit.id);
    state.dragMove = { id: hit.id, origin: captureMoveOrigin(hit), bounds: shapeBounds(state.ctx, hit), startPoint: raw };
    startDrag(state);
    return;
  }

  if (state.currentTool === 'text') {
    openTextEditor(state, {
      cssX: p.x * scale, cssY: p.y * scale,
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
    const { x, y } = measurePointer(state.canvas, evt);
    state.tailPreviewPoint = snapPoint(state, x, y);
    renderScene(state);
  });
  state.canvas.addEventListener('dblclick', evt => {
    if (!state.active || state.currentTool !== 'select') return;
    const { x, y } = measurePointer(state.canvas, evt);
    const hit = hitTest(state.ctx, selectableShapes(state), x, y);
    if (hit && (hit.type === 'text' || hit.type === 'bubble')) reeditShapeText(state, hit);
  });
  wireKeyboard(state);
}
