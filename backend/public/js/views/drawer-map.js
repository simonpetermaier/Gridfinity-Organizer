'use strict';

Object.assign(App, {

  async showDrawerMap(locId) {
    const loc  = S.locations.find(l => l.id === locId);
    const bins = await api.get('/locations/' + locId + '/bins');
    const { grid_columns: cols, grid_rows: rows } = loc;

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
          const hue = hueClass(e.bin.content_type);
          cells += `<td class="dmap-cell filled ${hue}"
            onclick="App.closeModal();App.switchTab('inventory');S.selectedBinId=${e.bin.id};App.render();"
            title="#${e.bin.id} · ${esc(e.bin.attribute || '')} · ${esc(e.bin.content_type || '')}">
            ${e.isOrigin ? `<div class="lbl">#${e.bin.id}<br>${esc(e.bin.attribute || e.bin.content_type || '')}</div>` : ''}
          </td>`;
        } else {
          cells += `<td class="dmap-cell" title="(${c},${r})"></td>`;
        }
      }
      tableRows += `<tr>${cells}</tr>`;
    }

    this.openModal(`Drawer Map — ${esc(loc.cabinet_id)} / ${esc(loc.drawer_id)}`, `
      <div class="mute" style="font-size:var(--text-xs); margin-bottom:12px;">${cols}×${rows} grid · max ${loc.vertical_space_u}U · ${bins.length} bin${bins.length !== 1 ? 's' : ''} placed</div>
      <div style="overflow-x:auto; margin-bottom:16px;">
        <table style="border-collapse:collapse; border:2px solid var(--line);">${tableRows}</table>
      </div>
      ${bins.length ? `
        <div class="caps" style="margin-bottom:8px;">Legend</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          ${bins.map(b => `
            <div class="${hueClass(b.content_type)}" style="display:flex; align-items:center; gap:8px; font-size:var(--text-sm);">
              <span style="width:14px; height:14px; background:var(--accent-soft); border:1px solid var(--accent); border-radius:3px; flex-shrink:0;"></span>
              <span class="mono mute" style="font-size:var(--text-xs);">#${b.id}</span>
              <span style="font-weight:500;">${esc(b.attribute || b.content_type || '—')}</span>
            </div>`).join('')}
        </div>` : `<p class="mute">No bins placed in this drawer yet.</p>`}
      <div class="modal-footer" style="border-top:1px solid var(--line-soft); margin:24px -20px -16px; padding:16px 20px 12px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>`);
  },
});
