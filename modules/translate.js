Toolkit.registerTab({
  id: 'translate',
  icon: '🌐',
  label: '翻訳',
  html: `
    <div class="tm-row tm-inline" style="justify-content:center">
      <span class="tm-tr-lang" id="tr-src-label">日本語</span>
      ${Toolkit.iconButton('⇄', { id: 'tr-swap', title: '言語を入れ替え', cls: 'tm-tr-swap' })}
      <span class="tm-tr-lang" id="tr-tgt-label">English</span>
    </div>
    <div class="tm-row">
      <textarea class="tm-tr-area" id="tr-input" placeholder="翻訳するテキストを入力..."></textarea>
    </div>
    <div class="tm-row tm-inline">
      <button class="tm-btn tm-btn-primary" id="tr-exec">翻訳</button>
      ${Toolkit.copyButton('tr-result', { title: '結果をコピー' })}
      <span style="flex:1"></span>
      <span style="font-size:11px;color:#6c7086" id="tr-status"></span>
    </div>
    <div class="tm-row">
      <div class="tm-tr-result" id="tr-result"></div>
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

    const input = document.getElementById('tr-input');
    const result = document.getElementById('tr-result');

    // 状態の永続化（言語の向き・入力テキスト・翻訳結果）
    function save() {
      Toolkit.saveState('translate', {
        src, tgt,
        input: input.value,
        result: result.textContent,
      });
    }

    input.addEventListener('input', save);

    document.getElementById('tr-swap').addEventListener('click', () => {
      [src, tgt] = [tgt, src];
      document.getElementById('tr-src-label').textContent = LABELS[src];
      document.getElementById('tr-tgt-label').textContent = LABELS[tgt];
      const resultText = result.textContent;
      if (resultText) {
        input.value = resultText;
        result.textContent = '';
      }
      save();
    });

    document.getElementById('tr-exec').addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) return;
      const status = document.getElementById('tr-status');
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

    // 復元
    Toolkit.loadState('translate', s => {
      if (!s) return;
      if (s.src && s.tgt && LABELS[s.src] && LABELS[s.tgt]) {
        src = s.src; tgt = s.tgt;
        document.getElementById('tr-src-label').textContent = LABELS[src];
        document.getElementById('tr-tgt-label').textContent = LABELS[tgt];
      }
      if (s.input) input.value = s.input;
      if (s.result) result.textContent = s.result;
    });
  },
});
