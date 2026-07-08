(() => {
  const INJECTABLE = /^https?:\/\//i;

  function rgbToHex(rgbStr) {
    const m = rgbStr.match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
  }

  Toolkit.registerTab({
    html: `
      <div class="fp-preview" id="fp-preview">あいうえお AaBbCc 123</div>
      <div class="tm-row">
        <label class="tm-label">font-family</label>
        <input type="text" class="tm-input" id="fp-family" spellcheck="false" placeholder="sans-serif">
      </div>
      <div class="tm-row fp-row-2col">
        <div class="fp-field">
          <label class="tm-label">font-size</label>
          <div class="tm-inline">
            <input type="number" class="tm-input fp-size-input" id="fp-size" min="1" max="999" placeholder="16">
            <span class="fp-unit">px</span>
          </div>
        </div>
        <div class="fp-field">
          <label class="tm-label">font-weight</label>
          <select class="tm-input" id="fp-weight">
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="300">300</option>
            <option value="400" selected>400</option>
            <option value="500">500</option>
            <option value="600">600</option>
            <option value="700">700</option>
            <option value="800">800</option>
            <option value="900">900</option>
          </select>
        </div>
      </div>
      <div class="tm-row fp-row-2col">
        <div class="fp-field">
          <label class="tm-label">font-style</label>
          <select class="tm-input" id="fp-style">
            <option value="normal">normal</option>
            <option value="italic">italic</option>
            <option value="oblique">oblique</option>
          </select>
        </div>
        <div class="fp-field">
          <label class="tm-label">color</label>
          <div class="tm-inline">
            <input type="color" id="fp-color" value="#000000" class="fp-color-swatch">
            <input type="text" class="tm-input" id="fp-hex" spellcheck="false" placeholder="#000000" style="flex:1">
          </div>
        </div>
      </div>
      <div class="tm-row">
        <button class="tm-btn tm-btn-primary" id="fp-start">フォント取得を開始</button>
      </div>
    `,
    init() {
      const familyEl = Toolkit.$('fp-family');
      const sizeEl = Toolkit.$('fp-size');
      const weightEl = Toolkit.$('fp-weight');
      const styleEl = Toolkit.$('fp-style');
      const colorEl = Toolkit.$('fp-color');
      const hexEl = Toolkit.$('fp-hex');
      const previewEl = Toolkit.$('fp-preview');
      const startBtn = Toolkit.$('fp-start');
      const _scripting = (typeof chrome !== 'undefined' && chrome.scripting) || null;
      const _tabs = (typeof chrome !== 'undefined' && chrome.tabs) || null;

      function updatePreview() {
        previewEl.style.fontFamily = familyEl.value || 'sans-serif';
        previewEl.style.fontSize = (sizeEl.value || '16') + 'px';
        previewEl.style.fontWeight = weightEl.value;
        previewEl.style.fontStyle = styleEl.value;
        previewEl.style.color = hexEl.value || '#000000';
      }

      function setColor(hex) {
        hex = hex.startsWith('#') ? hex : '#' + hex;
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
          if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
          colorEl.value = hex;
        }
        hexEl.value = hex;
        updatePreview();
        save();
      }

      colorEl.addEventListener('input', () => { hexEl.value = colorEl.value; updatePreview(); save(); });
      hexEl.addEventListener('change', () => setColor(hexEl.value.trim()));
      hexEl.addEventListener('keydown', e => { if (e.key === 'Enter') setColor(hexEl.value.trim()); });

      [familyEl, sizeEl].forEach(el => el.addEventListener('input', () => { updatePreview(); save(); }));
      [weightEl, styleEl].forEach(el => el.addEventListener('change', () => { updatePreview(); save(); }));

      function save() {
        Toolkit.saveState('fontpicker', {
          family: familyEl.value, size: sizeEl.value, weight: weightEl.value,
          style: styleEl.value, hex: hexEl.value,
        });
      }

      function applyResult(r) {
        familyEl.value = r.fontFamily || '';
        sizeEl.value = parseInt(r.fontSize) || '';
        const w = Math.max(100, Math.min(900, Math.round((parseInt(r.fontWeight) || 400) / 100) * 100));
        weightEl.value = String(w);
        styleEl.value = r.fontStyle || 'normal';
        setColor(rgbToHex(r.color || ''));
      }

      Toolkit.loadState('fontpicker', s => {
        if (s) {
          if (s.family != null) familyEl.value = s.family;
          if (s.size != null) sizeEl.value = s.size;
          if (s.weight != null) weightEl.value = s.weight;
          if (s.style != null) styleEl.value = s.style;
          if (s.hex != null) { hexEl.value = s.hex; setColor(s.hex); }
        }
        updatePreview();
      });

      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get('tm_fontpick_result', data => {
          const r = data.tm_fontpick_result;
          if (r) {
            applyResult(r);
            chrome.storage.local.remove('tm_fontpick_result');
          }
        });
      }

      startBtn.addEventListener('click', async () => {
        if (!_scripting || !_tabs) {
          Toolkit.showToast('⚠ この機能はこのブラウザに対応していません');
          return;
        }
        let tab;
        try {
          const list = await _tabs.query({ active: true, currentWindow: true });
          tab = list && list[0];
        } catch (_) {}
        if (!tab || !INJECTABLE.test(tab.url || '')) {
          Toolkit.showToast('⚠ このページでは使用できません');
          return;
        }
        const inspector = window.FontInspector && window.FontInspector.run;
        if (!inspector) {
          Toolkit.showToast('⚠ インスペクターの初期化に失敗しました');
          return;
        }
        try {
          await _scripting.executeScript({
            target: { tabId: tab.id },
            func: inspector,
            args: ['start', Toolkit.INJECT_BTN_CSS],
          });
          window.close();
        } catch (_) {
          Toolkit.showToast('⚠ インスペクターの起動に失敗しました');
        }
      });
    },
  });
})();
