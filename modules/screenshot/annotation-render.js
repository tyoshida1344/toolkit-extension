function renderScene(state) {
  const { ctx, canvas, baseImage, shapes } = state;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0);
  shapes.forEach(s => drawShape(ctx, s));

  if (state.draft) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    drawShape(ctx, state.draft);
    ctx.restore();
  }
  if (state.bubbleAwaitingTail && state.tailPreviewPoint) {
    // 本体ドラッグ確定後も実際の吹き出し（本体＋尻尾）をそのまま点線でプレビューし、完成形が分かるようにする
    ctx.save();
    ctx.setLineDash([6, 4]);
    drawShape(ctx, {
      type: 'bubble', ...state.bubbleAwaitingTail, color: state.currentColor, opacity: state.currentOpacity,
      fontSize: state.currentFontSize, text: '', tailX: state.tailPreviewPoint.x, tailY: state.tailPreviewPoint.y,
    });
    ctx.restore();
  }
  if (state.selectedId != null) {
    const s = findShape(shapes, state.selectedId);
    if (s) {
      const b = shapeBounds(ctx, s);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = state.accentColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.restore();
      const handles = getHandles(ctx, s);
      if (handles.length) drawHandles(ctx, handles, getScale(canvas), state.accentColor);
    }
  }
}

function getExportDataUrl(state) {
  const prevSelected = state.selectedId;
  state.selectedId = null;
  renderScene(state);
  const url = state.canvas.toDataURL('image/png');
  state.selectedId = prevSelected;
  renderScene(state);
  return url;
}

function getExportBlob(state) {
  return new Promise(resolve => {
    const prevSelected = state.selectedId;
    state.selectedId = null;
    renderScene(state);
    state.canvas.toBlob(blob => {
      state.selectedId = prevSelected;
      renderScene(state);
      resolve(blob);
    }, 'image/png');
  });
}
