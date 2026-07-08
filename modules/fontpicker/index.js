(() => {
  const FONT_FAMILIES = [
    'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
    { value: "'游ゴシック', 'Yu Gothic', sans-serif", label: '游ゴシック' },
    { value: "'游明朝', 'Yu Mincho', serif", label: '游明朝' },
    { value: "'メイリオ', Meiryo, sans-serif", label: 'メイリオ' },
    { value: "'Noto Sans JP', sans-serif", label: 'Noto Sans JP' },
    { value: "'ヒラギノ角ゴ ProN', 'Hiragino Kaku Gothic ProN', sans-serif", label: 'ヒラギノ角ゴ' },
    { value: "'ヒラギノ明朝 ProN', 'Hiragino Mincho ProN', serif", label: 'ヒラギノ明朝' },
    { value: "'MS ゴシック', 'MS Gothic', monospace", label: 'MS ゴシック' },
    { value: "'MS 明朝', 'MS Mincho', serif", label: 'MS 明朝' },
  ];
  const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
  const STYLES = ['normal', 'italic', 'oblique'];

  function rgbToHex(rgbStr) {
    const m = rgbStr.match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
  }

  Toolkit.registerTab({
    html: `
      <div class="tm-row">
        <label class="tm-label">font-family</label>
        ${Toolkit.selectHtml('fp-family', FONT_FAMILIES)}
      </div>
      <div class="tm-row tm-row-2col">
        <div class="tm-field">
          <label class="tm-label">font-size</label>
          <div class="tm-inline">
            <input type="number" class="tm-input fp-size-input" id="fp-size" min="1" max="999" placeholder="16">
            <span class="tm-unit">px</span>
          </div>
        </div>
        <div class="tm-field">
          <label class="tm-label">font-weight</label>
          ${Toolkit.selectHtml('fp-weight', WEIGHTS, { selected: '400' })}
        </div>
      </div>
      <div class="tm-row tm-row-2col">
        <div class="tm-field">
          <label class="tm-label">font-style</label>
          ${Toolkit.selectHtml('fp-style', STYLES)}
        </div>
        <div class="tm-field">
          <label class="tm-label">color</label>
          <div class="tm-inline">
            <input type="color" id="fp-color" value="#000000" class="tm-color-swatch">
            <input type="text" class="tm-input" id="fp-hex" spellcheck="false" placeholder="#000000" style="flex:1">
          </div>
        </div>
      </div>
      <div class="fp-preview" id="fp-preview" contenteditable="true" spellcheck="false">あいうえお AaBbCc 123</div>
      <div class="tm-row">
        <button class="tm-btn tm-btn-primary" id="fp-start">ページから取得</button>
      </div>
    `,
    init() {
      const familyEl = Toolkit.$('fp-family');
      const sizeEl = Toolkit.$('fp-size');
      const colorEl = Toolkit.$('fp-color');
      const hexEl = Toolkit.$('fp-hex');
      const previewEl = Toolkit.$('fp-preview');
      const startBtn = Toolkit.$('fp-start');

      const customFonts = [];

      function addCustomFont(val) {
        const label = val.replace(/'/g, '').split(',')[0].trim();
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        familyEl.appendChild(opt);
        customFonts.push({ value: val, label });
      }

      function setFamily(val) {
        if (!val) return;
        familyEl.value = val;
        if (!familyEl.value) {
          addCustomFont(val);
          familyEl.value = val;
        }
      }

      function updatePreview() {
        previewEl.style.fontFamily = familyEl.value || 'sans-serif';
        previewEl.style.fontSize = (sizeEl.value || '16') + 'px';
        previewEl.style.fontWeight = Toolkit.$('fp-weight').value;
        previewEl.style.fontStyle = Toolkit.$('fp-style').value;
        previewEl.style.color = hexEl.value || '#000000';
      }

      function setColor(hex) {
        const norm = Toolkit.normalizeHex(hex);
        if (norm) colorEl.value = norm;
        hexEl.value = hex;
        updatePreview();
        save();
      }

      const save = Toolkit.bindState('fontpicker', {
        'fp-size': 'value',
        'fp-weight': 'value',
        'fp-style': 'value',
      }, {
        extra: () => ({ family: familyEl.value, hex: hexEl.value, text: previewEl.textContent, customFonts }),
        onRestore(s) {
          if (s) {
            if (s.customFonts) s.customFonts.forEach(f => addCustomFont(f.value));
            if (s.family != null) setFamily(s.family);
            if (s.hex != null) setColor(s.hex);
            if (s.text != null) previewEl.textContent = s.text;
          }
          updatePreview();
        },
      });

      Toolkit.clampInput(sizeEl);
      colorEl.addEventListener('change', () => { hexEl.value = colorEl.value; updatePreview(); save(); });
      hexEl.addEventListener('change', () => setColor(hexEl.value.trim()));
      hexEl.addEventListener('keydown', e => { if (e.key === 'Enter') setColor(hexEl.value.trim()); });
      familyEl.addEventListener('change', () => { updatePreview(); save(); });
      previewEl.addEventListener('input', () => save());

      function applyResult(r) {
        setFamily(r.fontFamily || '');
        sizeEl.value = parseInt(r.fontSize) || '';
        const w = Math.max(100, Math.min(900, Math.round((parseInt(r.fontWeight) || 400) / 100) * 100));
        Toolkit.$('fp-weight').value = String(w);
        Toolkit.$('fp-style').value = r.fontStyle || 'normal';
        setColor(rgbToHex(r.color || ''));
      }

      Toolkit.consumeResult('tm_fontpick_result', applyResult);

      startBtn.addEventListener('click', async () => {
        const tab = await Toolkit.getInjectableTab();
        if (!tab) return;
        const inspector = window.FontInspector && window.FontInspector.run;
        if (!inspector) {
          Toolkit.showToast('⚠ インスペクターの初期化に失敗しました');
          return;
        }
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: inspector,
            args: ['start', Toolkit.INJECT_BTN_CSS, Toolkit.INJECT_COPY_ICON],
          });
          window.close();
        } catch (_) {
          Toolkit.showToast('⚠ インスペクターの起動に失敗しました');
        }
      });
    },
  });
})();
