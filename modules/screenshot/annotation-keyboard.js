/**
 * annotation-keyboard.js — 注釈エディタのキーボードショートカット
 *
 * Escape（操作のキャンセル）、Delete / Backspace（削除）、Ctrl/Cmd+C・V（コピペ）を扱う。
 * 入力欄（太さ・文字サイズなど）で文字を編集しているときは、そのキー操作を注釈の操作として扱わない。
 */
function wireKeyboard(state) {
  window.addEventListener('keydown', evt => {
    if (!state.active) return;
    if (state.textEditorEl) return; // テキスト入力中は編集用ショートカットを発火させない
    if (evt.key === 'Escape') {
      if (state.bubbleAwaitingTail) { cancelBubbleAwaitingTail(state); renderScene(state); return; }
      if (state.draft) { state.draft = null; state.guides = []; renderScene(state); return; }
      if (state.selectedId != null) { selectShape(state, null); return; }
      return;
    }
    if (_TkUtils.isTextEntry(evt.target)) return;
    if ((evt.key === 'Delete' || evt.key === 'Backspace') && state.currentTool === 'select' && state.selectedId != null) {
      evt.preventDefault();
      state.deleteBtn.click();
      return;
    }
    if ((evt.ctrlKey || evt.metaKey) && !evt.altKey && !evt.shiftKey && !String(window.getSelection()).length) {
      const key = evt.key.toLowerCase();
      if (key === 'c' && copySelectedShape(state)) evt.preventDefault();
      else if (key === 'v' && pasteShape(state)) evt.preventDefault();
    }
  });
}
