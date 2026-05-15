'use strict';

Object.assign(App, {

  renderLocations() {
    // Group drawers by cabinet, ordered by name.
    const cabs = {};
    for (const l of S.locations) (cabs[l.cabinet_id] = cabs[l.cabinet_id] || []).push(l);
    const cabNames = Object.keys(cabs).sort();
    const cabCount = cabNames.length;

    return `
      <div class="page-header">
        <h1 class="page-title">Drawers</h1>
        <span class="count-chip">${S.locations.length} drawers · ${cabCount} cabinet${cabCount !== 1 ? 's' : ''}</span>
      </div>

      ${cabNames.length ? `
        <div class="cabinet-grid">
          ${cabNames.map(n => this._cabinetCard(n, cabs[n])).join('')}
        </div>
        <p class="mute" style="font-size:var(--text-xs); margin-top:12px;">↳ click any drawer's grid to open the full editor</p>
      ` : `
        <div class="card" style="text-align:center; padding:48px 16px;">
          <div style="color:var(--mute); margin-bottom:12px;">${icon('drawer', 48)}</div>
          <div class="mute">No drawers yet. Add your first drawer from the top right.</div>
        </div>`}
    `;
  },

  _cabinetCard(name, drawers) {
    const binsByDrawer = {};
    for (const b of S.bins) (binsByDrawer[b.location_id] = binsByDrawer[b.location_id] || []).push(b);

    return `
      <div class="card">
        <div class="cabinet-header">
          <h2 class="cabinet-title">${esc(name)}</h2>
          <span style="flex:1"></span>
          <span class="mute" style="font-size:var(--text-xs);">${drawers.length} drawer${drawers.length !== 1 ? 's' : ''}</span>
        </div>
        ${drawers.map(d => this._drawerRow(d, binsByDrawer[d.id] || [])).join('')}
      </div>`;
  },

  _drawerRow(d, bins) {
    return `
      <div class="drawer-row">
        <div class="meta">
          <div class="name">${esc(d.drawer_id)}</div>
          <div class="spec mono">${d.grid_columns}×${d.grid_rows} · ${d.vertical_space_u}U</div>
          <div style="margin-top:6px;">
            <span class="pill ${bins.length ? 'accent' : ''}">${bins.length ? bins.length + ' bin' + (bins.length !== 1 ? 's' : '') : 'empty'}</span>
          </div>
          ${d.attributes ? `<div class="desc">${esc(d.attributes)}</div>` : ''}
          <div class="row-actions">
            <button class="icon-btn" title="Edit" onclick="event.stopPropagation();App.showEditLocation(${d.id})">${icon('pencil', 16)}</button>
            <button class="icon-btn" title="Delete" onclick="event.stopPropagation();App.deleteLocation(${d.id})">${icon('trash', 16)}</button>
          </div>
        </div>
        <div class="minigrid-wrap" onclick="App.showDrawerMap(${d.id})">
          ${this._miniGrid(d, bins)}
        </div>
      </div>`;
  },

  _miniGrid(loc, bins) {
    const cell = 14;
    const cols = loc.grid_columns, rows = loc.grid_rows;
    let cells = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        cells += `<rect x="${x*cell}" y="${y*cell}" width="${cell}" height="${cell}"
          fill="var(--softer)" stroke="var(--line-soft)" stroke-width="0.8"/>`;
      }
    }
    let binRects = '';
    for (const b of bins) {
      if (b.grid_x == null) continue;
      const hue = hueClass(b.content_type);
      binRects += `<rect class="${hue}" x="${b.grid_x*cell + 1}" y="${b.grid_y*cell + 1}"
        width="${(b.grid_width||1)*cell - 2}" height="${(b.grid_length||1)*cell - 2}"
        fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.2" rx="2"
        ><title>#${b.id} ${esc(b.attribute || b.content_type || '')}</title></rect>`;
    }
    return `<svg width="${cols*cell}" height="${rows*cell}" viewBox="0 0 ${cols*cell} ${rows*cell}" role="img" aria-label="Drawer ${esc(loc.drawer_id)} layout">
      ${cells}${binRects}
    </svg>`;
  },

  // ── Drawer add/edit modal ────────────────────────────────────
  _locForm(loc = {}) {
    return `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="field-label">Cabinet ID</label>
          <input class="input" id="f-cab" value="${esc(loc.cabinet_id || '')}" placeholder="Cabinet A">
        </div>
        <div>
          <label class="field-label">Drawer ID</label>
          <input class="input" id="f-drw" value="${esc(loc.drawer_id || '')}" placeholder="Drawer 1">
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-top:16px;">
        <div>
          <label class="field-label">Columns</label>
          <input class="input" id="f-cols" type="number" value="${loc.grid_columns || 5}" min="1" max="30">
        </div>
        <div>
          <label class="field-label">Rows</label>
          <input class="input" id="f-rows" type="number" value="${loc.grid_rows || 5}" min="1" max="20">
        </div>
        <div>
          <label class="field-label">Max height (U)</label>
          <input class="input" id="f-vsp" type="number" value="${loc.vertical_space_u || 6}" min="1" max="50">
        </div>
      </div>
      <div style="margin-top:16px;">
        <label class="field-label">Description</label>
        <input class="input" id="f-attr" value="${esc(loc.attributes || '')}" placeholder="e.g. Bolts & Screws">
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--line-soft); margin:24px -20px -16px; padding:16px 20px 12px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveLocation(${loc.id || ''})">Save</button>
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
      toast(id ? 'Drawer updated' : 'Drawer created');
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
