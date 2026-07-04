Toolkit.registerTab({
  html: `
    <div class="tm-row tm-inline">
      <label class="tm-label" style="margin:0;flex:1">正規表現</label>
      ${Toolkit.iconButton('❓', { id: 're-help', title: 'チートシートを開く', cls: 'tm-re-help' })}
    </div>
    <div class="tm-row">
      <input type="text" class="tm-input" id="re-pattern" placeholder="例: \\d{3}-\\d{4}"
        spellcheck="false" autocomplete="off" autocapitalize="off">
    </div>
    <div class="tm-row">
      <label class="tm-label">テスト文字列</label>
      <textarea class="tm-textarea" id="re-test" rows="4" spellcheck="false"
        placeholder="一致を確認したいテキストを入力..."></textarea>
    </div>
    <div class="tm-row">
      <label class="tm-label">マッチ結果</label>
      <div class="tm-output tm-re-output" id="re-output"></div>
      <div class="tm-re-status" id="re-status"></div>
    </div>

    <!-- チートシート モーダル -->
    <div class="tm-modal-overlay" id="re-modal" hidden>
      <div class="tm-modal">
        <div class="tm-modal-header">
          <span>正規表現チートシート</span>
          ${Toolkit.iconButton('✕', { id: 're-modal-close', title: '閉じる' })}
        </div>
        <div class="tm-modal-body">
          <div class="tm-cheat-section">
            <h4>アンカー / 位置</h4>
            <div class="tm-cheat-item"><code>^</code><span>行頭</span></div>
            <div class="tm-cheat-item"><code>$</code><span>行末</span></div>
            <div class="tm-cheat-item"><code>\\b</code><span>単語境界</span></div>
            <div class="tm-cheat-item"><code>\\B</code><span>非単語境界</span></div>
          </div>
          <div class="tm-cheat-section">
            <h4>文字クラス</h4>
            <div class="tm-cheat-item"><code>.</code><span>任意の1文字（改行を除く）</span></div>
            <div class="tm-cheat-item"><code>\\d</code><span>数字 [0-9]</span></div>
            <div class="tm-cheat-item"><code>\\D</code><span>数字以外</span></div>
            <div class="tm-cheat-item"><code>\\w</code><span>英数字とアンダースコア</span></div>
            <div class="tm-cheat-item"><code>\\W</code><span>\\w 以外</span></div>
            <div class="tm-cheat-item"><code>\\s</code><span>空白文字</span></div>
            <div class="tm-cheat-item"><code>\\S</code><span>空白以外</span></div>
            <div class="tm-cheat-item"><code>[abc]</code><span>a / b / c のいずれか</span></div>
            <div class="tm-cheat-item"><code>[^abc]</code><span>a / b / c 以外</span></div>
            <div class="tm-cheat-item"><code>[a-z]</code><span>範囲指定</span></div>
          </div>
          <div class="tm-cheat-section">
            <h4>量指定子</h4>
            <div class="tm-cheat-item"><code>*</code><span>0 回以上</span></div>
            <div class="tm-cheat-item"><code>+</code><span>1 回以上</span></div>
            <div class="tm-cheat-item"><code>?</code><span>0 または 1 回</span></div>
            <div class="tm-cheat-item"><code>{n}</code><span>ちょうど n 回</span></div>
            <div class="tm-cheat-item"><code>{n,}</code><span>n 回以上</span></div>
            <div class="tm-cheat-item"><code>{n,m}</code><span>n〜m 回</span></div>
            <div class="tm-cheat-item"><code>*? +?</code><span>最短マッチ（非貪欲）</span></div>
          </div>
          <div class="tm-cheat-section">
            <h4>グループ / 選択 / 参照</h4>
            <div class="tm-cheat-item"><code>(...)</code><span>キャプチャグループ</span></div>
            <div class="tm-cheat-item"><code>(?:...)</code><span>非キャプチャグループ</span></div>
            <div class="tm-cheat-item"><code>(?&lt;name&gt;...)</code><span>名前付きグループ</span></div>
            <div class="tm-cheat-item"><code>a|b</code><span>a または b</span></div>
            <div class="tm-cheat-item"><code>\\1</code><span>後方参照（1 番目のグループ）</span></div>
          </div>
          <div class="tm-cheat-section">
            <h4>エスケープ</h4>
            <div class="tm-cheat-item"><code>\\. \\* \\\\</code><span>記号をリテラルとして扱う</span></div>
          </div>
        </div>
      </div>
    </div>
  `,
  init() {
    const FLAGS = 'gim'; // 常に global / ignoreCase / multiline で判定する
    const patternInput = Toolkit.$('re-pattern');
    const testInput = Toolkit.$('re-test');
    const output = Toolkit.$('re-output');
    const status = Toolkit.$('re-status');
    const modal = Toolkit.$('re-modal');

    // 一致範囲を収集する（常に global なので全件）
    function findMatches(re, text) {
      const matches = [];
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length });
        if (m[0] === '') re.lastIndex++; // 幅ゼロマッチでの無限ループ回避
      }
      return matches;
    }

    // 一致箇所を <mark> で囲んだ HTML を組み立てる（前後はエスケープ）
    function renderHighlight(text, matches) {
      let html = '', last = 0;
      for (const { start, end } of matches) {
        html += Toolkit.escapeHtml(text.slice(last, start));
        html += '<mark class="tm-re-hit">' + Toolkit.escapeHtml(text.slice(start, end)) + '</mark>';
        last = end;
      }
      html += Toolkit.escapeHtml(text.slice(last));
      return html;
    }

    function update() {
      const pattern = patternInput.value;
      const text = testInput.value;
      status.textContent = '';
      if (!pattern) { output.textContent = text; return; }
      const { re, error } = Toolkit.tryRegex(pattern, FLAGS);
      if (error) {
        status.textContent = '⚠ 不正な正規表現: ' + error;
        output.textContent = text;
        return;
      }
      output.innerHTML = renderHighlight(text, findMatches(re, text));
    }

    Toolkit.bindState('regex', {
      're-pattern': ['value', 'pattern'],
      're-test': ['value', 'text'],
    }, {
      onRestore() { update(); },
    });

    let rafPending = false;
    function scheduleUpdate() {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => { update(); rafPending = false; });
      }
    }

    patternInput.addEventListener('input', scheduleUpdate);
    testInput.addEventListener('input', scheduleUpdate);

    // チートシート モーダルの開閉
    const cheatModal = Toolkit.modal(modal);
    Toolkit.$('re-help').addEventListener('click', () => cheatModal.open());
    Toolkit.$('re-modal-close').addEventListener('click', () => cheatModal.close());
  },
});
