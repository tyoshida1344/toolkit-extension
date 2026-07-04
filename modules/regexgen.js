Toolkit.registerTab({
  html: `
    <div class="tm-row">
      <label class="tm-label">長さ条件</label>
      <div class="tm-rg-len">
        <span class="tm-rg-len-label">最小</span>
        <input type="number" class="tm-input" id="rg-gen-min" value="1" min="0" max="9999">
        <span class="tm-rg-len-label">最大</span>
        <input type="number" class="tm-input" id="rg-gen-max" placeholder="任意" min="0" max="9999">
      </div>
    </div>
    <div class="tm-row">
      <label class="tm-label">許可する文字種</label>
      <div class="tm-check-row">
        <label class="tm-check-label"><input type="checkbox" id="rg-gen-upper">英大文字 (A-Z)</label>
        <label class="tm-check-label"><input type="checkbox" id="rg-gen-lower">英小文字 (a-z)</label>
        <label class="tm-check-label"><input type="checkbox" id="rg-gen-digit" checked>数字 (0-9)</label>
        <label class="tm-check-label" id="rg-symbols-tip"><input type="checkbox" id="rg-gen-symbol" checked>記号</label>
      </div>
    </div>
    <div class="tm-row">
      <label class="tm-label">必須条件</label>
      <div class="tm-check-row">
        <label class="tm-check-label"><input type="checkbox" id="rg-req-upper">英大文字を1文字以上含む</label>
        <label class="tm-check-label"><input type="checkbox" id="rg-req-lower">英小文字を1文字以上含む</label>
        <label class="tm-check-label"><input type="checkbox" id="rg-req-digit">数字を1文字以上含む</label>
        <label class="tm-check-label"><input type="checkbox" id="rg-req-symbol">記号を1文字以上含む</label>
      </div>
    </div>
    <div class="tm-row">
      <label class="tm-label">生成結果</label>
      <div class="tm-inline">
        <div class="tm-output" id="rg-gen-output" style="flex:1"></div>
        ${Toolkit.copyButton('rg-gen-output')}
      </div>
    </div>
    <hr class="tm-hr">
    <div class="tm-row">
      <label class="tm-label">テスト文字列</label>
      <div class="tm-inline">
        <input type="text" class="tm-input" id="rg-test" placeholder="ここにパスワード候補を入力"
          spellcheck="false" autocomplete="off">
        <button class="tm-btn tm-btn-primary" id="rg-test-exec">判定</button>
      </div>
      <div class="tm-rg-result" id="rg-test-result"></div>
    </div>
  `,
  init() {
    const SYMBOLS_CC = Toolkit.SYMBOLS.replace(/[\^\-\[\]\\]/g, '\\$&');
    const TYPES = [
      { key: 'upper', cc: 'A-Z' },
      { key: 'lower', cc: 'a-z' },
      { key: 'digit', cc: '0-9' },
      { key: 'symbol', cc: SYMBOLS_CC },
    ];

    const genMinInput = Toolkit.$('rg-gen-min');
    const genMaxInput = Toolkit.$('rg-gen-max');
    const genOutput = Toolkit.$('rg-gen-output');
    const testInput = Toolkit.$('rg-test');
    const testResult = Toolkit.$('rg-test-result');

    Toolkit.$('rg-symbols-tip').title = '対象記号: ' + Toolkit.SYMBOLS;

    const save = Toolkit.bindState('regexgen', {
      'rg-gen-min': ['value', 'genMin'],
      'rg-gen-max': ['value', 'genMax'],
      'rg-gen-output': ['textContent', 'genOutput'],
      'rg-test': ['value', 'test'],
      'rg-gen-upper': ['checked', 'genUpper'],
      'rg-gen-lower': ['checked', 'genLower'],
      'rg-gen-digit': ['checked', 'genDigit'],
      'rg-gen-symbol': ['checked', 'genSymbol'],
      'rg-req-upper': ['checked', 'reqUpper'],
      'rg-req-lower': ['checked', 'reqLower'],
      'rg-req-digit': ['checked', 'reqDigit'],
      'rg-req-symbol': ['checked', 'reqSymbol'],
    }, { onRestore() { generate(); } });

    function generate() {
      const min = Math.max(0, parseInt(genMinInput.value) || 0);
      const maxVal = genMaxInput.value.trim();
      const max = maxVal ? Math.max(0, parseInt(maxVal) || 0) : '';

      if (max !== '' && min > max) {
        genOutput.textContent = '⚠ 最小値が最大値を超えています';
        save();
        return;
      }

      let lookaheads = '', charClass = '';
      for (const { key, cc } of TYPES) {
        const req = Toolkit.$('rg-req-' + key).checked;
        if (req) lookaheads += '(?=.*[' + cc + '])';
        if (Toolkit.$('rg-gen-' + key).checked || req) charClass += cc;
      }

      if (!charClass) {
        genOutput.textContent = '⚠ 文字種を1つ以上選択してください';
        save();
        return;
      }

      const quantifier = max !== '' ? '{' + min + ',' + max + '}' : '{' + min + ',}';
      genOutput.textContent = '^' + lookaheads + '[' + charClass + ']' + quantifier + '$';
      testResult.textContent = '';
      testResult.className = 'tm-rg-result';
      save();
    }

    function test() {
      const pattern = genOutput.textContent;
      if (!pattern || pattern.startsWith('⚠')) {
        testResult.textContent = '⚠ 先に正規表現を生成してください';
        testResult.className = 'tm-rg-result tm-rg-warn';
        return;
      }
      const { re, error } = Toolkit.tryRegex(pattern);
      if (error) {
        testResult.textContent = '⚠ 不正な正規表現';
        testResult.className = 'tm-rg-result tm-rg-warn';
        return;
      }
      if (re.test(testInput.value)) {
        testResult.textContent = '✓ 合格';
        testResult.className = 'tm-rg-result tm-rg-pass';
      } else {
        testResult.textContent = '✗ 不合格';
        testResult.className = 'tm-rg-result tm-rg-fail';
      }
    }

    Toolkit.clampInput(genMinInput);
    Toolkit.clampInput(genMaxInput);
    genMinInput.addEventListener('input', generate);
    genMaxInput.addEventListener('input', generate);
    for (const { key } of TYPES) {
      Toolkit.$('rg-gen-' + key).addEventListener('change', generate);
      Toolkit.$('rg-req-' + key).addEventListener('change', generate);
    }
    Toolkit.$('rg-test-exec').addEventListener('click', test);
  },
});
