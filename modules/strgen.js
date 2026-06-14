Toolkit.registerTab({
  id: 'strgen',
  icon: '✏️',
  label: '文字列生成',
  html: `
    <div class="tm-row">
      <label class="tm-label">文字種（複数選択可）</label>
      <div class="tm-check-row">
        <label class="tm-check-label"><input type="checkbox" id="sg-hira" checked>ひらがな</label>
        <label class="tm-check-label"><input type="checkbox" id="sg-kata">カタカナ</label>
        <label class="tm-check-label"><input type="checkbox" id="sg-alpha-upper">英大文字</label>
        <label class="tm-check-label"><input type="checkbox" id="sg-alpha-lower">英小文字</label>
        <label class="tm-check-label"><input type="checkbox" id="sg-num">数字</label>
        <label class="tm-check-label"><input type="checkbox" id="sg-symbol">記号</label>
        <label class="tm-check-label"><input type="checkbox" id="sg-hkata">半角ｶﾅ</label>
      </div>
    </div>
    <div class="tm-row tm-inline">
      <label class="tm-label" style="white-space:nowrap;margin:0">文字数</label>
      <input type="number" class="tm-input" id="sg-len" value="10" min="1" max="10000" style="width:100px">
      <button class="tm-btn tm-btn-primary" id="sg-exec">生成</button>
      ${Toolkit.copyButton('sg-output')}
    </div>
    <div class="tm-row">
      <div class="tm-output" id="sg-output"></div>
    </div>
    <hr class="tm-hr">
    <div class="tm-row">
      <label class="tm-label">文字数カウント</label>
      <textarea class="tm-textarea" id="sg-count-input" placeholder="ここにテキストを入力すると文字数をカウントします..." rows="3"></textarea>
      <div style="display:flex;gap:12px;margin-top:6px;font-size:12px;color:#a6adc8">
        <span>文字数: <strong style="color:#cba6f7" id="sg-c-char">0</strong></span>
        <span>バイト(UTF-8): <strong style="color:#cba6f7" id="sg-c-byte">0</strong></span>
        <span>行数: <strong style="color:#cba6f7" id="sg-c-line">0</strong></span>
      </div>
    </div>
  `,
  init() {
    const CHAR_SETS = {
      'sg-hira': 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん',
      'sg-kata': 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
      'sg-alpha-upper': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'sg-alpha-lower': 'abcdefghijklmnopqrstuvwxyz',
      'sg-num': '0123456789',
      'sg-symbol': '!@#$%^&*()-_=+[]{}|;:,.<>?/',
      'sg-hkata': 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ',
    };
    const CHECK_IDS = Object.keys(CHAR_SETS);
    const out = document.getElementById('sg-output');
    const lenInput = document.getElementById('sg-len');
    const countInput = document.getElementById('sg-count-input');

    // 文字数カウント
    function utf8ByteLen(str) {
      let b = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c <= 0x7f) b += 1;
        else if (c <= 0x7ff) b += 2;
        else if (c >= 0xd800 && c <= 0xdbff) { b += 4; i++; }
        else b += 3;
      }
      return b;
    }

    function updateCount() {
      const v = countInput.value;
      document.getElementById('sg-c-char').textContent = [...v].length;
      document.getElementById('sg-c-byte').textContent = utf8ByteLen(v);
      document.getElementById('sg-c-line').textContent = v ? v.split('\n').length : 0;
    }

    // 状態の永続化（チェック・文字数・生成結果・カウント入力）
    function save() {
      Toolkit.saveState('strgen', {
        checks: CHECK_IDS.reduce((o, id) => (o[id] = document.getElementById(id).checked, o), {}),
        len: lenInput.value,
        output: out.textContent,
        count: countInput.value,
      });
    }

    document.getElementById('sg-exec').addEventListener('click', () => {
      let pool = '';
      for (const [id, chars] of Object.entries(CHAR_SETS)) {
        if (document.getElementById(id).checked) pool += chars;
      }
      if (!pool) {
        out.textContent = '⚠ 文字種を1つ以上選択してください';
        return;
      }
      const len = Math.max(1, Math.min(10000, parseInt(lenInput.value) || 10));
      let result = '';
      for (let i = 0; i < len; i++) result += pool[Math.floor(Math.random() * pool.length)];
      out.textContent = result;
      save();
    });

    CHECK_IDS.forEach(id => document.getElementById(id).addEventListener('change', save));
    lenInput.addEventListener('input', save);

    countInput.addEventListener('input', () => { updateCount(); save(); });

    // 復元
    Toolkit.loadState('strgen', s => {
      if (!s) return;
      if (s.checks) CHECK_IDS.forEach(id => {
        if (id in s.checks) document.getElementById(id).checked = s.checks[id];
      });
      if (s.len != null && s.len !== '') lenInput.value = s.len;
      if (s.output) out.textContent = s.output;
      if (s.count) { countInput.value = s.count; updateCount(); }
    });
  },
});
