Toolkit.registerTab({
  html: `
    <div class="tm-row tm-inline">
      <input type="text" class="tm-input" id="ss-pattern" list="ss-history-list"
        spellcheck="false" autocomplete="off" autocapitalize="off">
      <button class="tm-btn tm-btn-primary" id="ss-exec">検索</button>
      ${Toolkit.iconButton('📌', { id: 'ss-openbar', title: 'ページに検索バーを表示' })}
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
    const View = window.SiteSearchResults; // 結果リストの描画（results.js）

    const patternInput = Toolkit.$('ss-pattern'), execBtn = Toolkit.$('ss-exec'), scopeAllChk = Toolkit.$('ss-scope-all');
    const regexChk = Toolkit.$('ss-regex'), caseChk = Toolkit.$('ss-case'), countEl = Toolkit.$('ss-count');
    const statusEl = Toolkit.$('ss-status'), resultsEl = Toolkit.$('ss-results'), historyEl = Toolkit.$('ss-history-list');

    const _scripting = (typeof chrome !== 'undefined' && chrome.scripting) || null;
    const _tabs = (typeof chrome !== 'undefined' && chrome.tabs) || null;
    const INJECTABLE = /^https?:\/\//i; // スクリプト注入できるのは http(s) のみ

    let scope = 'page';        // 'page' | 'all'
    let regexMode = true;
    let caseSensitive = false;
    const history = [];
    let nav = { tabId: null, count: 0, current: -1 }; // 現在の一致位置と対象タブ
    let lastResults = null;    // 開き直し時に復元する直近の結果

    // 検索本体はページ側エンジン(engine.js)を MAIN ワールドで実行（pattern/flags の組み立てもエンジン側）
    async function runOnTab(tabId, action, opts = {}) {
      if (!_scripting || !window.SiteSearchEngine) throw new Error('no-engine');
      const o = { regexMode, caseSensitive, max: opts.max || MAX_PAGE_MATCHES, startIdx: opts.startIdx || 0 };
      const res = await _scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: window.SiteSearchEngine.run, args: [action, opts.query || '', o],
      });
      return res && res[0] ? res[0].result : null;
    }

    async function getActiveTab() {
      if (!_tabs) return null;
      let list = await _tabs.query({ active: true, currentWindow: true });
      if (!list || !list.length) list = await _tabs.query({ active: true, lastFocusedWindow: true });
      return (list && list[0]) || null;
    }
    // アクティブな http(s) タブを返す。注入できないページなら状態にエラーを出して null
    async function activeInjectableTab() {
      const tab = await getActiveTab().catch(() => null);
      if (tab && INJECTABLE.test(tab.url || '')) return tab;
      setStatus('このページでは実行できません（chrome:// や拡張機能ページ・PDF などは対象外）', true);
      return null;
    }

    const blankNav = () => ({ tabId: null, count: 0, current: -1 });
    function clearResults() { resultsEl.innerHTML = ''; countEl.textContent = ''; }
    function setStatus(msg, isError) { statusEl.textContent = msg || ''; statusEl.classList.toggle('ss-status-error', !!isError); }
    function setCountDisplay() {
      if (nav.count > 0) countEl.textContent = `${nav.current + 1} / ${nav.count}`;
      else if (scope === 'page') countEl.textContent = '';
    }

    // ── 検索実行（Enter / ボタン） ──
    async function doSearch() {
      const query = patternInput.value;
      if (!query) { // 空検索：結果とハイライトをクリア
        clearResults(); setStatus(''); nav = blankNav(); lastResults = null; save();
        const t = await getActiveTab().catch(() => null);
        if (t && INJECTABLE.test(t.url || '')) runOnTab(t.id, 'clear').catch(() => {});
        return;
      }
      // 正規表現モードのときだけ事前検証（OFF はエスケープされるので常に有効）
      if (regexMode) {
        const { error } = Toolkit.tryRegex(query, 'g');
        if (error) { setStatus('⚠ 不正な正規表現: ' + error, true); clearResults(); return; }
      }
      addHistory(query);
      setStatus('');
      if (scope === 'page') await searchPage(query);
      else await searchAllTabs(query);
      save();
    }

    async function searchPage(query) {
      lastResults = null;
      const tab = await activeInjectableTab();
      if (!tab) { clearResults(); return; }
      let res;
      try { res = await runOnTab(tab.id, 'search', { query, max: MAX_PAGE_MATCHES }); }
      catch (e) { setStatus('このページでは検索できません（' + (e.message || e) + '）', true); clearResults(); return; }
      if (!res || !res.ok) { setStatus('検索に失敗しました', true); return; }
      nav = { tabId: tab.id, count: res.count, current: res.current };
      if (!res.count) { setStatus('一致なし'); clearResults(); countEl.textContent = '0 件'; return; }
      const notes = [];
      if (res.truncated) notes.push(`上限（${MAX_PAGE_MATCHES} 件）に達したため打ち切り`);
      if (res.unsupported) notes.push('この環境はハイライト非対応（一覧・移動は可）');
      setStatus(notes.join(' / '));
      // 描画はタブ別グループ単位。ページの結果はタブ1つ分のグループに包んで渡す
      const groups = [{ tabId: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, count: res.count, truncated: res.truncated, snippets: res.snippets }];
      lastResults = View.render(resultsEl, countEl, groups, res.count, MAX_LIST_RENDER);
    }

    async function searchAllTabs(query) {
      lastResults = null;
      if (!_tabs) { setStatus('全タブ検索を利用できません', true); return; }
      const tabs = (await _tabs.query({}).catch(() => [])).filter(t => INJECTABLE.test(t.url || ''));
      if (!tabs.length) { setStatus('検索できるタブがありません', true); clearResults(); return; }
      const settled = await Promise.allSettled(
        tabs.map(t => runOnTab(t.id, 'count', { query, max: MAX_TAB_MATCHES }).then(res => ({ tab: t, res })))
      );
      const groups = []; let total = 0;
      settled.forEach(s => { // 注入不可タブ等はスキップ
        if (s.status !== 'fulfilled' || !s.value.res || !s.value.res.ok || !s.value.res.count) return;
        const { tab, res } = s.value;
        total += res.count;
        groups.push({ tabId: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, count: res.count, truncated: res.truncated, snippets: res.snippets });
      });
      groups.sort((a, b) => b.count - a.count);
      nav = blankNav();
      if (!groups.length) { setStatus('一致なし'); clearResults(); countEl.textContent = '0 件'; return; }
      lastResults = View.render(resultsEl, countEl, groups, total, MAX_LIST_RENDER);
    }

    // ── 結果クリック: 対象タブの該当位置へジャンプ（別タブなら前面に切替） ──
    async function gotoTab(tabId, idx) {
      let res;
      try { res = await runOnTab(tabId, 'search', { query: patternInput.value, startIdx: idx, max: MAX_PAGE_MATCHES }); }
      catch (e) { setStatus('このタブを開けませんでした', true); return; }
      if (!res || !res.ok) return;
      nav = { tabId, count: res.count, current: res.current };
      setCountDisplay();
      if (scope !== 'all') return; // 現在ページ検索ならタブ切替は不要
      try { // 別タブを前面に（別ウィンドウだとポップアップは閉じるがハイライトは残る）
        const t = await _tabs.update(tabId, { active: true });
        if (t && t.windowId != null && chrome.windows) chrome.windows.update(t.windowId, { focused: true });
      } catch (e) { /* 切替失敗でもハイライトは適用済み */ }
    }

    // ── ページ常駐バーを表示（UI は bar.js、検索本体はエンジン共有） ──
    async function openBar() {
      const engine = window.SiteSearchEngine && window.SiteSearchEngine.run;
      const bar = window.SiteSearchBar && window.SiteSearchBar.install;
      if (!_scripting || !engine || !bar) { setStatus('検索バーを表示できません', true); return; }
      const tab = await activeInjectableTab();
      if (!tab) return;
      try {
        await _scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: engine, args: ['ensure'] });
        await _scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: bar, args: [patternInput.value || '', regexMode, caseSensitive] });
        setStatus('📌 ページに検索バーを表示しました。ポップアップを閉じても使えます');
      } catch (e) { setStatus('検索バーを表示できませんでした（' + (e.message || e) + '）', true); }
    }

    // ── 検索ワード履歴（datalist 補完） ──
    function addHistory(q) {
      const i = history.indexOf(q);
      if (i !== -1) history.splice(i, 1);
      history.unshift(q);
      if (history.length > Toolkit.HISTORY_LIMIT) history.length = Toolkit.HISTORY_LIMIT;
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
      clearResults(); setStatus('');
      nav = blankNav(); lastResults = null; save();
    }

    // ── イベント ──
    execBtn.addEventListener('click', doSearch);
    patternInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    patternInput.addEventListener('input', save);
    regexChk.addEventListener('change', () => { regexMode = regexChk.checked; save(); });
    caseChk.addEventListener('change', () => { caseSensitive = caseChk.checked; save(); });
    scopeAllChk.addEventListener('change', () => setScope(scopeAllChk.checked ? 'all' : 'page'));
    Toolkit.$('ss-openbar').addEventListener('click', openBar);
    resultsEl.addEventListener('click', e => {
      const item = e.target.closest('.ss-item, .ss-group-head');
      if (!item) return;
      gotoTab(parseInt(item.dataset.tabid, 10), parseInt(item.dataset.index, 10) || 0);
    });

    // ── 復元（非同期。自動検索はしない。ページ側の状態が残っていればクリックも動く） ──
    Toolkit.loadState('sitesearch', s => {
      if (!s) return;
      if (typeof s.pattern === 'string') patternInput.value = s.pattern;
      if (s.scope === 'all' || s.scope === 'page') { scope = s.scope; scopeAllChk.checked = (scope === 'all'); }
      if (typeof s.regexMode === 'boolean') { regexMode = s.regexMode; regexChk.checked = regexMode; }
      if (typeof s.caseSensitive === 'boolean') { caseSensitive = s.caseSensitive; caseChk.checked = caseSensitive; }
      if (Array.isArray(s.history)) { history.push(...s.history.slice(0, Toolkit.HISTORY_LIMIT)); renderHistory(); }
      if (s.nav && typeof s.nav === 'object') nav = s.nav; // 保存形は自前なのでそのまま復元
      if (s.results && Array.isArray(s.results.groups)) {
        lastResults = View.render(resultsEl, countEl, s.results.groups, s.results.total || 0, MAX_LIST_RENDER);
      }
    });
  },
});
