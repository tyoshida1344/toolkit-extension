Toolkit.registerTab({
  html: `
    <textarea class="tm-textarea tm-notepad-area" id="memo-area"
      placeholder="ここにメモを入力...\nどのサイトでも内容が保存されます。"></textarea>
  `,
  init() {
    const store = Toolkit.store;

    function setup() {
      Toolkit.bindState('memo', { 'memo-area': ['value', 'value'] });
    }

    // 旧キー tm_toolkit_memo → tm_state_memo へのワンタイム移行（完了後に bindState）
    if (store) {
      store.get('tm_toolkit_memo', data => {
        if (data.tm_toolkit_memo == null) { setup(); return; }
        store.set({ tm_state_memo: { value: data.tm_toolkit_memo } }, () => {
          store.remove('tm_toolkit_memo');
          setup();
        });
      });
    } else {
      setup();
    }
  },
});
