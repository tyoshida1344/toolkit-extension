Toolkit.registerTab({
  id: 'color',
  icon: '🎨',
  label: 'カラー変換',
  html: `
    <div class="tm-row">
      <label class="tm-label">カラーピッカー</label>
      <div class="tm-inline">
        <input type="color" id="cl-picker" value="#cba6f7"
          style="width:48px;height:34px;padding:2px;background:none;border:1px solid #45475a;border-radius:4px;cursor:pointer">
        <input type="text" class="tm-input" id="cl-hex" value="#cba6f7" style="flex:1" placeholder="#RRGGBB">
        <button class="tm-btn tm-btn-primary tm-btn-sm" id="cl-apply">適用</button>
        ${Toolkit.iconButton('💉', { id: 'cl-eyedrop', title: '画面上の色を取得（スポイト）' })}
      </div>
    </div>
    <div class="tm-color-preview" id="cl-preview" style="background:#cba6f7"></div>
    <div class="tm-color-grid">
      <div class="tm-row">
        <label class="tm-label">HEX</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-hex-out" style="flex:1;min-height:auto">#cba6f7</div>
          ${Toolkit.copyButton('cl-hex-out')}
        </div>
      </div>
      <div class="tm-row">
        <label class="tm-label">RGB</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-rgb-out" style="flex:1;min-height:auto">rgb(203, 166, 247)</div>
          ${Toolkit.copyButton('cl-rgb-out')}
        </div>
      </div>
      <div class="tm-row">
        <label class="tm-label">HSL</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-hsl-out" style="flex:1;min-height:auto">hsl(267, 84%, 81%)</div>
          ${Toolkit.copyButton('cl-hsl-out')}
        </div>
      </div>
      <div class="tm-row">
        <label class="tm-label">RGB 10進</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-dec-out" style="flex:1;min-height:auto">203, 166, 247</div>
          ${Toolkit.copyButton('cl-dec-out')}
        </div>
      </div>
    </div>
  `,
  init() {
    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      if (max === min) { h = s = 0; }
      else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function updateColor(hex) {
      hex = hex.startsWith('#') ? hex : '#' + hex;
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return;
      const { r, g, b } = hexToRgb(hex);
      const { h, s, l } = rgbToHsl(r, g, b);
      const full = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      document.getElementById('cl-picker').value = full;
      document.getElementById('cl-hex').value = full;
      document.getElementById('cl-preview').style.background = full;
      document.getElementById('cl-hex-out').textContent = full;
      document.getElementById('cl-rgb-out').textContent = `rgb(${r}, ${g}, ${b})`;
      document.getElementById('cl-hsl-out').textContent = `hsl(${h}, ${s}%, ${l}%)`;
      document.getElementById('cl-dec-out').textContent = `${r}, ${g}, ${b}`;
    }

    document.getElementById('cl-picker').addEventListener('input', e => updateColor(e.target.value));
    document.getElementById('cl-apply').addEventListener('click', () =>
      updateColor(document.getElementById('cl-hex').value.trim()));
    document.getElementById('cl-hex').addEventListener('keydown', e => {
      if (e.key === 'Enter') updateColor(e.target.value.trim());
    });

    // スポイト（EyeDropper API）
    document.getElementById('cl-eyedrop').addEventListener('click', async () => {
      if (!('EyeDropper' in window)) {
        alert('このブラウザはスポイト機能（EyeDropper API）に対応していません。\nChrome / Edge をお使いください。');
        return;
      }
      try {
        const result = await new EyeDropper().open();
        updateColor(result.sRGBHex);
      } catch (e) { /* cancelled */ }
    });
  },
});
