'use strict';

Object.assign(App, {

  _binFormHTML(bin = {}) {
    return `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Content Type</label>
            <input id="f-ctype" value="${esc(bin.content_type || '')}" list="ctype-dl"
              placeholder="bolt, connector, tool…"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <datalist id="ctype-dl">
              ${['Bolt','Nut','Washer','Screw','Connector','Cable','Tool','Electronics','Spring','Bearing','Insert'].map(v => `<option value="${v}">`).join('')}
            </datalist>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Attribute</label>
            <input id="f-attr" value="${esc(bin.attribute || '')}"
              placeholder="M5×30, JST 2.54 mm…"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Box Type</label>
            <select id="f-btype" onchange="App.onBinBtChange()"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— None —</option>
              ${S.boxTypes.map(bt => `<option value="${bt.id}"
                ${String(bt.id) === String(bin.box_type_id) ? 'selected' : ''}
                data-w="${bt.grid_width}" data-l="${bt.grid_length}" data-h="${bt.grid_height_u}">
                ${esc(bt.name)} (${bt.grid_width}×${bt.grid_length}×${bt.grid_height_u}U)
              </option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Height Override (U)</label>
            <input id="f-hu" type="number" value="${bin.height_u || 3}" min="1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Notes</label>
          <textarea id="f-notes" rows="2"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">${esc(bin.notes || '')}</textarea>
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Drawer Location</label>
          <select id="f-loc" onchange="App.onBinLocChange()"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3">
            <option value="">— No location —</option>
            ${S.locations.map(l => `<option value="${l.id}" ${String(l.id) === String(bin.location_id) ? 'selected' : ''}>${esc(l.cabinet_id)} / ${esc(l.drawer_id)} (${l.grid_columns}×${l.grid_rows})</option>`).join('')}
          </select>
          <div id="grid-area"></div>
        </div>
      </div>
      <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
        <button onclick="App.closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onclick="App.saveBin(${bin.id || ''})" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Save Bin</button>
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
      area.innerHTML = `<p class="text-xs text-gray-400 italic mt-1">Select a drawer to see the grid and place the bin.</p>`;
      return;
    }

    const { grid_columns: cols, grid_rows: rows } = g.locData;

    // Build occupancy map (skip the bin we're editing)
    const occ = {};
    for (const b of g.drawerBins) {
      if (String(b.id) === String(g.editId)) continue;
      for (let dy = 0; dy < (b.grid_length || 1); dy++)
        for (let dx = 0; dx < (b.grid_width || 1); dx++)
          occ[`${b.grid_x + dx},${b.grid_y + dy}`] = b;
    }

    // Compute conflict for currently selected position
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

        cells += `<td class="${cls}"
          onclick="App._gridClick(${c},${r})"
          onmouseenter="App._gridHover(${c},${r})"
          title="(col ${c}, row ${r})${occupier ? ' · #' + occupier.id + ' ' + (occupier.attribute || '') : ''}"
        >${inner}</td>`;
      }
      tableRows += `<tr>${cells}</tr>`;
    }

    const conflict = hasConflict();
    const canRotate = g.bw !== g.bl;
    area.innerHTML = `
      <div class="text-xs text-gray-500 mb-2 flex items-center gap-3 flex-wrap">
        <span>Click to place the bin's top-left corner</span>
        ${g.selX != null ? `<span class="font-mono bg-slate-100 px-2 py-0.5 rounded">pos: (${g.selX}, ${g.selY}) · ${g.bw}×${g.bl} cells</span>` : `<span class="font-mono bg-slate-100 px-2 py-0.5 rounded">${g.bw}×${g.bl} cells</span>`}
        <button type="button" onclick="App._gridRotate()" ${canRotate ? '' : 'disabled'}
          class="ml-auto px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          title="${canRotate ? 'Rotate bin 90°' : 'Square footprint — rotation has no effect'}">
          <span>↻</span> Rotate
        </button>
        ${conflict ? `<span class="text-red-500 font-medium">⚠ Position conflict!</span>` : ''}
      </div>
      <div class="overflow-x-auto rounded-lg border-2 border-gray-300 inline-block max-w-full">
        <table class="border-collapse">${tableRows}</table>
      </div>
      <div class="mt-2 flex gap-4 text-xs text-gray-400">
        <span><span class="inline-block w-3 h-3 bg-blue-500 rounded-sm mr-1"></span>Occupied</span>
        <span><span class="inline-block w-3 h-3 bg-emerald-500 rounded-sm mr-1"></span>Selected</span>
        <span><span class="inline-block w-3 h-3 bg-red-400 rounded-sm mr-1"></span>Conflict</span>
      </div>`;
  },

  _gridClick(c, r) {
    S.grid.selX = c; S.grid.selY = r;
    this._renderGridPicker();
  },
  _gridHover(c, r) { /* future: live preview */ },

  _gridRotate() {
    const g = S.grid;
    if (g.bw === g.bl) return;
    [g.bw, g.bl] = [g.bl, g.bw];
    // Clamp selection so the rotated footprint still fits inside the drawer
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

    // Conflict check
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
            alert('⚠ Position conflict with an existing bin. Please choose a different grid position.');
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
      if (id) await api.put('/bins/' + id, data);
      else    await api.post('/bins', data);
      await this.loadBins();
      this.closeModal();
      this.render();
      toast(id ? 'Bin updated ✓' : 'Bin created ✓');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async deleteBin(id) {
    if (!confirm(`Remove bin #${id} from inventory?`)) return;
    await api.delete('/bins/' + id);
    await this.loadBins();
    this.render();
    toast('Bin removed');
  },
});
