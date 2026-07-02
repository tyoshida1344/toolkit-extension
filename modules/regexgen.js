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
    <div class="tm-row tm-inline">
      <button class="tm-btn tm-btn-primary" id="rg-gen-exec">正規表現を生成</button>
      ${Toolkit.copyButton('rg-gen-output')}
    </div>
    <div class="tm-row">
      <label class="tm-label">生成結果</label>
      <div class="tm-output" id="rg-gen-output"></div>
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
    const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const SYMBOLS_CC = SYMBOLS.replace(/[\^\-\[\]\\]/g, '\\$&');

    const genMinInput = Toolkit.$('rg-gen-min');
    const genMaxInput = Toolkit.$('rg-gen-max');
    const genOutput = Toolkit.$('rg-gen-output');
    const testInput = Toolkit.$('rg-test');
    const testResult = Toolkit.$('rg-test-result');

    Toolkit.$('rg-symbols-tip').title = '対象記号: ' + SYMBOLS;

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
    });

    function generate() {
      const min = Math.max(0, parseInt(genMinInput.value) || 0);
      const maxVal = genMaxInput.value.trim();
      const max = maxVal ? Math.max(0, parseInt(maxVal) || 0) : '';

      if (max !== '' && min > max) {
        genOutput.textContent = '⚠ 最小値が最大値を超えています';
        save();
        return;
      }

      const allow = {
        upper: Toolkit.$('rg-gen-upper').checked || Toolkit.$('rg-req-upper').checked,
        lower: Toolkit.$('rg-gen-lower').checked || Toolkit.$('rg-req-lower').checked,
        digit: Toolkit.$('rg-gen-digit').checked || Toolkit.$('rg-req-digit').checked,
        symbol: Toolkit.$('rg-gen-symbol').checked || Toolkit.$('rg-req-symbol').checked,
      };

      if (!allow.upper && !allow.lower && !allow.digit && !allow.symbol) {
        genOutput.textContent = '⚠ 文字種を1つ以上選択してください';
        save();
        return;
      }

      let lookaheads = '';
      if (Toolkit.$('rg-req-upper').checked) lookaheads += '(?=.*[A-Z])';
      if (Toolkit.$('rg-req-lower').checked) lookaheads += '(?=.*[a-z])';
      if (Toolkit.$('rg-req-digit').checked) lookaheads += '(?=.*[0-9])';
      if (Toolkit.$('rg-req-symbol').checked) lookaheads += '(?=.*[' + SYMBOLS_CC + '])';

      let charClass = '';
      if (allow.upper) charClass += 'A-Z';
      if (allow.lower) charClass += 'a-z';
      if (allow.digit) charClass += '0-9';
      if (allow.symbol) charClass += SYMBOLS_CC;

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
      try {
        const re = new RegExp(pattern);
        if (re.test(testInput.value)) {
          testResult.textContent = '✓ 合格';
          testResult.className = 'tm-rg-result tm-rg-pass';
        } else {
          testResult.textContent = '✗ 不合格';
          testResult.className = 'tm-rg-result tm-rg-fail';
        }
      } catch (e) {
        testResult.textContent = '⚠ 不正な正規表現';
        testResult.className = 'tm-rg-result tm-rg-warn';
      }
    }

    Toolkit.$('rg-gen-exec').addEventListener('click', generate);
    Toolkit.$('rg-test-exec').addEventListener('click', test);
  },
});
