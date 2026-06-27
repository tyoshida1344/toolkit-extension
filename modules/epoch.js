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

    const refresh = () => { Toolkit.$('ep-now').textContent = Date.now(); };
    refresh();

    Toolkit.$('ep-refresh').addEventListener('click', refresh);

    const msInput = Toolkit.$('ep-ms-input');
    const msResult = Toolkit.$('ep-ms-result');
    const dateInput = Toolkit.$('ep-date-input');
    const dateResult = Toolkit.$('ep-date-result');
    const dateUnit = Toolkit.$('ep-date-unit');

    // 状態の永続化（各入力値と変換結果。現在時刻はライブなので保存しない）
    function save() {
      Toolkit.saveState('epoch', {
        msInput: msInput.value,
        msResult: msResult.textContent,
        dateInput: dateInput.value,
        dateResult: dateResult.textContent,
        unit: !dateUnit.hidden,
      });
    }

    msInput.addEventListener('input', save);

    Toolkit.$('ep-ms2date').addEventListener('click', () => {
      const v = msInput.value.trim();
      const ms = Number(v);
      if (!v || isNaN(ms)) {
        msResult.textContent = '⚠ 有効な数値を入力してください';
        save();
        return;
      }
      const d = new Date(ms);
      msResult.textContent = `ローカル: ${fmtDate(d)}\nUTC: ${d.toISOString()}`;
      save();
    });

    // 入力欄のどこをクリックしてもカレンダーを開く（カレンダーアイコンだけだと当たり判定が小さいため）
    const openPicker = () => { try { dateInput.showPicker(); } catch (_) { /* 既に表示中など */ } };
    dateInput.addEventListener('click', openPicker);
    dateInput.addEventListener('focus', openPicker);
    dateInput.addEventListener('change', save);

    Toolkit.$('ep-date2ms').addEventListener('click', () => {
      const v = dateInput.value;
      if (!v) {
        dateResult.textContent = '⚠ 日時を入力してください';
        dateUnit.hidden = true;
        save();
        return;
      }
      // コピペしやすいよう出力は数値のみ。単位「ミリ秒」は外出し表示する。
      dateResult.textContent = new Date(v).getTime();
      dateUnit.hidden = false;
      save();
    });

    // 復元
    Toolkit.loadState('epoch', s => {
      if (!s) return;
      if (s.msInput) msInput.value = s.msInput;
      if (s.msResult) msResult.textContent = s.msResult;
      if (s.dateInput) dateInput.value = s.dateInput;
      if (s.dateResult) {
        dateResult.textContent = s.dateResult;
        dateUnit.hidden = !s.unit;
      }
    });
  },
});
