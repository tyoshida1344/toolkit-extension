/**
 * annotation-snap.js — 注釈の画面上の位置揃え（他の注釈の端・中心への吸着とガイド線）
 *
 * 描画・移動・リサイズ中の座標を、他の注釈の左/中央/右・上/中央/下の線へ近づけると吸着させる。
 * 有効/無効はツールバーの「吸着」チェックボックスで切り替え、状態は次回以降も引き継ぐ。
 */
const ANN_SNAP_PX = 8; // 吸着が効く距離（画面表示上の px）
const ANN_SNAP_STORAGE_KEY = 'tm_annotation_snap';

function wireSnapToggle(state) {
  const checkbox = document.getElementById('ann-snap');
  let enabled = true;
  try { enabled = localStorage.getItem(ANN_SNAP_STORAGE_KEY) !== '0'; } catch (e) { /* 保存できない環境では既定のオン */ }
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    try { localStorage.setItem(ANN_SNAP_STORAGE_KEY, checkbox.checked ? '1' : '0'); } catch (e) { /* 保存できなくても今回の操作には影響しない */ }
  });
  state.snapCheckbox = checkbox;
}

// 吸着先になる線（他の注釈の左/中央/右・上/中央/下）。動画では現在の時刻に表示されている注釈だけを対象にする
function collectSnapLines(state, excludeId) {
  const xs = [], ys = [];
  const time = state.getTime ? state.getTime() : null;
  state.shapes.forEach(s => {
    if (s.id === excludeId || (state.getTime && !isShapeVisibleAt(s, time))) return;
    const b = shapeBounds(state.ctx, s);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  });
  return { xs, ys };
}

// values のどれかが lines のどれかに tol 以内で近ければ、最も近い組の { delta, line } を返す
function nearestSnap(values, lines, tol) {
  let best = null;
  values.forEach(v => lines.forEach(line => {
    const delta = line - v;
    if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line };
  }));
  return best;
}

// 動かしている側の座標 xValues / yValues の補正量を返し、吸着した線を state.guides に設定する
function snapOffsets(state, excludeId, xValues, yValues) {
  state.guides = [];
  if (!state.snapCheckbox.checked) return { dx: 0, dy: 0 };
  const lines = collectSnapLines(state, excludeId);
  const tol = ANN_SNAP_PX / getScale(state.canvas);
  const sx = nearestSnap(xValues, lines.xs, tol);
  const sy = nearestSnap(yValues, lines.ys, tol);
  if (sx) state.guides.push({ axis: 'x', pos: sx.line });
  if (sy) state.guides.push({ axis: 'y', pos: sy.line });
  return { dx: sx ? sx.delta : 0, dy: sy ? sy.delta : 0 };
}

function snapPoint(state, x, y, excludeId = null) {
  const o = snapOffsets(state, excludeId, [x], [y]);
  return { x: x + o.dx, y: y + o.dy };
}

// 移動中: bounds はドラッグ開始時の外接矩形。左/中央/右・上/中央/下のどれかが吸着先に寄れば移動量を補正する
function snapMoveDelta(state, id, bounds, dx, dy) {
  const { x, y, w, h } = bounds;
  const o = snapOffsets(state, id, [x + dx, x + w / 2 + dx, x + w + dx], [y + dy, y + h / 2 + dy, y + h + dy]);
  return { dx: dx + o.dx, dy: dy + o.dy };
}

// リサイズ中に動いている座標（矢印は端点、尻尾は先端、四角形／吹き出しはハンドルが担当する辺）
function movingCoords(handleId, original) {
  if (original.x1 != null) return handleId === 'start' ? { x: original.x1, y: original.y1 } : { x: original.x2, y: original.y2 };
  if (handleId === 'tail') return { x: original.tailX, y: original.tailY };
  return {
    x: handleId.includes('w') ? original.left : handleId.includes('e') ? original.right : null,
    y: handleId.includes('n') ? original.top : handleId.includes('s') ? original.bottom : null,
  };
}

function snapResizeDelta(state, id, handleId, original, dx, dy) {
  const m = movingCoords(handleId, original);
  const o = snapOffsets(state, id, m.x == null ? [] : [m.x + dx], m.y == null ? [] : [m.y + dy]);
  return { dx: dx + o.dx, dy: dy + o.dy };
}

function drawSnapGuides(state) {
  if (!state.guides.length) return;
  const { ctx, canvas } = state;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = state.accentColor;
  ctx.lineWidth = 1 / getScale(canvas);
  state.guides.forEach(g => {
    ctx.beginPath();
    if (g.axis === 'x') { ctx.moveTo(g.pos, 0); ctx.lineTo(g.pos, canvas.height); }
    else { ctx.moveTo(0, g.pos); ctx.lineTo(canvas.width, g.pos); }
    ctx.stroke();
  });
  ctx.restore();
}
