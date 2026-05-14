'use strict';

Object.assign(App, {

  renderSearch() {
    return `
      <div class="max-w-2xl mx-auto mb-6">
        <div class="relative">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
          <input id="search-inp" type="search" placeholder="Search type, attribute, location, notes…"
            value="${esc(S.searchQ)}"
            oninput="App.handleSearch(this.value)"
            class="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-white">
        </div>
      </div>

      ${S.searchQ ? `
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
            ${S.searchResults.length} result${S.searchResults.length !== 1 ? 's' : ''} for <strong>"${esc(S.searchQ)}"</strong>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Attribute</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Box</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                ${S.searchResults.length ? S.searchResults.map(b => `
                  <tr class="hover:bg-slate-50 group">
                    <td class="px-4 py-2.5 font-mono font-bold text-blue-600">#${b.id}</td>
                    <td class="px-4 py-2.5 text-xs text-gray-500">
                      ${b.cabinet_id ? `${esc(b.cabinet_id)} / ${esc(b.drawer_id)}` : '—'}
                    </td>
                    <td class="px-4 py-2.5">
                      ${b.content_type ? `<span class="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs">${esc(b.content_type)}</span>` : '—'}
                    </td>
                    <td class="px-4 py-2.5 font-medium">${esc(b.attribute || '—')}</td>
                    <td class="px-4 py-2.5 text-xs text-gray-500">${esc(b.box_type_name || '—')}</td>
                    <td class="px-4 py-2.5">
                      <div class="flex gap-0.5 opacity-60 group-hover:opacity-100">
                        <button onclick="App.showQr(${b.id})" class="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600" title="QR">📱</button>
                        <button onclick="App.showEditBin(${b.id})" class="p-1.5 rounded hover:bg-green-50 hover:text-green-600" title="Edit">✏️</button>
                      </div>
                    </td>
                  </tr>`).join('') : `
                  <tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">No results found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>` : `
        <div class="text-center py-20 text-gray-400">
          <div class="text-6xl mb-4">🔍</div>
          <p class="text-lg font-medium mb-1">Find your bins fast</p>
          <p class="text-sm">Search by content type, attribute, cabinet, or notes</p>
        </div>`}`;
  },

  _searchTimer: null,
  async handleSearch(q) {
    S.searchQ = q;
    clearTimeout(this._searchTimer);
    if (!q.trim()) { S.searchResults = []; this.render(); return; }
    this._searchTimer = setTimeout(async () => {
      S.searchResults = await api.get('/bins/search?q=' + encodeURIComponent(q));
      this.render();
      // restore focus
      const inp = $('search-inp');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 280);
  },
});
