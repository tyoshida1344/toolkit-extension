/**
 * annotation-clipboard.js — 選択中の注釈のコピー＆ペースト
 *
 * 保持先は同じプレビュー画面内のメモリのみ（OS のクリップボードは使わない）。
 */
const ANN_PASTE_OFFSET = 20; // 貼り付けごとに右下へずらす量（キャンバス内座標）

function copySelectedShape(state) {
  const shape = findShape(state.shapes, state.selectedId);
  if (!shape) return false;
  state.clipboard = { shape: { ...shape }, pasteCount: 0 };
  return true;
}

// コピー元から offsetCount 回分ずらした新しい注釈を作る。動画では再生位置を開始とする同じ長さの区間にする
function buildPastedShape(state, source, offsetCount) {
  const shape = { ...source, id: state.nextId++ };
  if (state.newRange) {
    const length = source.endTime - source.startTime;
    const range = state.newRange(state.getTime(), length);
    // 末尾付近では区間が切り詰められるため、終了を動画の末尾に合わせて開始側を前へずらし、長さを保つ
    if (range.endTime - range.startTime < length) range.startTime = Math.max(0, range.endTime - length);
    Object.assign(shape, range);
  }
  const offset = ANN_PASTE_OFFSET * offsetCount;
  applyMoveDelta(shape, captureMoveOrigin(shape), offset, offset);
  return shape;
}

function pasteShape(state) {
  const clip = state.clipboard;
  if (!clip) return false;
  let shape = buildPastedShape(state, clip.shape, ++clip.pasteCount);
  const b = shapeBounds(state.ctx, shape);
  if (clip.pasteCount > 1 && (b.x + b.w > state.canvas.width || b.y + b.h > state.canvas.height)) {
    // 画面外へはみ出すところまで進んだら、最初のずらし位置に戻して貼り直す
    clip.pasteCount = 1;
    shape = buildPastedShape(state, clip.shape, 1);
  }
  state.shapes.push(shape);
  setTool(state, 'select');
  selectShape(state, shape.id);
  return true;
}
