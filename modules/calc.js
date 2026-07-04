(() => {
  // ── 定数 ──
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': '%' };
  const MAX_INPUT_DIGITS = 16;
  const MAX_RESULT_DIGITS = 20;
  const MAX_LEN = MAX_INPUT_DIGITS;
  const MAX_INPUT_ABS = 10n ** BigInt(MAX_INPUT_DIGITS) - 1n;
  const MAX_RESULT_ABS = 10n ** BigInt(MAX_RESULT_DIGITS) - 1n;
  const MAX_INPUT_ABS_NUM = Number(MAX_INPUT_ABS);
  const MAX_RESULT_ABS_NUM = Number(MAX_RESULT_ABS);
  const MSG_DIV0 = 'Cannot divide by 0';
  const MSG_OVERFLOW = 'Overflow';

  // ── 純粋関数 ──
  const isInt = (s) => /^-?\d+$/.test(s);

  function fmt(n) {
    if (!isFinite(n)) return 'Overflow';
    return parseFloat(n.toPrecision(12)).toString();
  }

  function canon(s) {
    if (isInt(s)) return BigInt(s).toString();
    const n = parseFloat(s);
    return isFinite(n) ? fmt(n) : '0';
  }

  function overAbs(valStr, maxBig, maxNum) {
    if (isInt(valStr)) {
      let v = BigInt(valStr);
      if (v < 0n) v = -v;
      return v > maxBig;
    }
    return Math.abs(parseFloat(valStr)) > maxNum;
  }

  function compute(a, op, b) {
    let value;
    if (isInt(a) && isInt(b)) {
      const x = BigInt(a), y = BigInt(b);
      switch (op) {
        case '+': value = (x + y).toString(); break;
        case '-': value = (x - y).toString(); break;
        case '*': value = (x * y).toString(); break;
        case '%':
          if (y === 0n) return { ok: false, msg: MSG_DIV0 };
          value = (x % y).toString(); break;
        case '/':
          if (y === 0n) return { ok: false, msg: MSG_DIV0 };
          value = (x % y === 0n) ? (x / y).toString() : fmt(Number(x) / Number(y));
          break;
        default: value = b;
      }
    } else {
      const x = parseFloat(a), y = parseFloat(b);
      let res;
      switch (op) {
        case '+': res = x + y; break;
        case '-': res = x - y; break;
        case '*': res = x * y; break;
        case '/': if (y === 0) return { ok: false, msg: MSG_DIV0 }; res = x / y; break;
        case '%': if (y === 0) return { ok: false, msg: MSG_DIV0 }; res = x % y; break;
        default: return { ok: true, value: b };
      }
      if (!isFinite(res)) return { ok: false, msg: MSG_OVERFLOW };
      value = fmt(res);
    }
    if (overAbs(value, MAX_RESULT_ABS, MAX_RESULT_ABS_NUM)) return { ok: false, msg: MSG_OVERFLOW };
    return { ok: true, value };
  }

  // ── タブ登録 ──
  Toolkit.registerTab({
    html: `
      <div class="tm-calc">
        <div class="tm-calc-display">
          <div class="tm-calc-expr" id="calc-expr">&nbsp;</div>
          <div class="tm-calc-main">
            <div class="tm-calc-value" id="calc-display">0</div>
            ${Toolkit.copyButton('calc-display', { title: '結果をコピー' })}
          </div>
        </div>
        <div class="tm-calc-keys" id="calc-keys">
          <button type="button" class="tm-calc-key tm-calc-fn" data-key="C" title="全消去：式・途中結果をすべてリセット" aria-label="全消去">C</button>
          <button type="button" class="tm-calc-key tm-calc-fn" data-key="CE" title="入力中の数値だけ消去（演算子・途中結果は保持）" aria-label="入力中の数値を消去">CE</button>
          <button type="button" class="tm-calc-key tm-calc-fn" data-key="back" title="1文字削除" aria-label="1文字削除">⌫</button>
          <button type="button" class="tm-calc-key tm-calc-op" data-key="/">÷</button>

          <button type="button" class="tm-calc-key" data-key="7">7</button>
          <button type="button" class="tm-calc-key" data-key="8">8</button>
          <button type="button" class="tm-calc-key" data-key="9">9</button>
          <button type="button" class="tm-calc-key tm-calc-op" data-key="*">×</button>

          <button type="button" class="tm-calc-key" data-key="4">4</button>
          <button type="button" class="tm-calc-key" data-key="5">5</button>
          <button type="button" class="tm-calc-key" data-key="6">6</button>
          <button type="button" class="tm-calc-key tm-calc-op" data-key="-">−</button>

          <button type="button" class="tm-calc-key" data-key="1">1</button>
          <button type="button" class="tm-calc-key" data-key="2">2</button>
          <button type="button" class="tm-calc-key" data-key="3">3</button>
          <button type="button" class="tm-calc-key tm-calc-op" data-key="+">+</button>

          <button type="button" class="tm-calc-key tm-calc-op" data-key="%" title="剰余">%</button>
          <button type="button" class="tm-calc-key" data-key="0">0</button>
          <button type="button" class="tm-calc-key" data-key=".">.</button>
          <button type="button" class="tm-calc-key tm-calc-eq" data-key="=">=</button>
        </div>
        <div class="tm-calc-history">
          <div class="tm-calc-history-head">
            <span class="tm-label" style="margin:0">履歴</span>
            <button type="button" class="tm-btn tm-btn-secondary tm-btn-sm" id="calc-hist-clear">クリア</button>
          </div>
          <div class="tm-calc-history-list" id="calc-hist"></div>
        </div>
      </div>
    `,
    init() {
      // ── 状態 ──
      const displayEl = Toolkit.$('calc-display');
      const exprEl = Toolkit.$('calc-expr');
      const histEl = Toolkit.$('calc-hist');

      let display = '0';
      let accumulator = null;
      let pendingOp = null;
      let waiting = false;
      let lastOp = null;
      let lastRhs = null;
      let errorState = false;
      const history = [];

      // ── 描画 ──
      function render() {
        displayEl.textContent = display;
        exprEl.innerHTML = exprText() || '&nbsp;';
      }

      function exprText() {
        if (errorState) return '';
        if (pendingOp != null) return accumulator + ' ' + SYM[pendingOp];
        return '';
      }

      function setError(msg) {
        display = msg || 'Error';
        exprEl.innerHTML = '&nbsp;';
        displayEl.textContent = display;
        accumulator = null; pendingOp = null; lastOp = null; lastRhs = null;
        waiting = true; errorState = true;
        save();
      }

      // ── 入力操作 ──
      function clearAll() {
        display = '0'; accumulator = null; pendingOp = null;
        waiting = false; lastOp = null; lastRhs = null; errorState = false;
        render(); save();
      }

      function clearEntry() {
        display = '0'; waiting = false;
        render(); save();
      }

      function inputDigit(d) {
        if (errorState) { clearAll(); }
        if (waiting) { display = d; waiting = false; }
        else if (display === '0') { display = d; }
        else if (display.replace('-', '').replace('.', '').length >= MAX_LEN) { return; }
        else { display += d; }
        render(); save();
      }

      function inputDot() {
        if (errorState) { clearAll(); }
        if (waiting) { display = '0.'; waiting = false; }
        else if (!display.includes('.')) { display += '.'; }
        render(); save();
      }

      function backspace() {
        if (errorState) { clearAll(); return; }
        if (waiting) return;
        if (display.length <= 1 || (display.length === 2 && display.startsWith('-'))) {
          display = '0';
        } else {
          display = display.slice(0, -1);
        }
        render(); save();
      }

      function inputOp(op) {
        if (errorState) return;
        if (pendingOp != null && !waiting) {
          const r = compute(accumulator, pendingOp, canon(display));
          if (!r.ok) { setError(r.msg); return; }
          accumulator = r.value;
          display = r.value;
        } else if (pendingOp == null) {
          accumulator = canon(display);
        }
        pendingOp = op;
        waiting = true;
        lastOp = null; lastRhs = null;
        render(); save();
      }

      function equals() {
        if (errorState) return;
        let a, op, b;
        if (pendingOp != null) {
          a = accumulator;
          op = pendingOp;
          b = canon(display);
        } else if (lastOp != null) {
          a = canon(display);
          op = lastOp;
          b = lastRhs;
        } else {
          return;
        }
        const r = compute(a, op, b);
        if (!r.ok) { setError(r.msg); return; }
        addHistory(`${a} ${SYM[op]} ${b} =`, r.value);
        display = r.value;
        accumulator = r.value;
        lastOp = op; lastRhs = b;
        pendingOp = null;
        waiting = true;
        render(); save();
      }

      // ── 履歴 ──
      function addHistory(expr, result) {
        history.unshift({ expr, result });
        if (history.length > 20) history.pop();
        renderHistory();
        save();
      }

      function renderHistory() {
        histEl.innerHTML = '';
        if (history.length === 0) {
          histEl.innerHTML = '<div class="tm-calc-history-empty">履歴はありません</div>';
          return;
        }
        history.forEach(h => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'tm-calc-history-item';
          item.dataset.result = h.result;
          const expr = document.createElement('span');
          expr.className = 'tm-calc-history-expr';
          expr.textContent = h.expr;
          const res = document.createElement('span');
          res.className = 'tm-calc-history-result';
          res.textContent = h.result;
          item.append(expr, res);
          histEl.appendChild(item);
        });
      }

      function reuse(result) {
        if (errorState) errorState = false;
        display = result;
        waiting = false;
        if (pendingOp == null) accumulator = result;
        render(); save();
      }

      function pasteNumber(raw) {
        let t = String(raw).trim().replace(/,/g, '');
        if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return;
        let val;
        if (isInt(t)) {
          val = BigInt(t).toString();
        } else {
          const n = parseFloat(t);
          if (!isFinite(n)) return;
          val = fmt(n);
        }
        if (overAbs(val, MAX_INPUT_ABS, MAX_INPUT_ABS_NUM)) return;
        if (errorState) errorState = false;
        display = val;
        waiting = false;
        if (pendingOp == null) accumulator = val;
        render(); save();
      }

      // ── 入力ディスパッチ ──
      function press(key) {
        if (key >= '0' && key <= '9') return inputDigit(key);
        switch (key) {
          case '.': return inputDot();
          case '+': case '-': case '*': case '/': case '%': return inputOp(key);
          case '=': return equals();
          case 'C': return clearAll();
          case 'CE': return clearEntry();
          case 'back': return backspace();
        }
      }

      // ── 永続化 ──
      function save() {
        Toolkit.saveState('calc', {
          display, accumulator, pendingOp, waiting, lastOp, lastRhs, errorState,
          history,
        });
      }

      // ── イベント結線 ──
      Toolkit.$('calc-keys').addEventListener('click', (e) => {
        const btn = e.target.closest('.tm-calc-key');
        if (!btn) return;
        press(btn.dataset.key);
      });

      histEl.addEventListener('click', (e) => {
        const item = e.target.closest('.tm-calc-history-item');
        if (!item) return;
        reuse(item.dataset.result);
      });

      Toolkit.$('calc-hist-clear').addEventListener('click', () => {
        history.length = 0;
        renderHistory();
        save();
      });

      Toolkit.onTabShortcut('calc', {
        keydown(e) {
          if (e.ctrlKey || e.metaKey || e.altKey) return;

          let key = null;
          if (e.key >= '0' && e.key <= '9') key = e.key;
          else if (e.key === '.') key = '.';
          else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/' || e.key === '%') key = e.key;
          else if (e.key === 'Enter' || e.key === '=') key = '=';
          else if (e.key === 'Backspace') key = 'back';
          else if (e.key === 'Escape') key = 'C';
          else if (e.key === 'Delete') key = 'CE';

          if (key != null) { e.preventDefault(); press(key); }
        },
        paste(e) {
          const cb = e.clipboardData || window.clipboardData;
          if (!cb) return;
          e.preventDefault();
          pasteNumber(cb.getData('text'));
        },
      });

      // ── 復元 ──
      renderHistory();
      Toolkit.loadState('calc', s => {
        if (!s) { render(); return; }
        if (typeof s.display === 'string') display = s.display;
        accumulator = s.accumulator != null ? String(s.accumulator) : null;
        pendingOp = s.pendingOp != null ? s.pendingOp : null;
        waiting = !!s.waiting;
        lastOp = s.lastOp != null ? s.lastOp : null;
        lastRhs = s.lastRhs != null ? String(s.lastRhs) : null;
        errorState = !!s.errorState;
        if (Array.isArray(s.history)) { history.push(...s.history.slice(0, 20)); }
        renderHistory();
        render();
      });
    },
  });
})();
