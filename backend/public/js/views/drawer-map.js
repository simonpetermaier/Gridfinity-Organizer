'use strict';

Object.assign(App, {

  async showDrawerMap(locId) {
    const loc  = S.locations.find(l => l.id === locId);
    const bins = await api.get('/locations/' + locId + '/bins');
    const { grid_columns: cols, grid_rows: rows } = loc;

    // Build per-bin colour map
    const colorMap = {};
    bins.forEach((b, i) => { colorMap[b.id] = PALETTE[i % PALETTE.length]; });

    // Build occupancy: key → { bin, isOrigin }
    const occ = {};
    for (const b of bins) {
      for (let dy = 0; dy < (b.grid_length || 1); dy++)
        for (let dx = 0; dx < (b.grid_width || 1); dx++) {
          const k = `${b.grid_x + dx},${b.grid_y + dy}`;
          occ[k] = { bin: b, isOrigin: dx === 0 && dy === 0 };
        }
    }

    let tableRows = '';
    for (let r = 0; r < rows; r++) {
      let cells = '';
      for (let c = 0; c < cols; c++) {
        const e = occ[`${c},${r}`];
        if (e) {
          const col = colorMap[e.bin.id];
          const lbl = e.isOrigin
            ? `<div class="text-white text-center pointer-events-none" style="font-size:8px;line-height:1.3;padding:2px;font-weight:600;">#${e.bin.id}<br>${esc(e.bin.attribute || e.bin.content_type || '')}</div>`
            : '';
          cells += `<td style="width:52px;height:52px;background:${col};border:1px solid rgba(0,0,0,0.15);cursor:pointer;position:relative;vertical-align:top;"
            onclick="App.closeModal();App.showQr(${e.bin.id})"
            title="#${e.bin.id} · ${esc(e.bin.attribute || '')} · ${esc(e.bin.content_type || '')}"
          >${lbl}</td>`;
        } else {
          cells += `<td style="width:52px;height:52px;border:1px solid #e2e8f0;background:#f8fafc;"
            title="(${c},${r})"></td>`;
        }
      }
      tableRows += `<tr>${cells}</tr>`;
    }

    this.openModal(`Drawer Map — ${esc(loc.cabinet_id)} / ${esc(loc.drawer_id)}`, `
      <div class="text-xs text-gray-400 mb-3">${cols}×${rows} grid · max ${loc.vertical_space_u}U · ${bins.length} bin${bins.length !== 1 ? 's' : ''} placed</div>
      <div class="overflow-x-auto mb-4">
        <table class="border-collapse" style="border:2px solid #374151;">${tableRows}</table>
      </div>
      ${bins.length ? `
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Legend</div>
        <div class="grid grid-cols-2 gap-1.5">
          ${bins.map(b => `
            <div class="flex items-center gap-2 text-sm">
              <span style="width:14px;height:14px;background:${colorMap[b.id]};border-radius:3px;flex-shrink:0;"></span>
              <span class="font-mono text-gray-400 text-xs">#${b.id}</span>
              <span class="font-medium text-gray-700 truncate">${esc(b.attribute || b.content_type || '—')}</span>
            </div>`).join('')}
        </div>` : `<p class="text-gray-400 text-sm">No bins placed in this drawer yet.</p>`}
      <div class="flex justify-end mt-6 pt-4 border-t border-gray-100">
        <button onclick="App.closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
      </div>`);
  },
});
