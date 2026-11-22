/**
 * annotation-order.js — 注釈の前後関係（重なり順）の変更
 *
 * state.shapes の並び順がそのまま描画順（後ろほど前面）なので、配列内の位置を入れ替えて前後関係を変える。
 * 動画プレビューの区間バーも同じ並び順で表示される。
 */
function reorderTargetIndex(action, idx, last) {
  if (action === 'front') return last;
  if (action === 'forward') return Math.min(last, idx + 1);
  if (action === 'backward') return Math.max(0, idx - 1);
  return 0;
}

function reorderSelectedShape(state, action) {
  const shapes = state.shapes;
  const idx = shapes.findIndex(s => s.id === state.selectedId);
  if (idx < 0) return;
  const to = reorderTargetIndex(action, idx, shapes.length - 1);
  if (to === idx) return;
  shapes.splice(to, 0, ...shapes.splice(idx, 1));
  syncOrderButtons(state, shapes[to]);
  renderScene(state);
  state.onChange();
}

// 既に最前面／最背面にあるときは、それ以上動かせない方向のボタンを無効にする
function syncOrderButtons(state, shape) {
  if (!shape) return;
  const idx = state.shapes.indexOf(shape);
  const last = state.shapes.length - 1;
  state.orderButtons.forEach(btn => {
    btn.disabled = reorderTargetIndex(btn.dataset.order, idx, last) === idx;
  });
}

function wireOrderButtons(state) {
  state.orderGroupEl = document.getElementById('ann-order-group');
  state.orderButtons = _TkUtils.qsa('.ann-order-btn');
  state.orderButtons.forEach(btn => {
    btn.innerHTML = _TkUI.ICONS[`order-${btn.dataset.order}`] || '';
    btn.addEventListener('click', () => reorderSelectedShape(state, btn.dataset.order));
  });
}
