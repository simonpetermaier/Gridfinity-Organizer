'use strict';

Object.assign(App, {

  renderBoxTypes() {
    // Topbar quick-filter narrows by name or description.
    const q = S.quickFilter.trim().toLowerCase();
    const list = q
      ? S.boxTypes.filter(bt => `${bt.name} ${bt.description || ''}`.toLowerCase().includes(q))
      : S.boxTypes;

    return `
      <div class="page-header">
        <h1 class="page-title">Box Types</h1>
        <span class="count-chip">${list.length} types</span>
      </div>

      ${list.length ? `
        <div class="box-gallery">
          ${list.map(bt => this._boxCard(bt)).join('')}
        </div>
      ` : `
        <div class="card" style="text-align:center; padding:48px 16px;">
          <div class="mute">${q ? 'Nothing matches your filter.' : 'No box types yet. Add one from the top right.'}</div>
        </div>`}
    `;
  },

  _boxCard(bt) {
    return `
      <div class="box-card">
        <div class="actions">
          <button class="icon-btn" title="Edit" onclick="App.showEditBoxType(${bt.id})">${icon('pencil', 16)}</button>
          <button class="icon-btn" title="Delete" onclick="App.deleteBoxType(${bt.id})">${icon('trash', 16)}</button>
        </div>
        <div class="shape">${this._boxShape(bt)}</div>
        <div class="name mono">${esc(bt.name)}</div>
        <div class="sub">${bt.grid_width}×${bt.grid_length} · ${bt.grid_height_u}U${bt.is_divided ? ' · ' + bt.compartments + ' comp.' : ''}</div>
        ${bt.description ? `<div class="sub mute" style="font-style:italic;">${esc(bt.description)}</div>` : ''}
      </div>`;
  },

  _boxShape(bt) {
    const cell = 18;
    const w = bt.grid_width, h = bt.grid_length;
    const divLines = [];
    if (bt.is_divided) {
      // Distribute dashed lines evenly across the long axis based on compartment count.
      const comp = Math.max(1, bt.compartments || 1);
      const horiz = h >= w;
      for (let i = 1; i < comp; i++) {
        const p = (i / comp);
        if (horiz) {
          divLines.push(`<line x1="0" y1="${h*cell*p}" x2="${w*cell}" y2="${h*cell*p}"
            stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="2 2"/>`);
        } else {
          divLines.push(`<line x1="${w*cell*p}" y1="0" x2="${w*cell*p}" y2="${h*cell}"
            stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="2 2"/>`);
        }
      }
    }
    let grid = '';
    for (let i = 1; i < w; i++) {
      grid += `<line x1="${i*cell}" y1="0" x2="${i*cell}" y2="${h*cell}" stroke="var(--accent)" stroke-width="0.6" opacity="0.4"/>`;
    }
    for (let i = 1; i < h; i++) {
      grid += `<line x1="0" y1="${i*cell}" x2="${w*cell}" y2="${i*cell}" stroke="var(--accent)" stroke-width="0.6" opacity="0.4"/>`;
    }
    return `
      <svg width="${w*cell + 4}" height="${h*cell + 4}" style="overflow:visible;" role="img" aria-label="${esc(bt.name)} footprint">
        <g transform="translate(2,2)">
          <rect x="0" y="0" width="${w*cell}" height="${h*cell}" rx="2"
            fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
          ${grid}
          ${divLines.join('')}
        </g>
      </svg>`;
  },

  // ── Box-type modal ───────────────────────────────────────────
  _btForm(bt = {}) {
    return `
      <div>
        <label class="field-label">Name</label>
        <input class="input" id="f-name" value="${esc(bt.name || '')}" placeholder="e.g. 1×2×3">
      </div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-top:16px;">
        <div>
          <label class="field-label">Width (X)</label>
          <input class="input" id="f-gw" type="number" value="${bt.grid_width || 1}" min="1">
        </div>
        <div>
          <label class="field-label">Length (Y)</label>
          <input class="input" id="f-gl" type="number" value="${bt.grid_length || 1}" min="1">
        </div>
        <div>
          <label class="field-label">Height (U)</label>
          <input class="input" id="f-gh" type="number" value="${bt.grid_height_u || 3}" min="1">
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:24px; margin-top:16px; padding:12px;
                  background:var(--soft); border-radius:var(--radius-md);">
        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
          <input id="f-div" type="checkbox" ${bt.is_divided ? 'checked' : ''}>
          <span style="font-size:var(--text-sm); font-weight:500;">Divided bin</span>
        </label>
        <div style="display:flex; align-items:center; gap:8px;">
          <label class="field-label" style="margin:0;" for="f-comp">Compartments</label>
          <input class="input" id="f-comp" type="number" value="${bt.compartments || 1}" min="1" max="20" style="width:72px; height:32px;">
        </div>
      </div>
      <div style="margin-top:16px;">
        <label class="field-label">Description</label>
        <textarea class="input" id="f-desc" rows="2" placeholder="Optional description">${esc(bt.description || '')}</textarea>
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--line-soft); margin:24px -20px -16px; padding:16px 20px 12px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveBoxType(${bt.id || ''})">Save</button>
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
      toast(id ? 'Box type updated' : 'Box type created');
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
