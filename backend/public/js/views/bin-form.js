'use strict';

Object.assign(App, {

  _binFormHTML(bin = {}) {
    return `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="field-label">Content type</label>
          <input class="input" id="f-ctype" value="${esc(bin.content_type || '')}" list="ctype-dl"
            placeholder="bolt, connector, tool…">
          <datalist id="ctype-dl">
            ${S.contentTypes.map(ct => `<option value="${esc(ct.name)}">`).join('')}
          </datalist>
        </div>
        <div>
          <label class="field-label">Attribute</label>
          <input class="input" id="f-attr" value="${esc(bin.attribute || '')}" placeholder="M5×30, JST 2.54 mm…">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">
        <div>
          <label class="field-label">Box type</label>
          <select class="select" id="f-btype" onchange="App.onBinBtChange()">
            <option value="">— None —</option>
            ${S.boxTypes.map(bt => `<option value="${bt.id}"
              ${String(bt.id) === String(bin.box_type_id) ? 'selected' : ''}
              data-w="${bt.grid_width}" data-l="${bt.grid_length}" data-h="${bt.grid_height_u}">
              ${esc(bt.name)} (${bt.grid_width}×${bt.grid_length}×${bt.grid_height_u}U)
            </option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label">Height override (U)</label>
          <input class="input" id="f-hu" type="number" value="${bin.height_u || 3}" min="1">
        </div>
      </div>

      <div style="margin-top:16px;">
        <label class="field-label">Notes</label>
        <textarea class="input" id="f-notes" rows="2">${esc(bin.notes || '')}</textarea>
      </div>

      <div style="margin-top:16px;">
        <label class="field-label">Drawer location</label>
        <select class="select" id="f-loc" onchange="App.onBinLocChange()" style="margin-bottom:12px;">
          <option value="">— No location —</option>
          ${S.locations.map(l => `<option value="${l.id}" ${String(l.id) === String(bin.location_id) ? 'selected' : ''}>${esc(l.cabinet_id)} / ${esc(l.drawer_id)} (${l.grid_columns}×${l.grid_rows})</option>`).join('')}
        </select>
        <div id="grid-area"></div>
      </div>

      <div class="modal-footer" style="border-top:1px solid var(--line-soft); margin:24px -20px -16px; padding:16px 20px 12px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveBin(${bin.id || ''})">Save bin</button>
      </div>`;
  },

  showAddBin() {
    S.grid = { locId: null, locData: null, drawerBins: [], selX: null, selY: null, bw: 1, bl: 1, editId: null };
    this.openModal('Add Bin', this._binFormHTML());
  },

  showEditBin(id) {
    const b = S.bins.find(x => x.id === id);
    S.grid = {
      locId: b.location_id, locData: null, drawerBins: [],
      selX: b.grid_x, selY: b.grid_y,
      bw: b.grid_width || 1, bl: b.grid_length || 1,
      editId: id,
    };
    this.openModal('Edit Bin #' + id, this._binFormHTML(b));
    if (b.location_id) this.onBinLocChange();
  },

  onBinBtChange() {
    const sel = $('f-btype');
    const opt = sel.options[sel.selectedIndex];
    if (opt.value) {
      S.grid.bw = parseInt(opt.dataset.w) || 1;
      S.grid.bl = parseInt(opt.dataset.l) || 1;
      $('f-hu').value = opt.dataset.h || 3;
    } else { S.grid.bw = 1; S.grid.bl = 1; }
    this._renderGridPicker();
  },

  async onBinLocChange() {
    const locId = $('f-loc')?.value;
    if (!locId) {
      S.grid.locId = null; S.grid.locData = null; S.grid.drawerBins = [];
      S.grid.selX = null; S.grid.selY = null;
      this._renderGridPicker(); return;
    }
    S.grid.locId   = parseInt(locId);
    S.grid.locData = S.locations.find(l => l.id === parseInt(locId));
    S.grid.drawerBins = await api.get('/locations/' + locId + '/bins');
    this._renderGridPicker();
  },

  _renderGridPicker() {
    const area = $('grid-area');
    if (!area) return;
    const g = S.grid;

    if (!g.locData) {
      area.innerHTML = `<p class="mute" style="font-size:var(--text-xs); font-style:italic;">Select a drawer to place the bin.</p>`;
      return;
    }

    const { grid_columns: cols, grid_rows: rows } = g.locData;

    const occ = {};
    for (const b of g.drawerBins) {
      if (String(b.id) === String(g.editId)) continue;
      for (let dy = 0; dy < (b.grid_length || 1); dy++)
        for (let dx = 0; dx < (b.grid_width || 1); dx++)
          occ[`${b.grid_x + dx},${b.grid_y + dy}`] = b;
    }
    const inSel = (c, r) =>
      g.selX != null && c >= g.selX && c < g.selX + g.bw && r >= g.selY && r < g.selY + g.bl;
    const hasConflict = () => {
      if (g.selX == null) return false;
      for (let dy = 0; dy < g.bl; dy++)
        for (let dx = 0; dx < g.bw; dx++)
          if (occ[`${g.selX + dx},${g.selY + dy}`]) return true;
      return false;
    };

    let tableRows = '';
    for (let r = 0; r < rows; r++) {
      let cells = '';
      for (let c = 0; c < cols; c++) {
        const key = `${c},${r}`;
        const occupier = occ[key];
        const selected = inSel(c, r);
        let cls = 'gc';
        let inner = '';
        if (occupier && !selected) {
          cls += ' occ';
          inner = `<span class="bin-lbl">#${occupier.id} ${esc(occupier.attribute || occupier.content_type || '')}</span>`;
        } else if (selected) {
          cls += occupier ? ' conflict' : ' sel';
        }
        cells += `<td class="${cls}" onclick="App._gridClick(${c},${r})"
          title="(col ${c}, row ${r})${occupier ? ' · #' + occupier.id + ' ' + (occupier.attribute || '') : ''}">${inner}</td>`;
      }
      tableRows += `<tr>${cells}</tr>`;
    }

    const conflict = hasConflict();
    const canRotate = g.bw !== g.bl;
    area.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="mute" style="font-size:var(--text-xs);">Click to place the bin's top-left corner</span>
        ${g.selX != null
          ? `<span class="pill mono">pos (${g.selX}, ${g.selY}) · ${g.bw}×${g.bl}</span>`
          : `<span class="pill mono">${g.bw}×${g.bl}</span>`}
        <button type="button" class="btn btn-secondary sm" style="margin-left:auto;"
          ${canRotate ? '' : 'disabled'} onclick="App._gridRotate()"
          title="${canRotate ? 'Rotate 90°' : 'Square footprint — rotation has no effect'}">↻ Rotate</button>
        ${conflict ? `<span style="color:var(--danger); font-weight:600; font-size:var(--text-xs);">⚠ Conflict</span>` : ''}
      </div>
      <div style="display:inline-block; border:2px solid var(--line); border-radius:var(--radius-md); overflow:auto; max-width:100%;">
        <table style="border-collapse:collapse;">${tableRows}</table>
      </div>
      <div style="display:flex; gap:16px; margin-top:8px; font-size:var(--text-xs); color:var(--mute);">
        <span><span style="display:inline-block; width:12px; height:12px; background:var(--accent); border-radius:2px; vertical-align:middle; margin-right:4px;"></span>Occupied</span>
        <span><span style="display:inline-block; width:12px; height:12px; background:var(--success); border-radius:2px; vertical-align:middle; margin-right:4px;"></span>Selected</span>
        <span><span style="display:inline-block; width:12px; height:12px; background:var(--danger); border-radius:2px; vertical-align:middle; margin-right:4px;"></span>Conflict</span>
      </div>`;
  },

  _gridClick(c, r) { S.grid.selX = c; S.grid.selY = r; this._renderGridPicker(); },

  _gridRotate() {
    const g = S.grid;
    if (g.bw === g.bl) return;
    [g.bw, g.bl] = [g.bl, g.bw];
    if (g.locData && g.selX != null) {
      g.selX = Math.min(g.selX, Math.max(0, g.locData.grid_columns - g.bw));
      g.selY = Math.min(g.selY, Math.max(0, g.locData.grid_rows    - g.bl));
    }
    this._renderGridPicker();
  },

  async saveBin(id) {
    const g = S.grid;
    const locId = $('f-loc').value;
    const btId  = $('f-btype').value;

    if (locId && g.selX != null && g.drawerBins.length) {
      const occ = {};
      for (const b of g.drawerBins) {
        if (String(b.id) === String(id)) continue;
        for (let dy = 0; dy < (b.grid_length || 1); dy++)
          for (let dx = 0; dx < (b.grid_width || 1); dx++)
            occ[`${b.grid_x + dx},${b.grid_y + dy}`] = true;
      }
      for (let dy = 0; dy < g.bl; dy++)
        for (let dx = 0; dx < g.bw; dx++)
          if (occ[`${g.selX + dx},${g.selY + dy}`]) {
            alert('⚠ Position conflict with an existing bin.');
            return;
          }
    }

    const data = {
      location_id:  locId ? parseInt(locId) : null,
      grid_x:       g.selX,
      grid_y:       g.selY,
      grid_width:   g.bw,
      grid_length:  g.bl,
      height_u:     parseInt($('f-hu').value) || 3,
      box_type_id:  btId ? parseInt(btId) : null,
      content_type: $('f-ctype').value.trim(),
      attribute:    $('f-attr').value.trim(),
      notes:        $('f-notes').value.trim(),
    };
    try {
      let saved;
      if (id) saved = await api.put('/bins/' + id, data);
      else    saved = await api.post('/bins', data);
      await Promise.all([this.loadBins(), this.loadContentTypes()]);
      if (saved && saved.id) S.selectedBinId = saved.id;
      this.closeModal();
      this.render();
      toast(id ? 'Bin updated' : 'Bin created');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async deleteBin(id) {
    if (!confirm(`Remove bin #${id} from inventory?`)) return;
    await api.delete('/bins/' + id);
    if (S.selectedBinId === id) S.selectedBinId = null;
    await this.loadBins();
    this.render();
    toast('Bin removed');
  },
});
