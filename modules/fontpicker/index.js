(() => {
  const INJECTABLE = /^https?:\/\//i;

  Toolkit.registerTab({
    html: `
      <div class="tm-row fp-desc">
        ページ上の要素をクリックして、フォント情報を取得します。
      </div>
      <div class="tm-row">
        <button class="tm-btn tm-btn-primary" id="fp-start">フォント取得を開始</button>
      </div>
    `,
    init() {
      const startBtn = Toolkit.$('fp-start');
      const _scripting = (typeof chrome !== 'undefined' && chrome.scripting) || null;
      const _tabs = (typeof chrome !== 'undefined' && chrome.tabs) || null;

      startBtn.addEventListener('click', async () => {
        if (!_scripting || !_tabs) {
          Toolkit.showToast('⚠ この機能はこのブラウザに対応していません');
          return;
        }
        let tab;
        try {
          const list = await _tabs.query({ active: true, currentWindow: true });
          tab = list && list[0];
        } catch (_) {}
        if (!tab || !INJECTABLE.test(tab.url || '')) {
          Toolkit.showToast('⚠ このページでは使用できません');
          return;
        }
        const inspector = window.FontInspector && window.FontInspector.run;
        if (!inspector) {
          Toolkit.showToast('⚠ インスペクターの初期化に失敗しました');
          return;
        }
        try {
          await _scripting.executeScript({
            target: { tabId: tab.id },
            func: inspector,
            args: ['start', Toolkit.INJECT_BTN_CSS],
          });
          window.close();
        } catch (_) {
          Toolkit.showToast('⚠ インスペクターの起動に失敗しました');
        }
      });
    },
  });
})();
