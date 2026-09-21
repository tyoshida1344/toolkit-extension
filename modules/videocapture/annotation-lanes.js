/**
 * annotation-lanes.js — 注釈ごとの表示区間レーン
 *
 * 区間バーの描画・選択・マウス／キー調整を担う。調整中はフォーカスやドラッグを失わないよう
 * id と表示ラベルが変わらない限り DOM を作り直さず、位置と aria 属性だけを更新する。
 */
const VIDEO_ANNOTATION_MIN_RANGE = 0.2; // 注釈区間の最小長（秒）。調整操作と、末尾付近で作る新規注釈の初期区間で保証する

function createVideoAnnotationLanes({ laneEl, duration, editor, getTime, seekTo }) {
  const NUDGE_STEP = 0.5; // 矢印キーでの移動幅（秒）
  let dragging = null;
  let renderedSignature = '';

  function labelFor(shape) {
    const names = { rect: '四角形', arrow: '矢印', bubble: '吹き出し', text: 'テキスト' };
    const suffix = (shape.type === 'text' || shape.type === 'bubble') && shape.text ? ` ${shape.text}` : '';
    return names[shape.type] + suffix;
  }

  function signatureOf(shapes) {
    return JSON.stringify(shapes.map(shape => [shape.id, labelFor(shape)]));
  }

  function setHandleA11y(handle, shape, edge) {
    const value = edge === 'start' ? shape.startTime : shape.endTime;
    handle.setAttribute('aria-valuenow', value.toFixed(2));
    handle.setAttribute('aria-valuemin', edge === 'start' ? '0' : (shape.startTime + VIDEO_ANNOTATION_MIN_RANGE).toFixed(2));
    handle.setAttribute('aria-valuemax', edge === 'start' ? (shape.endTime - VIDEO_ANNOTATION_MIN_RANGE).toFixed(2) : String(duration));
  }

  function updatePositions() {
    editor.getShapes().forEach(shape => {
      const bar = laneEl.querySelector(`[data-shape-id="${shape.id}"]`);
      if (!bar) return;
      bar.style.left = (shape.startTime / duration) * 100 + '%';
      bar.style.width = ((shape.endTime - shape.startTime) / duration) * 100 + '%';
      bar.classList.toggle('active', editor.getSelectedId() === shape.id);
      bar.querySelectorAll('.vp-ann-handle').forEach(handle => setHandleA11y(handle, shape, handle.dataset.edge));
    });
  }

  function render() {
    laneEl.replaceChildren();
    const shapes = editor.getShapes();
    renderedSignature = signatureOf(shapes);
    if (!shapes.length) {
      const empty = document.createElement('span');
      empty.className = 'vp-ann-empty';
      empty.textContent = '注釈を追加すると表示区間を調整できます';
      laneEl.appendChild(empty);
      return;
    }
    shapes.forEach(shape => {
      const bar = document.createElement('div');
      bar.className = 'vp-ann-bar';
      bar.dataset.shapeId = shape.id;
      bar.title = labelFor(shape);
      const label = document.createElement('span');
      label.className = 'vp-ann-label';
      label.textContent = labelFor(shape);
      bar.appendChild(label);
      ['start', 'end'].forEach(edge => {
        const handle = document.createElement('span');
        handle.className = `vp-ann-handle vp-ann-handle-${edge}`;
        handle.dataset.edge = edge;
        handle.tabIndex = 0;
        handle.setAttribute('role', 'slider');
        handle.setAttribute('aria-label', `${labelFor(shape)}の${edge === 'start' ? '開始' : '終了'}位置`);
        bar.appendChild(handle);
      });
      laneEl.appendChild(bar);
    });
    updatePositions();
  }

  function clampRange(shape, edge, time) {
    if (edge === 'start') return { startTime: Math.min(Math.max(0, shape.endTime - VIDEO_ANNOTATION_MIN_RANGE), Math.max(0, time)) };
    return { endTime: Math.max(Math.min(duration, shape.startTime + VIDEO_ANNOTATION_MIN_RANGE), Math.min(duration, time)) };
  }

  function sync() {
    const signature = signatureOf(editor.getShapes());
    if (signature !== renderedSignature) {
      render();
      return true;
    }
    updatePositions();
    return false;
  }

  laneEl.addEventListener('mousedown', e => {
    const bar = e.target.closest('.vp-ann-bar');
    if (!bar) return;
    const id = Number(bar.dataset.shapeId);
    const handle = e.target.closest('.vp-ann-handle');
    if (handle) {
      e.preventDefault();
      editor.select(id);
      dragging = { id, edge: handle.dataset.edge };
      return;
    }
    editor.select(id);
    const shape = editor.getShapes().find(s => s.id === id);
    seekTo(shape.startTime);
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = laneEl.getBoundingClientRect();
    const time = Math.min(duration, Math.max(0, (e.clientX - rect.left) / rect.width * duration));
    const shape = editor.getShapes().find(s => s.id === dragging.id);
    editor.updateShape(shape.id, clampRange(shape, dragging.edge, time));
    updatePositions();
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = null;
    updatePositions();
  });
  laneEl.addEventListener('focusin', e => {
    const handle = e.target.closest('.vp-ann-handle');
    if (handle) editor.select(Number(handle.parentElement.dataset.shapeId));
  });
  laneEl.addEventListener('keydown', e => {
    const handle = e.target.closest('.vp-ann-handle');
    if (!handle || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const shape = editor.getShapes().find(s => s.id === Number(handle.parentElement.dataset.shapeId));
    const value = handle.dataset.edge === 'start' ? shape.startTime : shape.endTime;
    editor.updateShape(shape.id, clampRange(shape, handle.dataset.edge, value + (e.key === 'ArrowRight' ? NUDGE_STEP : -NUDGE_STEP)));
  });

  function setEdgeToCurrentTime(id, edge) {
    const shape = editor.getShapes().find(s => s.id === id);
    if (shape) editor.updateShape(id, clampRange(shape, edge, getTime()));
  }

  return {
    render,
    sync,
    updatePositions,
    setStart: id => setEdgeToCurrentTime(id, 'start'),
    setEnd: id => setEdgeToCurrentTime(id, 'end'),
  };
}
