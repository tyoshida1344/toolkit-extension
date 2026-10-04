/**
 * annotation-shapes.js — 注釈図形（四角形・矢印・テキスト・吹き出し）の描画
 *
 * canvas 2D コンテキストと図形データを受け取って描画するだけの純粋関数群。state には依存しない。
 */
const ANN_FONT_FAMILY = "'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif";

function textLines(s) { return (s.text || '').split('\n'); }

function isShapeVisibleAt(shape, time) {
  return shape.startTime == null || (shape.startTime <= time && time <= shape.endTime);
}

function drawRectShape(c, s) {
  const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
  const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
  if (s.fill) {
    // 塗りつぶしは枠線とは別の不透明度を持てるので、fillRect の間だけ globalAlpha を差し替える
    const strokeAlpha = c.globalAlpha;
    c.globalAlpha = s.fillOpacity != null ? s.fillOpacity : strokeAlpha;
    c.fillStyle = s.fillColor || s.color;
    c.fillRect(x, y, w, h);
    c.globalAlpha = strokeAlpha;
  }
  c.strokeStyle = s.color; c.lineWidth = s.lineWidth;
  c.strokeRect(x, y, w, h);
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

// 図形単位で不透明度をまとめて適用する（各描画関数は色をそのまま使い、透明度を意識しなくてよい）
function drawShape(c, s) {
  c.save();
  c.globalAlpha = s.opacity != null ? s.opacity : 1;
  if (s.type === 'rect') drawRectShape(c, s);
  else if (s.type === 'arrow') drawArrowShape(c, s);
  else if (s.type === 'text') drawTextShape(c, s);
  else if (s.type === 'bubble') drawBubbleShape(c, s);
  c.restore();
}

function drawHandles(c, handles, scale, accentColor) {
  const size = HANDLE_SIZE_CSS / scale;
  c.save();
  c.setLineDash([]);
  handles.forEach(h => {
    c.fillStyle = '#ffffff';
    c.strokeStyle = accentColor;
    c.lineWidth = 1.5;
    c.fillRect(h.x - size / 2, h.y - size / 2, size, size);
    c.strokeRect(h.x - size / 2, h.y - size / 2, size, size);
  });
  c.restore();
}
