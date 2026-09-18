/**
 * 注釈エディタのエントリポイント。canvas に撮影結果を描画し、四角形・矢印・吹き出し・
 * テキストの追加/選択/移動/リサイズ/削除を扱う状態（state）を組み立て、
 * 各ファイル（annotation-shapes/geometry/render/toolbar/interactions）の配線を行う。
 * preview.js から呼び出される。
 */
function createAnnotationEditor(canvas, canvasWrap, baseImage) {
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
    selectedId: null,
    draft: null, // 描画中の一時図形（確定前のプレビュー）
    bubbleAwaitingTail: null, // 吹き出し本体を確定し、尻尾の位置待ちの状態 { x1, y1, x2, y2 }
    tailPreviewPoint: null,
    dragMove: null, // 選択中の図形をドラッグ移動中の状態 { id, origin, startPoint }
    resizeDrag: null, // 選択中の図形をハンドルでリサイズ中の状態 { id, handleId, original, startPoint }
    textEditorEl: null,
  };

  wireToolbar(state);
  wireCanvasEvents(state);
  renderScene(state);

  return {
    getExportDataUrl: () => getExportDataUrl(state),
    getExportBlob: () => getExportBlob(state),
  };
}
