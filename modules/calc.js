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
    // 演算子の表示記号（内部キー → 画面表示）
    const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': '%' };
    // 入力と計算結果で別々の桁数上限（絶対値）。下限は符号を反転した値。
    const MAX_INPUT_DIGITS = 16;    // 入力の最大桁数（±9999999999999999）
    const MAX_RESULT_DIGITS = 20;   // 計算結果の最大桁数（±99999999999999999999）
    const MAX_LEN = MAX_INPUT_DIGITS;                             // 入力中の桁数制限
    const MAX_INPUT_ABS = 10n ** BigInt(MAX_INPUT_DIGITS) - 1n;   // 入力上限（BigInt）
    const MAX_RESULT_ABS = 10n ** BigInt(MAX_RESULT_DIGITS) - 1n; // 結果上限（BigInt）
    const MAX_INPUT_ABS_NUM = Number(MAX_INPUT_ABS);             // 入力上限（小数判定用）
    const MAX_RESULT_ABS_NUM = Number(MAX_RESULT_ABS);           // 結果上限（小数判定用）

    // エラー表示の文言
    const MSG_DIV0 = 'Cannot divide by 0'; // 0 除算
    const MSG_OVERFLOW = 'Overflow';       // 上限/下限超過・非有限

    const displayEl = Toolkit.$('calc-display');
    const exprEl = Toolkit.$('calc-expr');
    const histEl = Toolkit.$('calc-hist');

    // 逐次計算の状態（数値はすべて文字列で保持し、整数は BigInt で正確に計算する）
    let display = '0';        // 表示中の数値（入力中は生の文字列）
    let accumulator = null;   // 左オペランド（確定済みの計算結果, 正規化済み文字列）
    let pendingOp = null;     // 入力待ちの演算子
    let waiting = false;      // true の間、次の数字は新しい数値の先頭
    let lastOp = null;        // = 連打用：直前の演算子
    let lastRhs = null;       // = 連打用：直前の右オペランド（正規化済み文字列）
    let errorState = false;   // 0 除算などのエラー中
    const history = [];       // 計算履歴（最大 20 件・ストレージに保存）

    const isInt = (s) => /^-?\d+$/.test(s);

    /** 浮動小数の誤差を丸めて文字列化（末尾ゼロ除去） */
    function fmt(n) {
      if (!isFinite(n)) return 'Overflow';
      return parseFloat(n.toPrecision(12)).toString();
    }

    /** 入力中の生文字列を表示・計算用の正規化済み文字列にする（整数は桁落ちさせない） */
    function canon(s) {
      if (isInt(s)) return BigInt(s).toString(); // 先頭ゼロ等を除去、桁落ちなし
      const n = parseFloat(s);
      return isFinite(n) ? fmt(n) : '0';
    }

    /** 正規化済み文字列の絶対値が指定上限を超えているか */
    function overAbs(valStr, maxBig, maxNum) {
      if (isInt(valStr)) {
        let v = BigInt(valStr);
        if (v < 0n) v = -v;
        return v > maxBig;
      }
      return Math.abs(parseFloat(valStr)) > maxNum;
    }

    /**
     * a op b を計算する。両オペランドが整数なら BigInt で正確に、小数を含むなら Number で計算。
     * 戻り値は { ok:true, value } か { ok:false, msg }。
     * 0 除算は msg=MSG_DIV0、上限/下限超過・非有限は msg=MSG_OVERFLOW。
     */
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

    function render() {
      displayEl.textContent = display;
      exprEl.innerHTML = exprText() || '&nbsp;';
    }

    function exprText() {
      if (errorState) return '';
      if (pendingOp != null) {
        return accumulator + ' ' + SYM[pendingOp];
      }
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
        // 直前までを計算して連鎖
        const r = compute(accumulator, pendingOp, canon(display));
        if (!r.ok) { setError(r.msg); return; }
        accumulator = r.value;
        display = r.value;
      } else if (pendingOp == null) {
        accumulator = canon(display);
      }
      // pendingOp が既にあって waiting 中なら演算子だけ差し替え
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

    // ── 履歴（最大 20 件・ストレージに保存） ──
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

    /** 履歴の結果を表示欄へ再利用 */
    function reuse(result) {
      if (errorState) errorState = false;
      display = result;
      waiting = false;
      // 計算の続きができるよう、確定値として扱う
      if (pendingOp == null) accumulator = result;
      render(); save();
    }

    /** クリップボードから数値を貼り付け（数値以外は無視） */
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
      // 確定値として扱い、計算の続きができるようにする
      if (pendingOp == null) accumulator = val;
      render(); save();
    }

    // ── 入力ディスパッチ（クリック・キーボード共通） ──
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

    // ── 状態の永続化（計算状態＋履歴） ──
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

    // キーボード／ペースト入力（電卓タブがアクティブで入力欄・モーダル外のときだけ反応。共通ガード経由）
    Toolkit.onTabShortcut('calc', {
      keydown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+C 等のショートカットは横取りしない

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
      // 数値のペースト（数値以外は無視）
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
      // 数値は文字列で保持する（旧バージョンの数値型データも文字列へ寄せる）
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
