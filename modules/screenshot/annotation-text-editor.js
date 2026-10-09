/**
 * annotation-text-editor.js — テキスト注釈の入力欄（textarea）の生成・確定・再編集
 *
 * 新規作成時の入力と、作成済みのテキスト／吹き出しをダブルクリックしたときの再編集で
 * 同じ入力欄を使う。
 */
function closeTextEditor(state, commit) {
  if (!state.textEditorEl) return;
  const el = state.textEditorEl;
  const handlers = el._annHandlers;
  const value = el.value;
  const wasEditing = state.editingId != null;
  state.textEditorEl = null;
  state.editingId = null;
  el.remove();
  if (commit && handlers && handlers.onCommit) handlers.onCommit(value);
  if (wasEditing) renderScene(state); // 再編集中に隠していた元の文字を戻す（キャンセル時もここで復元する）
}

function openTextEditor(state, opts) {
  closeTextEditor(state, true);
  const el = document.createElement('textarea');
  el.className = 'ann-text-editor';
  el.style.left = `${opts.cssX}px`;
  el.style.top = `${opts.cssY}px`;
  el.style.width = `${opts.cssWidth}px`;
  el.style.height = `${opts.cssHeight}px`;
  el.style.color = opts.color;
  el.style.fontSize = `${opts.fontSize * opts.scale}px`;
  el.style.resize = opts.resizable ? 'both' : 'none';
  el.value = opts.initialText || '';
  state.canvasWrap.appendChild(el);
  state.textEditorEl = el;
  el._annHandlers = { onCommit: opts.onCommit };
  if (opts.autoGrow) {
    const grow = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
    el.addEventListener('input', grow);
    grow();
  }
  el.addEventListener('keydown', evt => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      closeTextEditor(state, false);
    }
  });
  el.addEventListener('blur', () => { if (state.textEditorEl === el) closeTextEditor(state, true); });
  // mousedown 側で preventDefault 済みのため、ここでの focus() がブラウザのデフォルト
  // フォーカス処理に奪われずに効く（奪われるとテキストが1文字も入力できなくなる）
  el.focus();
}

// 作成済みのテキスト／吹き出しの文字を、作成時と同じ入力欄で書き換える
function reeditShapeText(state, shape) {
  closeTextEditor(state, true);
  const scale = getScale(state.canvas);
  const commit = text => { shape.text = text; state.onChange(); };
  state.editingId = shape.id; // 入力欄の下に元の文字が二重に見えないよう、確定/キャンセルまで描画しない
  renderScene(state);
  if (shape.type === 'bubble') {
    const rect = bubbleRect(shape);
    openTextEditor(state, {
      cssX: (rect.x + 8) * scale, cssY: (rect.y + 6) * scale,
      cssWidth: Math.max(20, (rect.w - 16) * scale), cssHeight: Math.max(16, (rect.h - 12) * scale),
      color: shape.color, fontSize: shape.fontSize, scale, resizable: false, autoGrow: false,
      initialText: shape.text, onCommit: commit,
    });
    return;
  }
  const b = shapeBounds(state.ctx, shape);
  openTextEditor(state, {
    cssX: shape.x * scale, cssY: shape.y * scale,
    cssWidth: Math.max(100, (b.w + 24) * scale), cssHeight: Math.max(shape.fontSize * scale * 1.6, b.h * scale),
    color: shape.color, fontSize: shape.fontSize, scale, resizable: true, autoGrow: true,
    initialText: shape.text,
    onCommit: text => { if (text.trim()) commit(text); }, // 空にしての確定は元の文字を残す（消すときは削除ボタン）
  });
}
