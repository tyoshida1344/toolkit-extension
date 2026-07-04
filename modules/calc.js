(() => {
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': '%' }; // 演算子の表示記号（内部キー → 画面表示）
  // 入力と計算結果で別々の桁数上限（絶対値）。下限は符号を反転した値。
  const MAX_INPUT_DIGITS = 16;
  const MAX_RESULT_DIGITS = 20;
  const MAX_LEN = MAX_INPUT_DIGITS;
  const MAX_INPUT_ABS = 10n ** BigInt(MAX_INPUT_DIGITS) - 1n;
  const MAX_RESULT_ABS = 10n ** BigInt(MAX_RESULT_DIGITS) - 1n;
  const MAX_INPUT_ABS_NUM = Number(MAX_INPUT_ABS); // 入力上限（小数判定用）
  const MAX_RESULT_ABS_NUM = Number(MAX_RESULT_ABS); // 結果上限（小数判定用）
  const MSG_DIV0 = 'Cannot divide by 0';
  const MSG_OVERFLOW = 'Overflow';
  const KEY_MAP = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'CE' };

  function calcKey(key, label, { cls = '', title = '' } = {}) {
    return `<button type="button" class="tm-calc-key${cls ? ' ' + cls : ''}" data-key="${key}"` +
      `${title ? ` title="${title}" aria-label="${title}"` : ''}>${label}</button>`;
  }

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
          ${calcKey('C', 'C', { cls: 'tm-calc-fn', title: '全消去：式・途中結果をすべてリセット' })}
          ${calcKey('CE', 'CE', { cls: 'tm-calc-fn', title: '入力中の数値だけ消去（演算子・途中結果は保持）' })}
          ${calcKey('back', '⌫', { cls: 'tm-calc-fn', title: '1文字削除' })}
          ${calcKey('/', '÷', { cls: 'tm-calc-op' })}

          ${calcKey('7', '7')} ${calcKey('8', '8')} ${calcKey('9', '9')}
          ${calcKey('*', '×', { cls: 'tm-calc-op' })}

          ${calcKey('4', '4')} ${calcKey('5', '5')} ${calcKey('6', '6')}
          ${calcKey('-', '−', { cls: 'tm-calc-op' })}

          ${calcKey('1', '1')} ${calcKey('2', '2')} ${calcKey('3', '3')}
          ${calcKey('+', '+', { cls: 'tm-calc-op' })}

          ${calcKey('%', '%', { cls: 'tm-calc-op', title: '剰余' })}
          ${calcKey('0', '0')} ${calcKey('.', '.')}
          ${calcKey('=', '=', { cls: 'tm-calc-eq' })}
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
      // 逐次計算の状態（数値はすべて文字列で保持し、整数は BigInt で正確に計算する）
      const displayEl = Toolkit.$('calc-display');
      const exprEl = Toolkit.$('calc-expr');
      const histEl = Toolkit.$('calc-hist');

      let display = '0';        // 表示中の数値（入力中は生の文字列）
      let accumulator = null;   // 左オペランド（確定済みの計算結果, 正規化済み文字列）
      let pendingOp = null;     // 入力待ちの演算子
      let waiting = false;      // true の間、次の数字は新しい数値の先頭
      let lastOp = null;        // = 連打用：直前の演算子
      let lastRhs = null;       // = 連打用：直前の右オペランド（正規化済み文字列）
      let errorState = false;   // 0 除算などのエラー中
      const history = [];       // 計算履歴（最大 HISTORY_LIMIT 件・ストレージに保存）

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
        if (waiting) return; // 確定値は ⌫ で消さない
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
          // = 連打：直前の演算を繰り返す
          a = canon(display);
          op = lastOp;
          b = lastRhs;
        } else {
          return; // 演算子が無ければ何もしない
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

      function addHistory(expr, result) {
        history.unshift({ expr, result });
        if (history.length > Toolkit.HISTORY_LIMIT) history.pop();
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
        let t = String(raw).trim().replace(/,/g, ''); // 桁区切りカンマは許容
        if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return; // 数値でなければ無視
        let val;
        if (isInt(t)) {
          val = BigInt(t).toString(); // 大きな整数も桁落ちさせない
        } else {
          const n = parseFloat(t);
          if (!isFinite(n)) return;
          val = fmt(n);
        }
        if (overAbs(val, MAX_INPUT_ABS, MAX_INPUT_ABS_NUM)) return; // 入力上限を超える貼り付けは無視
        if (errorState) errorState = false;
        display = val;
        waiting = false;
        if (pendingOp == null) accumulator = val;
        render(); save();
      }

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

      function save() {
        Toolkit.saveState('calc', {
          display, accumulator, pendingOp, waiting, lastOp, lastRhs, errorState,
          history,
        });
      }

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
          const k = e.key;
          const key = (k >= '0' && k <= '9') || '+-*/.%'.includes(k) ? k : KEY_MAP[k];
          if (key != null) { e.preventDefault(); press(key); }
        },
        paste(e) {
          const cb = e.clipboardData || window.clipboardData;
          if (!cb) return;
          e.preventDefault();
          pasteNumber(cb.getData('text'));
        },
      });

      renderHistory();
      Toolkit.loadState('calc', s => {
        if (!s) { render(); return; }
        if (typeof s.display === 'string') display = s.display;
        // 数値は文字列で保持する（旧バージョンの数値型データも文字列へ寄せる）
        accumulator = s.accumulator != null ? String(s.accumulator) : null;
        pendingOp = s.pendingOp != null ? s.pendingOp : null;
        waiting = !!s.waiting;
        lastOp = s.lastOp != null ? s.lastOp : null;
        lastRhs = s.lastRhs != null ? String(s.lastRhs) : null;
        errorState = !!s.errorState;
        if (Array.isArray(s.history)) { history.push(...s.history.slice(0, Toolkit.HISTORY_LIMIT)); }
        renderHistory();
        render();
      });
    },
  });
})();
