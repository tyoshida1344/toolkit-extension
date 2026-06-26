/**
 * results.js — サイト内検索の結果リスト描画（ポップアップ専用・非注入）
 */
window.SiteSearchResults = (() => {
  function snippetHtml(sn) { const esc = Toolkit.escapeHtml; return esc(sn.before) + '<mark>' + esc(sn.match) + '</mark>' + esc(sn.after); }
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
  function item(sn, i, tabId) { // 結果1件のボタン。クリックでそのタブへジャンプ
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ss-item';
    el.dataset.index = String(i);
    el.dataset.tabid = String(tabId);
    el.innerHTML = '<span class="ss-snippet">' + snippetHtml(sn) + '</span>';
    return el;
  }

  function render(container, countEl, groups, total, maxRender) {
    container.innerHTML = '';
    const tabs = groups.length;
    countEl.textContent = !tabs ? '' : tabs === 1 ? `${total} 件` : `合計 ${total} 件 / ${tabs} タブ`;
    if (!tabs) return null;
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
      total,
      groups: groups.map(g => ({
        tabId: g.tabId, title: g.title, url: g.url, favIconUrl: g.favIconUrl,
        count: g.count, truncated: g.truncated, snippets: (g.snippets || []).slice(0, 50),
      })),
    };
  }

  return { render };
})();
