'use strict';

Object.assign(App, {

  renderContentTypes() {
    const usage = {};
    for (const b of S.bins) if (b.content_type) usage[b.content_type] = (usage[b.content_type] || 0) + 1;

    return `
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold">Content Types
          <span class="ml-2 text-sm font-normal text-gray-400">${S.contentTypes.length} tags</span>
        </h2>
        <button onclick="App.showAddContentType()"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Content Type
        </button>
      </div>
      <p class="text-xs text-gray-400 mb-4">
        These tags populate the <em>Content Type</em> dropdown in the bin form. Renaming a tag also updates every bin that already uses it.
      </p>
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-100">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">In use</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${S.contentTypes.length ? S.contentTypes.map(ct => `
                <tr class="hover:bg-slate-50 group">
                  <td class="px-4 py-3 font-medium text-gray-900">${esc(ct.name)}</td>
                  <td class="px-4 py-3 text-xs text-gray-500">${usage[ct.name] || 0} bin${(usage[ct.name] || 0) !== 1 ? 's' : ''}</td>
                  <td class="px-4 py-3">
                    <div class="flex gap-0.5 opacity-60 group-hover:opacity-100">
                      <button onclick="App.showEditContentType(${ct.id})" class="p-1.5 rounded hover:bg-green-50 hover:text-green-600">✏️</button>
                      <button onclick="App.deleteContentType(${ct.id})" class="p-1.5 rounded hover:bg-red-50 hover:text-red-600">🗑️</button>
                    </div>
                  </td>
                </tr>`).join('') : `
                <tr><td colspan="3" class="px-4 py-12 text-center text-gray-400">No content types yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  _ctForm(ct = {}) {
    return `
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Name</label>
        <input id="f-ctname" value="${esc(ct.name || '')}" placeholder="e.g. Bolt"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
        <button onclick="App.closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onclick="App.saveContentType(${ct.id || ''})" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Save</button>
      </div>`;
  },

  showAddContentType()    { this.openModal('Add Content Type', this._ctForm()); },
  showEditContentType(id) { this.openModal('Edit Content Type', this._ctForm(S.contentTypes.find(c => c.id === id))); },

  async saveContentType(id) {
    const name = $('f-ctname').value.trim();
    if (!name) { alert('Name is required.'); return; }
    try {
      if (id) await api.put('/content-types/' + id, { name });
      else    await api.post('/content-types', { name });
      // Reload bins too because rename cascades to bin rows.
      await Promise.all([this.loadContentTypes(), this.loadBins()]);
      this.closeModal();
      this.render();
      toast(id ? 'Content type updated ✓' : 'Content type created ✓');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async deleteContentType(id) {
    const ct = S.contentTypes.find(c => c.id === id);
    const inUse = S.bins.filter(b => b.content_type === ct.name).length;
    const msg = inUse
      ? `Delete "${ct.name}"?\n${inUse} bin(s) currently use this tag — they will keep their value but the tag won't appear in the dropdown any more.`
      : `Delete "${ct.name}"?`;
    if (!confirm(msg)) return;
    try {
      await api.delete('/content-types/' + id);
      await this.loadContentTypes();
      this.render();
      toast('Content type deleted');
    } catch (e) { alert('Error: ' + e.message); }
  },
});
