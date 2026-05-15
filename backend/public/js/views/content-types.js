'use strict';

Object.assign(App, {

  renderContentTypes() {
    const usage = {};
    for (const b of S.bins) if (b.content_type) usage[b.content_type] = (usage[b.content_type] || 0) + 1;
    const inUseCount = S.contentTypes.filter(ct => usage[ct.name]).length;
    const maxUsage = Math.max(1, ...Object.values(usage));
    const filterAll = !S.ctFilter || S.ctFilter === 'all';

    return `
      <div class="page-header">
        <h1 class="page-title">Content Types</h1>
        <span class="count-chip">${S.contentTypes.length} tags · ${inUseCount} in use</span>
        <span style="flex:1"></span>
        <button class="pill ${filterAll ? 'active' : ''}" onclick="S.ctFilter='all';App.render()">All</button>
        <button class="pill ${S.ctFilter === 'inuse' ? 'active' : ''}" onclick="S.ctFilter='inuse';App.render()">In use</button>
      </div>

      <p class="mute" style="font-size:var(--text-xs); font-style:italic; margin: 0 0 16px;">
        Tags here power the Content Type dropdown when adding a bin. Renaming updates everywhere.
      </p>

      ${S.contentTypes.length ? `
        <div class="tag-grid">
          ${S.contentTypes.filter(ct => filterAll || usage[ct.name]).map(ct => this._tagCard(ct, usage[ct.name] || 0, maxUsage)).join('') ||
            '<div class="mute">Nothing matches that filter.</div>'}
        </div>
      ` : `
        <div class="card" style="text-align:center; padding:48px 16px;">
          <div class="mute">No content types yet. Add one from the top right.</div>
        </div>`}
    `;
  },

  _tagCard(ct, count, max) {
    const inUse = count > 0;
    const pct = Math.round((count / max) * 100);
    // Always apply the hue: unused cards keep ink colors (since .in-use is what
    // pulls --accent into the border / name), but the usage bar fill still picks
    // up the hue so the dormant tag has a visual identity.
    return `
      <div class="tag-card ${inUse ? 'in-use' : ''} ${hueClass(ct.name)}">
        <div class="ico">${icon('tag', 18)}</div>
        <div class="info">
          <div class="name">${esc(ct.name)}</div>
          <div class="usage">${inUse ? count + ' bin' + (count !== 1 ? 's' : '') : 'unused'}</div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="menu">
          <button class="icon-btn" title="Edit" onclick="App.showEditContentType(${ct.id})">${icon('pencil', 16)}</button>
          <button class="icon-btn" title="Delete" onclick="App.deleteContentType(${ct.id})">${icon('trash', 16)}</button>
        </div>
      </div>`;
  },

  _ctForm(ct = {}) {
    return `
      <div>
        <label class="field-label">Name</label>
        <input class="input" id="f-ctname" value="${esc(ct.name || '')}" placeholder="e.g. Bolt" autofocus>
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--line-soft); margin:24px -20px -16px; padding:16px 20px 12px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveContentType(${ct.id || ''})">Save</button>
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
      await Promise.all([this.loadContentTypes(), this.loadBins()]);
      this.closeModal();
      this.render();
      toast(id ? 'Content type updated' : 'Content type created');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async deleteContentType(id) {
    const ct = S.contentTypes.find(c => c.id === id);
    const inUse = S.bins.filter(b => b.content_type === ct.name).length;
    const msg = inUse
      ? `Delete "${ct.name}"?\n${inUse} bin(s) currently use this tag — they will lose it (their content type becomes empty).`
      : `Delete "${ct.name}"?`;
    if (!confirm(msg)) return;
    try {
      await api.delete('/content-types/' + id);
      await Promise.all([this.loadContentTypes(), this.loadBins()]);
      this.render();
      toast('Content type deleted');
    } catch (e) { alert('Error: ' + e.message); }
  },
});
