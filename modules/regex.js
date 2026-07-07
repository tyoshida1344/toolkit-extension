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

    ${Toolkit.modalHtml('re-modal', '正規表現チートシート', '', { closeId: 're-modal-close', bodyId: 're-cheat-body' })}
  `,
  init() {
    const CHEATSHEET = [
      ['アンカー / 位置', [
        ['^', '行頭'], ['$', '行末'], ['\\b', '単語境界'], ['\\B', '非単語境界'],
      ]],
      ['文字クラス', [
        ['.', '任意の1文字（改行を除く）'], ['\\d', '数字 [0-9]'], ['\\D', '数字以外'],
        ['\\w', '英数字とアンダースコア'], ['\\W', '\\w 以外'],
        ['\\s', '空白文字'], ['\\S', '空白以外'],
        ['[abc]', 'a / b / c のいずれか'], ['[^abc]', 'a / b / c 以外'], ['[a-z]', '範囲指定'],
      ]],
      ['量指定子', [
        ['*', '0 回以上'], ['+', '1 回以上'], ['?', '0 または 1 回'],
        ['{n}', 'ちょうど n 回'], ['{n,}', 'n 回以上'], ['{n,m}', 'n〜m 回'],
        ['*? +?', '最短マッチ（非貪欲）'],
      ]],
      ['グループ / 選択 / 参照', [
        ['(...)', 'キャプチャグループ'], ['(?:...)', '非キャプチャグループ'],
        ['(?&lt;name&gt;...)', '名前付きグループ'], ['a|b', 'a または b'],
        ['\\1', '後方参照（1 番目のグループ）'],
      ]],
      ['エスケープ', [
        ['\\. \\* \\\\', '記号をリテラルとして扱う'],
      ]],
    ];

    Toolkit.$('re-cheat-body').innerHTML = CHEATSHEET.map(([title, items]) =>
      '<div class="tm-cheat-section"><h4>' + title + '</h4>' +
      items.map(([code, desc]) =>
        '<div class="tm-cheat-item"><code>' + code + '</code><span>' + desc + '</span></div>'
      ).join('') + '</div>'
    ).join('');

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
