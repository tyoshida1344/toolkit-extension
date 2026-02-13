Toolkit.registerTab({
  id: 'epoch',
  icon: '⏱️',
  label: 'エポック変換',
  html: `
    <div class="tm-row">
      <label class="tm-label">現在のエポックミリ秒</label>
      <div class="tm-inline">
        <div class="tm-output" id="ep-now" style="flex:1;min-height:auto;cursor:pointer" title="クリックでコピー"></div>
        <button class="tm-btn tm-btn-secondary tm-btn-sm" id="ep-refresh">更新</button>
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
        <input type="datetime-local" class="tm-input" id="ep-date-input" step="1">
        <button class="tm-btn tm-btn-primary tm-btn-sm" id="ep-date2ms">変換</button>
      </div>
      <div class="tm-output" id="ep-date-result" style="margin-top:6px"></div>
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
    document.getElementById('ep-now').addEventListener('click', () => {
      Toolkit.copyText(document.getElementById('ep-now').textContent);
    });

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

    document.getElementById('ep-date2ms').addEventListener('click', () => {
      const v = document.getElementById('ep-date-input').value;
      if (!v) {
        document.getElementById('ep-date-result').textContent = '⚠ 日時を入力してください';
        return;
      }
      document.getElementById('ep-date-result').textContent = `${new Date(v).getTime()} ミリ秒`;
    });
  },
});
