'use strict';

Object.assign(App, {

  renderLocations() {
    return `
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold">Drawers & Cabinets
          <span class="ml-2 text-sm font-normal text-gray-400">${S.locations.length} entries</span>
        </h2>
        <button onclick="App.showAddLocation()"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Drawer
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${S.locations.length ? S.locations.map(loc => {
          const binCount = S.bins.filter(b => b.location_id === loc.id).length;
          return `
          <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start mb-3">
              <div>
                <div class="font-bold text-gray-900">${esc(loc.cabinet_id)}</div>
                <div class="text-sm text-blue-600 font-medium">${esc(loc.drawer_id)}</div>
              </div>
              <div class="flex gap-0.5">
                <button onclick="App.showDrawerMap(${loc.id})" title="View grid map"
                  class="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600 text-gray-400">🗺️</button>
                <button onclick="App.showEditLocation(${loc.id})" title="Edit"
                  class="p-1.5 rounded hover:bg-green-50 hover:text-green-600 text-gray-400">✏️</button>
                <button onclick="App.deleteLocation(${loc.id})" title="Delete"
                  class="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-gray-400">🗑️</button>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-xs mb-3">
              <div class="bg-slate-50 rounded-lg py-2">
                <div class="font-bold text-gray-800 text-sm">${loc.grid_columns}×${loc.grid_rows}</div>
                <div class="text-gray-400">Grid</div>
              </div>
              <div class="bg-slate-50 rounded-lg py-2">
                <div class="font-bold text-gray-800 text-sm">${loc.vertical_space_u}U</div>
                <div class="text-gray-400">Height</div>
              </div>
              <div class="bg-slate-50 rounded-lg py-2">
                <div class="font-bold text-gray-800 text-sm">${binCount}</div>
                <div class="text-gray-400">Bins</div>
              </div>
            </div>
            ${loc.attributes ? `<div class="text-xs text-gray-400 italic">${esc(loc.attributes)}</div>` : ''}
          </div>`;
        }).join('') : `
          <div class="col-span-3 py-16 text-center text-gray-400">
            <div class="text-5xl mb-3">🗄️</div>
            No drawers yet. Add your first drawer!
          </div>`}
      </div>`;
  },

  _locForm(loc = {}) {
    return `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Cabinet ID</label>
            <input id="f-cab" value="${esc(loc.cabinet_id || '')}" placeholder="Cabinet A"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Drawer ID</label>
            <input id="f-drw" value="${esc(loc.drawer_id || '')}" placeholder="Drawer 1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Columns</label>
            <input id="f-cols" type="number" value="${loc.grid_columns || 5}" min="1" max="30"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Rows</label>
            <input id="f-rows" type="number" value="${loc.grid_rows || 5}" min="1" max="20"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Max Height (U)</label>
            <input id="f-vsp" type="number" value="${loc.vertical_space_u || 6}" min="1" max="50"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description / Notes</label>
          <input id="f-attr" value="${esc(loc.attributes || '')}" placeholder="e.g. Bolts & Screws"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>
      <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
        <button onclick="App.closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onclick="App.saveLocation(${loc.id || ''})" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Save</button>
      </div>`;
  },

  showAddLocation()    { this.openModal('Add Drawer', this._locForm()); },
  showEditLocation(id) { this.openModal('Edit Drawer', this._locForm(S.locations.find(l => l.id === id))); },

  async saveLocation(id) {
    const data = {
      cabinet_id:       $('f-cab').value.trim(),
      drawer_id:        $('f-drw').value.trim(),
      grid_columns:     parseInt($('f-cols').value),
      grid_rows:        parseInt($('f-rows').value),
      vertical_space_u: parseInt($('f-vsp').value),
      attributes:       $('f-attr').value.trim(),
    };
    if (!data.cabinet_id || !data.drawer_id) { alert('Cabinet ID and Drawer ID are required.'); return; }
    try {
      if (id) await api.put('/locations/' + id, data);
      else    await api.post('/locations', data);
      await this.loadLocations();
      this.closeModal();
      this.render();
      toast(id ? 'Drawer updated ✓' : 'Drawer created ✓');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async deleteLocation(id) {
    const loc = S.locations.find(l => l.id === id);
    const count = S.bins.filter(b => b.location_id === id).length;
    if (!confirm(`Delete "${loc.cabinet_id} / ${loc.drawer_id}"?\n${count} bin(s) will lose their location.`)) return;
    await api.delete('/locations/' + id);
    await this.loadLocations();
    await this.loadBins();
    this.render();
    toast('Drawer deleted');
  },
});
