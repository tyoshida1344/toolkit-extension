Toolkit.registerTab({
  id: 'epoch',
  icon: '⏱️',
  label: 'エポック変換',
  html: `
    <div class="tm-row">
      <label class="tm-label">現在のエポックミリ秒</label>
      <div class="tm-inline">
        <div class="tm-output" id="ep-now" style="flex:1;min-height:auto"></div>
        ${Toolkit.copyButton('ep-now')}
        ${Toolkit.iconButton(Toolkit.ICONS.refresh, { id: 'ep-refresh', title: '更新' })}
      </div>
    </div>
    <hr class="tm-hr">
    <div class="tm-row">
      <label class="tm-label">エポックミリ秒 → 日時</label>
      <div class="tm-inline">
        <input type="text" class="tm-input" id="ep-ms-input" placeholder="例: 1700000000000">
        <button class="tm-btn tm-btn-primary tm-btn-sm" id="ep-ms2date">変換</button>
      </div>
      <div class="tm-output" id="ep-ms-result" style="margin-top:6px"></div>
    </div>
    <hr class="tm-hr">
    <div class="tm-row">
      <label class="tm-label">日時 → エポックミリ秒</label>
      <div class="tm-inline">
        <input type="datetime-local" class="tm-input tm-input-picker" id="ep-date-input" step="1">
        <button class="tm-btn tm-btn-primary tm-btn-sm" id="ep-date2ms">変換</button>
      </div>
      <div class="tm-inline" style="margin-top:6px">
        <div class="tm-output" id="ep-date-result" style="flex:1;min-height:auto"></div>
        <span class="tm-unit" id="ep-date-unit" hidden>ミリ秒</span>
        ${Toolkit.copyButton('ep-date-result')}
      </div>
    </div>
  `,
  init() {
    const pad = (n, l = 2) => String(n).padStart(l, '0');
    function fmtDate(d) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }

    const refresh = () => { document.getElementById('ep-now').textContent = Date.now(); };
    refresh();

    document.getElementById('ep-refresh').addEventListener('click', refresh);

    document.getElementById('ep-ms2date').addEventListener('click', () => {
      const v = document.getElementById('ep-ms-input').value.trim();
      const ms = Number(v);
      if (!v || isNaN(ms)) {
        document.getElementById('ep-ms-result').textContent = '⚠ 有効な数値を入力してください';
        return;
      }
      const d = new Date(ms);
      document.getElementById('ep-ms-result').textContent =
        `ローカル: ${fmtDate(d)}\nUTC: ${d.toISOString()}`;
    });

    // 入力欄のどこをクリックしてもカレンダーを開く（カレンダーアイコンだけだと当たり判定が小さいため）
    const dateInput = document.getElementById('ep-date-input');
    const openPicker = () => { try { dateInput.showPicker(); } catch (_) { /* 既に表示中など */ } };
    dateInput.addEventListener('click', openPicker);
    dateInput.addEventListener('focus', openPicker);

    const dateResult = document.getElementById('ep-date-result');
    const dateUnit = document.getElementById('ep-date-unit');
    document.getElementById('ep-date2ms').addEventListener('click', () => {
      const v = dateInput.value;
      if (!v) {
        dateResult.textContent = '⚠ 日時を入力してください';
        dateUnit.hidden = true;
        return;
      }
      // コピペしやすいよう出力は数値のみ。単位「ミリ秒」は外出し表示する。
      dateResult.textContent = new Date(v).getTime();
      dateUnit.hidden = false;
    });
  },
});
