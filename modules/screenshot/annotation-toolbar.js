/**
 * annotation-toolbar.js — 注釈ツールバーの DOM 配線とスタイル編集
 *
 * ツール切替・色/太さ/不透明度/塗りつぶしの入力欄・削除ボタンを state に配線する。
 */

// ── 編集対象のスタイル取得・変更 ──
function isFontSizeType(type) { return type === 'text' || type === 'bubble'; }

// 編集対象（選択中の図形 / 未選択なら次に描く図形の既定値）を1つの入口にまとめる。
// これにより「選択ツールで色を変えても何も起きない」を防ぎ、選択時は実図形を直接編集できる。
function getStyleTarget(state) {
  if (state.currentTool === 'select') {
    if (state.selectedId == null) return null;
    const shape = findShape(state.shapes, state.selectedId);
    return shape ? { shape } : null;
  }
  return { tool: state.currentTool };
}

function targetType(target) { return target.shape ? target.shape.type : target.tool; }

function targetGet(state, target, field) {
  if (target.shape) return target.shape[field];
  switch (field) {
    case 'color': return state.currentColor;
    case 'opacity': return state.currentOpacity;
    case 'lineWidth': return state.currentLineWidth;
    case 'fontSize': return state.currentFontSize;
    case 'fill': return state.currentFill;
    case 'fillColor': return state.currentFillColor;
    case 'fillOpacity': return state.currentFillOpacity;
    default: return undefined;
  }
}

function targetSet(state, target, field, value) {
  if (target.shape) { target.shape[field] = value; renderScene(state); return; }
  if (field === 'color') state.currentColor = value;
  else if (field === 'opacity') state.currentOpacity = value;
  else if (field === 'lineWidth') state.currentLineWidth = value;
  else if (field === 'fontSize') state.currentFontSize = value;
  else if (field === 'fill') state.currentFill = value;
  else if (field === 'fillColor') state.currentFillColor = value;
  else if (field === 'fillOpacity') state.currentFillOpacity = value;
}

function syncStyleInputs(state) {
  const target = getStyleTarget(state);
  state.styleFieldsEl.hidden = !target;
  state.styleHintEl.hidden = !!target;
  state.deleteBtn.hidden = !(target && target.shape);
  if (!target) return;

  const type = targetType(target);
  const isFontType = isFontSizeType(type);
  const label = isFontType ? '文字サイズ' : '太さ';
  state.sizeLabel.textContent = label;
  state.sizeInput.title = label;
  state.sizeInput.setAttribute('aria-label', label);
  state.sizeInput.min = isFontType ? '10' : '1';
  state.sizeInput.max = isFontType ? '72' : '20';
  state.sizeInput.value = String(isFontType ? targetGet(state, target, 'fontSize') : targetGet(state, target, 'lineWidth'));

  state.colorInput.value = targetGet(state, target, 'color');
  state.opacityInput.value = String(Math.round(targetGet(state, target, 'opacity') * 100));
  state.opacityLabel.textContent = `${state.opacityInput.value}%`;

  state.fillGroupEl.hidden = type !== 'rect';
  const filled = type === 'rect' && !!targetGet(state, target, 'fill');
  if (type === 'rect') state.fillCheckbox.checked = filled;
  state.fillColorInput.hidden = !filled;
  state.fillOpacityInput.hidden = !filled;
  state.fillOpacityLabel.hidden = !filled;
  if (filled) {
    state.fillColorInput.value = targetGet(state, target, 'fillColor');
    state.fillOpacityInput.value = String(Math.round(targetGet(state, target, 'fillOpacity') * 100));
    state.fillOpacityLabel.textContent = `${state.fillOpacityInput.value}%`;
  }
}

function selectShape(state, id) {
  state.selectedId = id;
  syncStyleInputs(state);
  renderScene(state);
}

function setTool(state, tool) {
  closeTextEditor(state, true);
  state.draft = null;
  cancelBubbleAwaitingTail(state);
  state.dragMove = null;
  state.resizeDrag = null;
  state.currentTool = tool;
  state.selectedId = null;
  state.toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
  state.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  syncStyleInputs(state);
  renderScene(state);
}

// ── ツールバー DOM 配線 ──
function wireToolbar(state) {
  const toolButtons = _TkUtils.qsa('.ann-tool-btn');
  // アイコンは ui-helpers.js の _TkUI.ICONS（他機能とも共有する SVG 置き場）から流用する
  toolButtons.forEach(btn => { btn.innerHTML = _TkUI.ICONS[btn.dataset.tool] || ''; });
  state.toolButtons = toolButtons;
  state.styleFieldsEl = document.getElementById('ann-style-fields');
  state.styleHintEl = document.getElementById('ann-style-hint');
  state.colorInput = document.getElementById('ann-color');
  state.opacityInput = document.getElementById('ann-opacity');
  state.opacityLabel = document.getElementById('ann-opacity-label');
  state.sizeInput = document.getElementById('ann-size');
  state.sizeLabel = document.getElementById('ann-size-label');
  state.fillGroupEl = document.getElementById('ann-fill-group');
  state.fillCheckbox = document.getElementById('ann-fill');
  state.fillColorInput = document.getElementById('ann-fill-color');
  state.fillOpacityInput = document.getElementById('ann-fill-opacity');
  state.fillOpacityLabel = document.getElementById('ann-fill-opacity-label');
  state.deleteBtn = document.getElementById('ann-delete');
  state.deleteBtn.insertAdjacentHTML('afterbegin', _TkUI.ICONS.trash);

  toolButtons.forEach(btn => btn.addEventListener('click', () => setTool(state, btn.dataset.tool)));

  state.colorInput.addEventListener('input', () => {
    const target = getStyleTarget(state);
    if (target) targetSet(state, target, 'color', state.colorInput.value);
  });

  state.opacityInput.addEventListener('input', () => {
    const target = getStyleTarget(state);
    state.opacityLabel.textContent = `${state.opacityInput.value}%`;
    if (target) targetSet(state, target, 'opacity', parseInt(state.opacityInput.value, 10) / 100);
  });

  _TkUtils.clampInput(state.sizeInput);
  state.sizeInput.addEventListener('input', () => {
    const target = getStyleTarget(state);
    if (!target) return;
    const n = parseInt(state.sizeInput.value, 10);
    if (isNaN(n)) return;
    targetSet(state, target, isFontSizeType(targetType(target)) ? 'fontSize' : 'lineWidth', n);
  });

  state.fillCheckbox.addEventListener('change', () => {
    const target = getStyleTarget(state);
    if (target) targetSet(state, target, 'fill', state.fillCheckbox.checked);
    syncStyleInputs(state); // 塗りつぶし色ピッカーの表示/非表示を切り替える
  });

  state.fillColorInput.addEventListener('input', () => {
    const target = getStyleTarget(state);
    if (target) targetSet(state, target, 'fillColor', state.fillColorInput.value);
  });

  state.fillOpacityInput.addEventListener('input', () => {
    const target = getStyleTarget(state);
    state.fillOpacityLabel.textContent = `${state.fillOpacityInput.value}%`;
    if (target) targetSet(state, target, 'fillOpacity', parseInt(state.fillOpacityInput.value, 10) / 100);
  });

  state.deleteBtn.addEventListener('click', () => {
    if (state.selectedId == null) return;
    const idx = state.shapes.findIndex(s => s.id === state.selectedId);
    if (idx >= 0) state.shapes.splice(idx, 1);
    selectShape(state, null);
  });

  syncStyleInputs(state);
}
