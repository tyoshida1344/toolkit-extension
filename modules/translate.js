Toolkit.registerTab({
  html: `
    <div class="tm-row tm-inline" style="justify-content:center">
      <span class="tm-tr-lang" id="tr-src-label">日本語</span>
      ${Toolkit.iconButton('⇄', { id: 'tr-swap', title: '言語を入れ替え', cls: 'tm-tr-swap' })}
      <span class="tm-tr-lang" id="tr-tgt-label">English</span>
    </div>
    <div class="tm-row">
      <textarea class="tm-textarea tm-tr-area" id="tr-input" placeholder="翻訳するテキストを入力..."></textarea>
    </div>
    <div class="tm-row tm-inline">
      <button class="tm-btn tm-btn-primary" id="tr-exec">翻訳</button>
      ${Toolkit.copyButton('tr-result', { title: '結果をコピー' })}
      <span style="flex:1"></span>
      <span style="font-size:11px;color:var(--tm-text-faint)" id="tr-status"></span>
    </div>
    <div class="tm-row">
      <div class="tm-output tm-tr-result" id="tr-result"></div>
    </div>
  `,
  init() {
    let src = 'ja', tgt = 'en';
    const LABELS = { ja: '日本語', en: 'English' };

    async function translateText(text, sl, tl) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      return data[0].map(s => s[0]).join('');
    }

    const input = Toolkit.$('tr-input');
    const result = Toolkit.$('tr-result');

    const save = Toolkit.bindState('translate', {
      'tr-input': ['value', 'input'],
      'tr-result': ['textContent', 'result'],
    }, {
      extra: () => ({ src, tgt }),
      onRestore(s) {
        if (!s) return;
        if (s.src && s.tgt && LABELS[s.src] && LABELS[s.tgt]) {
          src = s.src; tgt = s.tgt;
          Toolkit.$('tr-src-label').textContent = LABELS[src];
          Toolkit.$('tr-tgt-label').textContent = LABELS[tgt];
        }
      },
    });

    Toolkit.$('tr-swap').addEventListener('click', () => {
      [src, tgt] = [tgt, src];
      Toolkit.$('tr-src-label').textContent = LABELS[src];
      Toolkit.$('tr-tgt-label').textContent = LABELS[tgt];
      const resultText = result.textContent;
      if (resultText) {
        input.value = resultText;
        result.textContent = '';
      }
      save();
    });

    Toolkit.$('tr-exec').addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) return;
      const status = Toolkit.$('tr-status');
      status.textContent = '翻訳中...';
      result.textContent = '';
      try {
        result.textContent = await translateText(text, src, tgt);
        status.textContent = '';
      } catch (e) {
        result.textContent = '⚠ 翻訳に失敗しました';
        status.textContent = '';
      }
      save();
    });
  },
});
