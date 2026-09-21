/**
 * annotation-editor.js — 注釈エディタのエントリポイント
 *
 * state を組み立て、annotation-shapes / annotation-geometry / annotation-render /
 * annotation-toolbar / annotation-interactions の配線を行う。preview.js から呼び出される。
 */
function createAnnotationEditor(canvas, canvasWrap, baseImage, options = {}) {
  const state = {
    canvas, canvasWrap, baseImage,
    ctx: canvas.getContext('2d'),
    // 選択中図形の枠線・ハンドルは base.css の --tm-accent と揃える（ハードコードによる二重管理を避ける）
    accentColor: getComputedStyle(document.documentElement).getPropertyValue('--tm-accent').trim() || '#0ea5e9',
    shapes: [],
    nextId: 1,
    currentTool: 'rect',
    currentColor: '#ff3b30',
    currentOpacity: 1, // 0-1
    currentLineWidth: 3,
    currentFontSize: 20,
    currentFill: false, // 四角形の塗りつぶし既定値
    currentFillColor: '#ff3b30', // 四角形の塗りつぶし色既定値（枠線の色とは独立に変更できる）
    currentFillOpacity: 1, // 0-1（枠線の不透明度とは独立に変更できる）
    selectedId: null,
    draft: null, // 描画中の一時図形（確定前のプレビュー）
    bubbleAwaitingTail: null, // 吹き出し本体を確定し、尻尾の位置待ちの状態 { x1, y1, x2, y2 }
    tailPreviewPoint: null,
    dragMove: null, // 選択中の図形をドラッグ移動中の状態 { id, origin, startPoint }
    resizeDrag: null, // 選択中の図形をハンドルでリサイズ中の状態 { id, handleId, original, startPoint }
    textEditorEl: null,
    getTime: options.getTime || null,
    newRange: options.newRange || null,
    onChange: options.onChange || (() => {}),
    active: true,
  };

  wireToolbar(state);
  wireCanvasEvents(state);
  renderScene(state);

  return {
    getExportDataUrl: () => getExportDataUrl(state),
    getExportBlob: () => getExportBlob(state),
    getShapes: () => state.shapes.slice(),
    getSelectedId: () => state.selectedId,
    select(id) {
      setTool(state, 'select');
      selectShape(state, id);
    },
    updateShape(id, patch) {
      const shape = findShape(state.shapes, id);
      if (!shape) return;
      Object.assign(shape, patch);
      renderScene(state);
      state.onChange();
    },
    clear() {
      state.shapes.length = 0;
      selectShape(state, null);
    },
    refresh: () => renderScene(state),
    setActive(active) {
      state.active = active;
      if (!active) setTool(state, state.currentTool);
    },
  };
}
