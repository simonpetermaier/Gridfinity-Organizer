'use strict';

Object.assign(App, {

  renderInventory() {
    const filtered = this.filteredBins();
    return `
      <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 class="text-lg font-semibold">Inventory
          <span class="ml-2 text-sm font-normal text-gray-400">${filtered.length} / ${S.bins.length} bins</span>
        </h2>
        <button onclick="App.showAddBin()"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
          <span class="text-lg leading-none">+</span> Add Bin
        </button>
      </div>

      <div class="flex flex-wrap gap-2 mb-4">
        <select onchange="S.locFilter=this.value;App.render()"
          class="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700">
          <option value="" ${!S.locFilter ? 'selected' : ''}>All Locations</option>
          ${S.locations.map(l => `<option value="${l.id}" ${S.locFilter == l.id ? 'selected' : ''}>${esc(l.cabinet_id)} / ${esc(l.drawer_id)}</option>`).join('')}
        </select>
        <select onchange="S.typeFilter=this.value;App.render()"
          class="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700">
          <option value="" ${!S.typeFilter ? 'selected' : ''}>All Types</option>
          ${[...new Set(S.bins.map(b => b.content_type).filter(Boolean))].sort().map(t => `<option value="${esc(t)}" ${S.typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
        ${S.locFilter || S.typeFilter ? `<button onclick="S.locFilter='';S.typeFilter='';App.render()" class="text-xs text-blue-600 hover:underline px-2">Clear filters</button>` : ''}
      </div>

      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-100">
              <tr>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">ID</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pos</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Box Type</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Attribute</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">H</th>
                <th class="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${filtered.length ? filtered.map(b => `
                <tr class="hover:bg-slate-50 transition-colors group">
                  <td class="px-3 py-2.5">
                    <span class="font-mono font-bold text-blue-600 text-sm">#${b.id}</span>
                  </td>
                  <td class="px-3 py-2.5 text-gray-600 text-xs">
                    ${b.cabinet_id ? `<div class="font-medium text-gray-800">${esc(b.cabinet_id)}</div><div class="text-gray-400">${esc(b.drawer_id)}</div>` : '<span class="text-gray-300">—</span>'}
                  </td>
                  <td class="px-3 py-2.5 font-mono text-xs text-gray-400">
                    ${b.grid_x != null ? `(${b.grid_x},${b.grid_y})` : '—'}
                  </td>
                  <td class="px-3 py-2.5 text-xs text-gray-500">${esc(b.box_type_name || '—')}</td>
                  <td class="px-3 py-2.5">
                    ${b.content_type ? `<span class="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">${esc(b.content_type)}</span>` : '<span class="text-gray-300 text-xs">—</span>'}
                  </td>
                  <td class="px-3 py-2.5 font-medium text-gray-800">${esc(b.attribute || '—')}</td>
                  <td class="px-3 py-2.5 text-xs text-gray-400">${b.height_u}U</td>
                  <td class="px-3 py-2.5">
                    <div class="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onclick="App.showQr(${b.id})" title="QR Code" class="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600">📱</button>
                      <button onclick="App.showEditBin(${b.id})" title="Edit" class="p-1.5 rounded hover:bg-green-50 hover:text-green-600">✏️</button>
                      <button onclick="App.deleteBin(${b.id})" title="Remove" class="p-1.5 rounded hover:bg-red-50 hover:text-red-600">🗑️</button>
                    </div>
                  </td>
                </tr>`).join('') : `
                <tr><td colspan="8" class="px-4 py-12 text-center text-gray-400">
                  No bins match the current filters.
                </td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  filteredBins() {
    let bins = S.bins;
    if (S.locFilter)  bins = bins.filter(b => String(b.location_id) === String(S.locFilter));
    if (S.typeFilter) bins = bins.filter(b => b.content_type === S.typeFilter);
    return bins;
  },
});
