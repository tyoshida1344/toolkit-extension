Toolkit.registerTab({
  id: 'memo',
  icon: '📝',
  label: 'メモ帳',
  html: `
    <textarea class="tm-notepad-area" id="memo-area"
      placeholder="ここにメモを入力...\nどのサイトでも内容が保存されます。"></textarea>
    <div class="tm-note-status" id="memo-status">読み込み中...</div>
  `,
  init() {
    const area = document.getElementById('memo-area');
    const status = document.getElementById('memo-status');
    let saveTimer = null;

    // 読み込み（入力状態の保持がオフのときは復元しない）
    if (Toolkit.isPersistEnabled('memo')) {
      chrome.storage.local.get('tm_toolkit_memo', data => {
        area.value = data.tm_toolkit_memo || '';
        status.textContent = '保存済み';
      });
    } else {
      status.textContent = '保持オフ（保存しません）';
    }

    // 自動保存（0.5秒デバウンス。保持オフ時は保存しない）
    area.addEventListener('input', () => {
      if (!Toolkit.isPersistEnabled('memo')) { status.textContent = '保持オフ（保存しません）'; return; }
      status.textContent = '保存中...';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        chrome.storage.local.set({ tm_toolkit_memo: area.value }, () => {
          status.textContent = '保存済み (' + new Date().toLocaleTimeString() + ')';
        });
      }, 500);
    });
  },
});
