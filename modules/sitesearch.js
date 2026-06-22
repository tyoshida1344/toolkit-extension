Toolkit.registerTab({
  id: 'sitesearch',
  icon: '🔎',
  label: 'サイト内検索',
  html: `
    <div class="tm-row tm-inline">
      <input type="text" class="tm-input" id="ss-pattern" list="ss-history-list"
        spellcheck="false" autocomplete="off" autocapitalize="off">
      <button class="tm-btn tm-btn-primary" id="ss-exec">検索</button>
      ${Toolkit.iconButton('📌', { id: 'ss-openbar', title: 'ページに検索バーを表示（閉じても・タブ切替でも使える）' })}
      <datalist id="ss-history-list"></datalist>
    </div>
    <div class="tm-row ss-controls">
      <div class="ss-opts">
        <label class="ss-check" title="開いている全タブを検索する（OFF で現在のページのみ）">
          <input type="checkbox" id="ss-scope-all"> 全タブ検索
        </label>
        <label class="ss-check" title="正規表現として検索する（OFF で入力をそのまま検索）">
          <input type="checkbox" id="ss-regex" checked> 正規表現
        </label>
        <label class="ss-check" title="大文字小文字を区別する">
          <input type="checkbox" id="ss-case"> 大文字小文字区別
        </label>
      </div>
      <div class="ss-nav"><span class="ss-count" id="ss-count"></span></div>
    </div>
    <div class="ss-status" id="ss-status"></div>
    <div class="ss-results" id="ss-results"></div>
  `,
  init() {
    const MAX_PAGE_MATCHES = 2000; // 1 ページ / クリックで開いたタブの一致上限
    const MAX_TAB_MATCHES = 300;   // 全タブ集計時の 1 タブあたり上限
    const MAX_LIST_RENDER = 300;   // ポップアップに描画するスニペット上限

    const patternInput = document.getElementById('ss-pattern');
    const execBtn = document.getElementById('ss-exec');
    const scopeAllChk = document.getElementById('ss-scope-all');
    const regexChk = document.getElementById('ss-regex');
    const caseChk = document.getElementById('ss-case');
    const countEl = document.getElementById('ss-count');
    const statusEl = document.getElementById('ss-status');
    const resultsEl = document.getElementById('ss-results');
    const historyEl = document.getElementById('ss-history-list');

    const _scripting = (typeof chrome !== 'undefined' && chrome.scripting) || null;
    const _tabs = (typeof chrome !== 'undefined' && chrome.tabs) || null;
    const INJECTABLE = /^https?:\/\//i; // スクリプト注入できるのは http(s) のみ

    let scope = 'page';        // 'page' | 'all'
    let regexMode = true;
    let caseSensitive = false;
    const history = [];
    let nav = { tabId: null, count: 0, current: -1 }; // 現在の一致位置と対象タブ
    let lastResults = null;    // 開き直し時に復元する直近の結果

    // 検索本体はページ側エンジン(sitesearch-engine.js)を MAIN ワールドで実行する
    async function runOnTab(tabId, action, opts = {}) {
      if (!_scripting || !window.SiteSearchEngine) throw new Error('no-engine');
      const flags = 'g' + (caseSensitive ? '' : 'i') + 'm';
      const args = [action, opts.pattern || '', flags,
        (typeof opts.index === 'number') ? opts.index : -1, opts.maxMatches || MAX_PAGE_MATCHES];
      const res = await _scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: window.SiteSearchEngine.run, args,
      });
      return res && res[0] ? res[0].result : null;
    }

    async function getActiveTab() {
      if (!_tabs) return null;
      let list = await _tabs.query({ active: true, currentWindow: true });
      if (!list || !list.length) list = await _tabs.query({ active: true, lastFocusedWindow: true });
      return (list && list[0]) || null;
    }

    function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function regexEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function buildSource() { return regexMode ? patternInput.value : regexEscape(patternInput.value); } // 正規表現 OFF はエスケープ
    function setStatus(msg, isError) { statusEl.textContent = msg || ''; statusEl.classList.toggle('ss-status-error', !!isError); }
    function setCountDisplay() {
      if (nav.count > 0) countEl.textContent = `${nav.current + 1} / ${nav.count}`;
      else if (scope === 'page') countEl.textContent = '';
    }

    // ── 結果リストの描画 ──
    function snippetHtml(sn) { return escapeHtml(sn.before) + '<mark>' + escapeHtml(sn.match) + '</mark>' + escapeHtml(sn.after); }
    function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

    function fallbackIconNode() {
      const span = document.createElement('span');
      span.className = 'ss-group-fav ss-group-fav-fallback';
      span.textContent = '🌐';
      return span;
    }
    function tabIconNode(favUrl) { // ファビコン。取得不可・読み込み失敗時は 🌐
      if (favUrl && /^(https?:|data:)/.test(favUrl)) {
        const img = document.createElement('img');
        img.className = 'ss-group-fav'; img.alt = ''; img.src = favUrl;
        img.addEventListener('error', () => img.replaceWith(fallbackIconNode()));
        return img;
      }
      return fallbackIconNode();
    }

    function renderPageResults(res) {
      resultsEl.innerHTML = '';
      const list = (res.snippets || []).slice(0, MAX_LIST_RENDER);
      if (!list.length) return;
      const frag = document.createDocumentFragment();
      list.forEach((sn, i) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ss-item' + (i === 0 ? ' active' : '');
        item.dataset.index = String(i);
        item.innerHTML = '<span class="ss-snippet">' + snippetHtml(sn) + '</span>';
        frag.appendChild(item);
      });
      resultsEl.appendChild(frag);
      if (res.count > list.length) {
        const more = document.createElement('div');
        more.className = 'ss-more';
        more.textContent = `ほか ${res.count - list.length} 件（先頭 ${list.length} 件を表示）`;
        resultsEl.appendChild(more);
      }
      lastResults = { mode: 'page', snippets: list, count: res.count, truncated: !!res.truncated };
    }

    function renderAllResults(groups, totalCount, totalTabs) {
      resultsEl.innerHTML = '';
      countEl.textContent = totalTabs ? `合計 ${totalCount} 件 / ${totalTabs} タブ` : '';
      if (!groups.length) return;
      const frag = document.createDocumentFragment();
      groups.forEach(g => {
        const grp = document.createElement('div');
        grp.className = 'ss-group';
        // タブ見出し（クリックでそのタブへ切替）。favicon＋タイトルでサイトを識別
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'ss-group-head';
        head.dataset.tabid = String(g.tabId);
        head.dataset.index = '0';
        const titleEl = document.createElement('span');
        titleEl.className = 'ss-group-title';
        titleEl.textContent = g.title || hostOf(g.url) || '(無題)';
        const countBadge = document.createElement('span');
        countBadge.className = 'ss-group-count';
        countBadge.textContent = g.count + (g.truncated ? '+' : '') + ' 件';
        head.append(tabIconNode(g.favIconUrl), titleEl, countBadge);
        grp.appendChild(head);
        (g.snippets || []).slice(0, MAX_LIST_RENDER).forEach((sn, i) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'ss-item';
          item.dataset.tabid = String(g.tabId);
          item.dataset.index = String(i);
          item.innerHTML = '<span class="ss-snippet">' + snippetHtml(sn) + '</span>';
          grp.appendChild(item);
        });
        frag.appendChild(grp);
      });
      resultsEl.appendChild(frag);
      // 永続化用のスニペットはタブごと 50 件までに絞る
      lastResults = {
        mode: 'all', total: totalCount, tabs: totalTabs,
        groups: groups.map(g => ({
          tabId: g.tabId, title: g.title, url: g.url, favIconUrl: g.favIconUrl,
          count: g.count, truncated: g.truncated, snippets: (g.snippets || []).slice(0, 50),
        })),
      };
    }

    function markActive(idx) {
      resultsEl.querySelectorAll('.ss-item.active').forEach(el => el.classList.remove('active'));
      const el = resultsEl.querySelector(`.ss-item[data-index="${idx}"]:not([data-tabid])`);
      if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
    }

    // ── 検索実行（Enter / ボタン） ──
    async function doSearch() {
      const pattern = patternInput.value;
      if (!pattern) { // 空検索：結果とハイライトをクリア
        resultsEl.innerHTML = ''; countEl.textContent = ''; setStatus('');
        nav = { tabId: null, count: 0, current: -1 }; lastResults = null; save();
        const t = await getActiveTab().catch(() => null);
        if (t && INJECTABLE.test(t.url || '')) runOnTab(t.id, 'clear').catch(() => {});
        return;
      }
      const source = buildSource();
      try { new RegExp(source, 'g'); }
      catch (e) { setStatus('⚠ 不正な正規表現: ' + e.message, true); resultsEl.innerHTML = ''; countEl.textContent = ''; return; }
      addHistory(pattern); // 履歴は入力そのもの（生の文字列）
      setStatus('検索中...');
      if (scope === 'page') await searchPage(source);
      else await searchAllTabs(source);
      save();
    }

    async function searchPage(source) {
      lastResults = null;
      const tab = await getActiveTab().catch(() => null);
      if (!tab || !INJECTABLE.test(tab.url || '')) {
        setStatus('このページでは検索できません（chrome:// や拡張機能ページ・PDF などは対象外）', true);
        resultsEl.innerHTML = ''; countEl.textContent = ''; return;
      }
      let res;
      try { res = await runOnTab(tab.id, 'search', { pattern: source, maxMatches: MAX_PAGE_MATCHES }); }
      catch (e) { setStatus('このページでは検索できません（' + (e.message || e) + '）', true); resultsEl.innerHTML = ''; countEl.textContent = ''; return; }
      if (!res || !res.ok) { setStatus('検索に失敗しました', true); return; }
      nav = { tabId: tab.id, count: res.count, current: res.current };
      if (!res.count) { setStatus('一致なし'); resultsEl.innerHTML = ''; countEl.textContent = '0 件'; return; }
      const notes = [];
      if (res.truncated) notes.push(`上限（${MAX_PAGE_MATCHES} 件）に達したため打ち切り`);
      if (res.unsupported) notes.push('全件ハイライト非対応のため現在位置のみ枠表示');
      setStatus(notes.join(' / '));
      renderPageResults(res);
      setCountDisplay();
    }

    async function searchAllTabs(source) {
      lastResults = null;
      if (!_tabs) { setStatus('全タブ検索を利用できません', true); return; }
      const tabs = (await _tabs.query({}).catch(() => [])).filter(t => INJECTABLE.test(t.url || ''));
      if (!tabs.length) { setStatus('検索できるタブがありません', true); resultsEl.innerHTML = ''; countEl.textContent = ''; return; }
      const settled = await Promise.allSettled(
        tabs.map(t => runOnTab(t.id, 'count', { pattern: source, maxMatches: MAX_TAB_MATCHES }).then(res => ({ tab: t, res })))
      );
      const groups = []; let total = 0;
      settled.forEach(s => { // 注入不可タブ等はスキップ
        if (s.status !== 'fulfilled' || !s.value.res || !s.value.res.ok || !s.value.res.count) return;
        const { tab, res } = s.value;
        total += res.count;
        groups.push({ tabId: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, count: res.count, truncated: res.truncated, snippets: res.snippets });
      });
      groups.sort((a, b) => b.count - a.count);
      nav = { tabId: null, count: 0, current: -1 };
      if (!groups.length) { setStatus('一致なし'); resultsEl.innerHTML = ''; countEl.textContent = '0 件'; return; }
      setStatus('項目をクリックするとそのタブを開いてハイライトします');
      renderAllResults(groups, total, groups.length);
    }

    // ── 結果クリックでジャンプ ──
    async function gotoPage(idx) {
      if (!nav.tabId) return;
      let res;
      try { res = await runOnTab(nav.tabId, 'goto', { index: idx }); } catch (e) { return; }
      if (!res || res.current < 0) return;
      nav.current = res.current; nav.count = res.count;
      setCountDisplay(); markActive(nav.current);
    }

    async function gotoAllTab(tabId, idx) {
      let res;
      try { res = await runOnTab(tabId, 'search', { pattern: buildSource(), index: idx, maxMatches: MAX_PAGE_MATCHES }); }
      catch (e) { setStatus('このタブを開けませんでした', true); return; }
      if (!res || !res.ok) return;
      nav = { tabId, count: res.count, current: res.current };
      setCountDisplay();
      try { // 対象タブを前面に（別ウィンドウだとポップアップは閉じるがハイライトは残る）
        const t = await _tabs.update(tabId, { active: true });
        if (t && t.windowId != null && chrome.windows) chrome.windows.update(t.windowId, { focused: true });
      } catch (e) { /* 切替失敗でもハイライトは適用済み */ }
    }

    // ── ページ常駐バーを表示（UI は sitesearch-bar.js、検索本体はエンジン共有） ──
    async function openBar() {
      const engine = window.SiteSearchEngine && window.SiteSearchEngine.run;
      const bar = window.SiteSearchBar && window.SiteSearchBar.install;
      if (!_scripting || !engine || !bar) { setStatus('検索バーを表示できません', true); return; }
      const tab = await getActiveTab().catch(() => null);
      if (!tab || !INJECTABLE.test(tab.url || '')) {
        setStatus('このページには検索バーを表示できません（chrome:// や拡張機能ページ・PDF などは対象外）', true); return;
      }
      try {
        await _scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: engine, args: ['ensure'] });
        await _scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: bar, args: [patternInput.value || '', regexMode, caseSensitive] });
        setStatus('📌 ページに検索バーを表示しました。ポップアップを閉じても使えます');
      } catch (e) { setStatus('検索バーを表示できませんでした（' + (e.message || e) + '）', true); }
    }

    // ── 検索ワード履歴（最大 20 件・datalist 補完） ──
    function addHistory(q) {
      const i = history.indexOf(q);
      if (i !== -1) history.splice(i, 1);
      history.unshift(q);
      if (history.length > 20) history.length = 20;
      renderHistory(); save();
    }
    function renderHistory() {
      historyEl.innerHTML = '';
      history.forEach(q => { const o = document.createElement('option'); o.value = q; historyEl.appendChild(o); });
    }

    // ── 永続化 ──
    function save() {
      Toolkit.saveState('sitesearch', { pattern: patternInput.value, scope, regexMode, caseSensitive, history, nav, results: lastResults });
    }
    function setScope(next) {
      scope = next;
      scopeAllChk.checked = (scope === 'all');
      resultsEl.innerHTML = ''; countEl.textContent = ''; setStatus('');
      nav = { tabId: null, count: 0, current: -1 }; lastResults = null; save();
    }

    // ── イベント ──
    execBtn.addEventListener('click', doSearch);
    patternInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    patternInput.addEventListener('input', save);
    regexChk.addEventListener('change', () => { regexMode = regexChk.checked; save(); });
    caseChk.addEventListener('change', () => { caseSensitive = caseChk.checked; save(); });
    scopeAllChk.addEventListener('change', () => setScope(scopeAllChk.checked ? 'all' : 'page'));
    document.getElementById('ss-openbar').addEventListener('click', openBar);
    resultsEl.addEventListener('click', e => {
      const item = e.target.closest('.ss-item, .ss-group-head');
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10) || 0;
      if (item.dataset.tabid) gotoAllTab(parseInt(item.dataset.tabid, 10), idx);
      else gotoPage(idx);
    });

    // ── 復元（非同期。自動検索はしない。ページ側の状態が残っていればクリックも動く） ──
    Toolkit.loadState('sitesearch', s => {
      if (!s) return;
      if (typeof s.pattern === 'string') patternInput.value = s.pattern;
      if (s.scope === 'all' || s.scope === 'page') { scope = s.scope; scopeAllChk.checked = (scope === 'all'); }
      if (typeof s.regexMode === 'boolean') { regexMode = s.regexMode; regexChk.checked = regexMode; }
      if (typeof s.caseSensitive === 'boolean') { caseSensitive = s.caseSensitive; caseChk.checked = caseSensitive; }
      if (Array.isArray(s.history)) { history.push(...s.history.slice(0, 20)); renderHistory(); }
      if (s.nav && typeof s.nav === 'object') {
        nav = { tabId: (s.nav.tabId != null) ? s.nav.tabId : null, count: s.nav.count || 0, current: (typeof s.nav.current === 'number') ? s.nav.current : -1 };
      }
      if (s.results && s.results.mode === 'page') {
        renderPageResults({ snippets: s.results.snippets || [], count: s.results.count || 0, truncated: !!s.results.truncated });
        setCountDisplay();
        if (nav.count > 0 && nav.current >= 0) markActive(nav.current);
      } else if (s.results && s.results.mode === 'all') {
        renderAllResults(s.results.groups || [], s.results.total || 0, s.results.tabs || 0);
        setCountDisplay();
      }
    });
  },
});
