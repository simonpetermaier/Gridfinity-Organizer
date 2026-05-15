'use strict';

Object.assign(App, {

  renderSearch() {
    const q = S.searchQ || '';
    return `
      <div class="palette-wrap">
        <div class="palette">
          <div class="palette-input-row">
            <span style="color:var(--accent); display:inline-flex;">${icon('search', 18)}</span>
            <input id="search-inp" class="palette-input" type="search"
              placeholder="Search bins, drawers, or types…"
              value="${esc(q)}"
              oninput="App.handleSearch(this.value)">
            <span class="kbd">/</span>
          </div>
          <div class="palette-body">${this._renderResults()}</div>
          <div class="palette-footer">
            <span class="kbd">↑↓</span><span>navigate</span>
            <span class="kbd">↵</span><span>open</span>
            <span style="flex:1"></span>
            <span>${q ? S.searchResults.length + ' result' + (S.searchResults.length !== 1 ? 's' : '') : 'type to search'}</span>
          </div>
        </div>
      </div>`;
  },

  _renderResults() {
    if (!S.searchQ) return `<div class="palette-empty">Search by content type, attribute, cabinet, drawer, or notes.</div>`;
    if (!S.searchResults.length) return `<div class="palette-empty">No results for <strong>"${esc(S.searchQ)}"</strong>.</div>`;

    // Highlight the query in result strings.
    const mark = (s) => {
      const str = String(s ?? '');
      if (!str) return '';
      const i = str.toLowerCase().indexOf(S.searchQ.toLowerCase());
      if (i < 0) return esc(str);
      return esc(str.slice(0, i)) + '<mark>' + esc(str.slice(i, i + S.searchQ.length)) + '</mark>' + esc(str.slice(i + S.searchQ.length));
    };

    // Group: bins are the only result type the backend returns today.
    return `
      <div class="palette-group">
        <div class="palette-group-head">Bins · ${S.searchResults.length}</div>
        ${S.searchResults.map(b => `
          <div class="palette-result" onclick="App.switchTab('inventory');S.selectedBinId=${b.id};App.render();">
            <span class="bin-id mono">#${b.id}</span>
            <div style="flex:1; min-width:0;">
              <div class="title">${mark(b.attribute || b.content_type || '—')}</div>
              <div class="sub">${esc(b.content_type || '—')} · ${esc(b.cabinet_id || '—')} / ${esc(b.drawer_id || '—')}${b.grid_x != null ? ' · (' + b.grid_x + ',' + b.grid_y + ')' : ''}</div>
            </div>
            ${b.content_type ? `<span class="pill accent ${hueClass(b.content_type)}">${esc(b.content_type)}</span>` : ''}
            <span class="kbd">↵</span>
          </div>`).join('')}
      </div>`;
  },

  _searchTimer: null,
  async handleSearch(q) {
    S.searchQ = q;
    clearTimeout(this._searchTimer);
    if (!q.trim()) { S.searchResults = []; this.render(); this._restoreFocus(q.length); return; }
    this._searchTimer = setTimeout(async () => {
      S.searchResults = await api.get('/bins/search?q=' + encodeURIComponent(q));
      this.render();
      this._restoreFocus(q.length);
    }, 280);
  },

  _restoreFocus(caret) {
    const inp = $('search-inp');
    if (inp) { inp.focus(); inp.setSelectionRange(caret, caret); }
  },
});
