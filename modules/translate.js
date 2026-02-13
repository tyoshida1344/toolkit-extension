Toolkit.registerTab({
  id: 'translate',
  icon: '🌐',
  label: '翻訳',
  html: `
    <div class="tm-row tm-inline" style="justify-content:center">
      <span class="tm-tr-lang" id="tr-src-label">日本語</span>
      <button class="tm-tr-swap" id="tr-swap" title="言語を入れ替え">⇄</button>
      <span class="tm-tr-lang" id="tr-tgt-label">English</span>
    </div>
    <div class="tm-row">
      <textarea class="tm-tr-area" id="tr-input" placeholder="翻訳するテキストを入力..."></textarea>
    </div>
    <div class="tm-row tm-inline">
      <button class="tm-btn tm-btn-primary" id="tr-exec">翻訳</button>
      <button class="tm-btn tm-btn-secondary tm-btn-sm" id="tr-copy">結果をコピー</button>
      <span class="tm-copy-msg" id="tr-copied">✓</span>
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

    document.getElementById('tr-swap').addEventListener('click', () => {
      [src, tgt] = [tgt, src];
      document.getElementById('tr-src-label').textContent = LABELS[src];
      document.getElementById('tr-tgt-label').textContent = LABELS[tgt];
      const resultText = document.getElementById('tr-result').textContent;
      if (resultText) {
        document.getElementById('tr-input').value = resultText;
        document.getElementById('tr-result').textContent = '';
      }
    });

    document.getElementById('tr-exec').addEventListener('click', async () => {
      const text = document.getElementById('tr-input').value.trim();
      if (!text) return;
      const status = document.getElementById('tr-status');
      const result = document.getElementById('tr-result');
      status.textContent = '翻訳中...';
      result.textContent = '';
      try {
        result.textContent = await translateText(text, src, tgt);
        status.textContent = '';
      } catch (e) {
        result.textContent = '⚠ 翻訳に失敗しました';
        status.textContent = '';
      }
    });

    document.getElementById('tr-copy').addEventListener('click', () => {
      Toolkit.copyText(document.getElementById('tr-result').textContent, document.getElementById('tr-copied'));
    });
  },
});
