'use strict';

Object.assign(App, {

  renderBoxTypes() {
    return `
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold">Box Types
          <span class="ml-2 text-sm font-normal text-gray-400">${S.boxTypes.length} types</span>
        </h2>
        <button onclick="App.showAddBoxType()"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Box Type
        </button>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-100">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Footprint</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Height</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Divided</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${S.boxTypes.length ? S.boxTypes.map(bt => `
                <tr class="hover:bg-slate-50 group">
                  <td class="px-4 py-3 font-semibold text-gray-900">${esc(bt.name)}</td>
                  <td class="px-4 py-3 font-mono text-gray-600">${bt.grid_width}×${bt.grid_length}</td>
                  <td class="px-4 py-3 text-gray-600">${bt.grid_height_u}U</td>
                  <td class="px-4 py-3">
                    ${bt.is_divided
                      ? `<span class="text-green-600 font-medium">✓ ${bt.compartments} comp.</span>`
                      : `<span class="text-gray-300">—</span>`}
                  </td>
                  <td class="px-4 py-3 text-gray-400 text-xs">${esc(bt.description || '—')}</td>
                  <td class="px-4 py-3">
                    <div class="flex gap-0.5 opacity-60 group-hover:opacity-100">
                      <button onclick="App.showEditBoxType(${bt.id})" class="p-1.5 rounded hover:bg-green-50 hover:text-green-600">✏️</button>
                      <button onclick="App.deleteBoxType(${bt.id})" class="p-1.5 rounded hover:bg-red-50 hover:text-red-600">🗑️</button>
                    </div>
                  </td>
                </tr>`).join('') : `
                <tr><td colspan="6" class="px-4 py-12 text-center text-gray-400">No box types yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  _btForm(bt = {}) {
    return `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Name</label>
          <input id="f-name" value="${esc(bt.name || '')}" placeholder="e.g. 1×2×3"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Width (X)</label>
            <input id="f-gw" type="number" value="${bt.grid_width || 1}" min="1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Length (Y)</label>
            <input id="f-gl" type="number" value="${bt.grid_length || 1}" min="1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Height (U)</label>
            <input id="f-gh" type="number" value="${bt.grid_height_u || 3}" min="1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <div class="flex items-center gap-6 bg-slate-50 rounded-lg p-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="f-div" type="checkbox" ${bt.is_divided ? 'checked' : ''} class="w-4 h-4 rounded text-blue-600">
            <span class="text-sm font-medium text-gray-700">Divided bin</span>
          </label>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600" for="f-comp">Compartments:</label>
            <input id="f-comp" type="number" value="${bt.compartments || 1}" min="1" max="20"
              class="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description</label>
          <textarea id="f-desc" rows="2" placeholder="Optional description"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">${esc(bt.description || '')}</textarea>
        </div>
      </div>
      <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
        <button onclick="App.closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onclick="App.saveBoxType(${bt.id || ''})" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Save</button>
      </div>`;
  },

  showAddBoxType()    { this.openModal('Add Box Type', this._btForm()); },
  showEditBoxType(id) { this.openModal('Edit Box Type', this._btForm(S.boxTypes.find(b => b.id === id))); },

  async saveBoxType(id) {
    const data = {
      name:          $('f-name').value.trim(),
      grid_width:    parseInt($('f-gw').value),
      grid_length:   parseInt($('f-gl').value),
      grid_height_u: parseInt($('f-gh').value),
      is_divided:    $('f-div').checked,
      compartments:  parseInt($('f-comp').value),
      description:   $('f-desc').value.trim(),
    };
    if (!data.name) { alert('Name is required.'); return; }
    try {
      if (id) await api.put('/box-types/' + id, data);
      else    await api.post('/box-types', data);
      await this.loadBoxTypes();
      this.closeModal();
      this.render();
      toast(id ? 'Box type updated ✓' : 'Box type created ✓');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async deleteBoxType(id) {
    if (!confirm('Delete this box type?')) return;
    try {
      await api.delete('/box-types/' + id);
      await this.loadBoxTypes();
      this.render();
      toast('Box type deleted');
    } catch (e) { alert('Error: ' + e.message); }
  },
});
