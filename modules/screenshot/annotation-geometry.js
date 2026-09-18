const HANDLE_SIZE_CSS = 10; // リサイズハンドルの一辺（CSS px）。当たり判定もこれを基準にする
const RESIZE_MIN = 8; // これ未満には縮小できない（キャンバス内座標）

// getBoundingClientRect() は1回にまとめ、キャンバス内座標と CSS 表示倍率を同時に返す
function measurePointer(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;
  return { scale, x: (evt.clientX - rect.left) / scale, y: (evt.clientY - rect.top) / scale };
}

function getScale(canvas) {
  const rect = canvas.getBoundingClientRect();
  return rect.width ? rect.width / canvas.width : 1;
}

function findShape(shapes, id) { return shapes.find(s => s.id === id) || null; }

function shapeBounds(ctx, s) {
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

function hitTest(ctx, shapes, px, py) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'arrow') {
      if (pointNearSegment(px, py, s.x1, s.y1, s.x2, s.y2, Math.max(8, s.lineWidth))) return s;
      continue;
    }
    const b = shapeBounds(ctx, s);
    const tol = 6;
    if (px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol) return s;
    if (s.type === 'bubble' && s.tailX != null) {
      const base = bubbleTailBase(b, s.tailX, s.tailY);
      if (pointNearSegment(px, py, base.x, base.y, s.tailX, s.tailY, 8)) return s;
    }
  }
  return null;
}

// 選択中図形のリサイズハンドル位置（矢印は両端、四角形／吹き出しは4隅。テキストは対象外）
function getHandles(ctx, s) {
  if (s.type === 'arrow') return [{ id: 'start', x: s.x1, y: s.y1 }, { id: 'end', x: s.x2, y: s.y2 }];
  if (s.type === 'rect' || s.type === 'bubble') {
    const b = shapeBounds(ctx, s);
    return [
      { id: 'nw', x: b.x, y: b.y }, { id: 'ne', x: b.x + b.w, y: b.y },
      { id: 'sw', x: b.x, y: b.y + b.h }, { id: 'se', x: b.x + b.w, y: b.y + b.h },
    ];
  }
  return [];
}

function findHandleAt(handles, px, py, scale) {
  const tol = HANDLE_SIZE_CSS / scale;
  return handles.find(h => Math.hypot(px - h.x, py - h.y) <= tol) || null;
}

function captureResizeOriginal(ctx, s) {
  if (s.type === 'arrow') return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
  const b = shapeBounds(ctx, s);
  return { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h };
}

function applyResize(s, handleId, original, dx, dy) {
  if (s.type === 'arrow') {
    if (handleId === 'start') { s.x1 = original.x1 + dx; s.y1 = original.y1 + dy; }
    else { s.x2 = original.x2 + dx; s.y2 = original.y2 + dy; }
    return;
  }
  let { left, top, right, bottom } = original;
  if (handleId.includes('w')) left = Math.min(original.right - RESIZE_MIN, original.left + dx);
  if (handleId.includes('e')) right = Math.max(original.left + RESIZE_MIN, original.right + dx);
  if (handleId.includes('n')) top = Math.min(original.bottom - RESIZE_MIN, original.top + dy);
  if (handleId.includes('s')) bottom = Math.max(original.top + RESIZE_MIN, original.bottom + dy);
  s.x1 = left; s.y1 = top; s.x2 = right; s.y2 = bottom;
}

function applyMoveDelta(s, origin, dx, dy) {
  if (s.type === 'text') { s.x = origin.x + dx; s.y = origin.y + dy; return; }
  s.x1 = origin.x1 + dx; s.y1 = origin.y1 + dy; s.x2 = origin.x2 + dx; s.y2 = origin.y2 + dy;
  if (s.type === 'bubble' && origin.tailX != null) { s.tailX = origin.tailX + dx; s.tailY = origin.tailY + dy; }
}
