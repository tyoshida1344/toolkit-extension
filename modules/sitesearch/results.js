/**
 * results.js — サイト内検索の結果リスト描画（ポップアップ専用・非注入）
 * resultsEl への描画と、永続化用ペイロード（index.js が保存する形）の生成だけを担う。
 * 描画系をここに分離して index.js（制御）を薄く保つ。window.SiteSearchResults で公開。
 */
window.SiteSearchResults = (() => {
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function snippetHtml(sn) { return escapeHtml(sn.before) + '<mark>' + escapeHtml(sn.match) + '</mark>' + escapeHtml(sn.after); }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  function fallbackIcon() {
    const span = document.createElement('span');
    span.className = 'ss-group-fav ss-group-fav-fallback';
    span.textContent = '🌐';
    return span;
  }
  function tabIcon(favUrl) { // ファビコン。取得不可・読み込み失敗時は 🌐
    if (favUrl && /^(https?:|data:)/.test(favUrl)) {
      const img = document.createElement('img');
      img.className = 'ss-group-fav'; img.alt = ''; img.src = favUrl;
      img.addEventListener('error', () => img.replaceWith(fallbackIcon()));
      return img;
    }
    return fallbackIcon();
  }
  // 結果1件のボタン。tabId 指定で全タブ用（クリックでそのタブへ）、null でページ用（先頭を active）
  function item(sn, i, tabId) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ss-item' + (tabId == null && i === 0 ? ' active' : '');
    el.dataset.index = String(i);
    if (tabId != null) el.dataset.tabid = String(tabId);
    el.innerHTML = '<span class="ss-snippet">' + snippetHtml(sn) + '</span>';
    return el;
  }

  // 現在ページの結果を描画し、永続化用ペイロードを返す（空なら null）
  function renderPage(container, res, maxRender) {
    container.innerHTML = '';
    const list = (res.snippets || []).slice(0, maxRender);
    if (!list.length) return null;
    const frag = document.createDocumentFragment();
    list.forEach((sn, i) => frag.appendChild(item(sn, i, null)));
    container.appendChild(frag);
    if (res.count > list.length) {
      const more = document.createElement('div');
      more.className = 'ss-more';
      more.textContent = `ほか ${res.count - list.length} 件（先頭 ${list.length} 件を表示）`;
      container.appendChild(more);
    }
    return { mode: 'page', snippets: list, count: res.count, truncated: !!res.truncated };
  }

  // 全タブの結果をタブ別に描画し、永続化用ペイロードを返す（空なら null）。件数表示も更新する
  function renderAll(container, countEl, groups, total, tabs, maxRender) {
    container.innerHTML = '';
    countEl.textContent = tabs ? `合計 ${total} 件 / ${tabs} タブ` : '';
    if (!groups.length) return null;
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
      const badge = document.createElement('span');
      badge.className = 'ss-group-count';
      badge.textContent = g.count + (g.truncated ? '+' : '') + ' 件';
      head.append(tabIcon(g.favIconUrl), titleEl, badge);
      grp.appendChild(head);
      (g.snippets || []).slice(0, maxRender).forEach((sn, i) => grp.appendChild(item(sn, i, g.tabId)));
      frag.appendChild(grp);
    });
    container.appendChild(frag);
    // 永続化用のスニペットはタブごと 50 件までに絞る
    return {
      mode: 'all', total, tabs,
      groups: groups.map(g => ({
        tabId: g.tabId, title: g.title, url: g.url, favIconUrl: g.favIconUrl,
        count: g.count, truncated: g.truncated, snippets: (g.snippets || []).slice(0, 50),
      })),
    };
  }

  function markActive(container, idx) {
    container.querySelectorAll('.ss-item.active').forEach(el => el.classList.remove('active'));
    const el = container.querySelector(`.ss-item[data-index="${idx}"]:not([data-tabid])`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
  }

  return { renderPage, renderAll, markActive };
})();
