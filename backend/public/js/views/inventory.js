'use strict';

Object.assign(App, {

  renderInventory() {
    const filtered = this.filteredBins();
    if (S.selectedBinId && !filtered.find(b => b.id === S.selectedBinId)) S.selectedBinId = null;
    if (!S.selectedBinId && filtered.length) S.selectedBinId = filtered[0].id;
    const sel = filtered.find(b => b.id === S.selectedBinId);

    const usedCabinets = [...new Set(S.locations.map(l => l.cabinet_id))].filter(Boolean);
    const usedTypes    = [...new Set(S.bins.map(b => b.content_type).filter(Boolean))].sort();

    return `
      <div class="page-header">
        <h1 class="page-title">Inventory</h1>
        <span class="count-chip">${filtered.length} / ${S.bins.length} bins</span>
      </div>

      <div class="filters">
        ${this._locFilterChips(usedCabinets)}
        ${this._typeFilterChips(usedTypes)}
        ${S.locFilter || S.typeFilter ? `<button class="btn btn-ghost sm" onclick="S.locFilter='';S.typeFilter='';App.render()">Clear</button>` : ''}
      </div>

      <div class="inv-split">
        <div class="card card-pad-0 inv-list">
          <div class="inv-head">
            <div>ID</div>
            <div>Type / Attribute</div>
            <div>Box</div>
            <div>Location</div>
            <div></div>
          </div>
          ${filtered.length ? filtered.map(b => this._invRow(b)).join('') :
            `<div class="inv-row empty">No bins match the current filters.</div>`}
        </div>

        <div class="card inv-detail">
          ${sel ? this._invDetail(sel) :
            `<div class="placeholder">Select a bin to see its details.</div>`}
        </div>
      </div>`;
  },

  filteredBins() {
    let bins = S.bins;
    if (S.locFilter)  bins = bins.filter(b => String(b.location_id) === String(S.locFilter));
    if (S.typeFilter) bins = bins.filter(b => b.content_type === S.typeFilter);
    return bins;
  },

  _selectBin(id) { S.selectedBinId = id; this.render(); },

  _locFilterChips(cabinets) {
    if (!S.locations.length) return '';
    const locsByCab = {};
    for (const l of S.locations) (locsByCab[l.cabinet_id] = locsByCab[l.cabinet_id] || []).push(l);
    // Render a chip per location with its short id
    return S.locations.map(l => {
      const active = String(S.locFilter) === String(l.id);
      return `<button class="pill ${active ? 'active' : ''}"
        onclick="S.locFilter=${active ? "''" : `'${l.id}'`};App.render()">
        ${esc(l.cabinet_id)} · ${esc(l.drawer_id)}
      </button>`;
    }).join('');
  },

  _typeFilterChips(types) {
    return types.map(t => `
      <button class="pill ${S.typeFilter === t ? 'active' : ''} ${hueClass(t)}"
        onclick="S.typeFilter=${S.typeFilter === t ? "''" : `'${esc(t)}'`};App.render()">
        ${esc(t)}
      </button>`).join('');
  },

  _invRow(b) {
    const selected = b.id === S.selectedBinId;
    const loc = b.cabinet_id ? `${esc(b.cabinet_id).slice(-1)}·${esc(b.drawer_id).replace(/[^0-9]/g,'') || ''}` : '—';
    const pos = b.grid_x != null ? `<span class="mono mute" style="font-size:var(--text-xs);">(${b.grid_x},${b.grid_y})</span>` : '';
    const hue = hueClass(b.content_type);
    return `
      <div class="inv-row ${selected ? 'selected' : ''}" onclick="App._selectBin(${b.id})">
        <div class="bin-id mono">#${b.id}</div>
        <div class="two-line">
          <div class="top" style="display:flex; align-items:center; gap:6px;">
            ${hue ? `<span class="hue-dot ${hue}"></span>` : ''}
            <span>${esc(b.content_type || '—')}</span>
          </div>
          <div class="bot">${esc(b.attribute || '')}</div>
        </div>
        <div class="mono mute" style="font-size:var(--text-xs);">${esc(b.box_type_name || '—')}</div>
        <div class="mono" style="font-size:var(--text-xs);">${loc} ${pos}</div>
        <div></div>
      </div>`;
  },

  _invDetail(b) {
    const payload = qrPayload(b.id);
    setTimeout(() => {
      const host = document.getElementById(`detail-qr-${b.id}`);
      if (host && !host.firstChild) {
        new QRCode(host, {
          text: payload, width: 96, height: 96,
          colorDark: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      }
    }, 0);
    return `
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div class="id-chip">#${b.id}</div>
        <div style="flex:1; min-width:0;">
          <div class="caps">Contents</div>
          <div class="contents">${esc(b.attribute || '—')}</div>
          ${b.content_type ? `<div style="margin-top:6px;"><span class="pill accent ${hueClass(b.content_type)}">${esc(b.content_type)}</span></div>` : ''}
        </div>
        <button class="icon-btn" title="Edit" onclick="App.showEditBin(${b.id})">${icon('pencil', 16)}</button>
        <button class="icon-btn" title="Delete" onclick="App.deleteBin(${b.id})">${icon('trash', 16)}</button>
      </div>

      <div class="meta-grid">
        <div><div class="label">Cabinet</div><div>${esc(b.cabinet_id || '—')}</div></div>
        <div><div class="label">Drawer</div><div>${esc(b.drawer_id || '—')}</div></div>
        <div><div class="label">Position</div><div class="mono">${b.grid_x != null ? `(${b.grid_x}, ${b.grid_y})` : '—'}</div></div>
        <div><div class="label">Box</div><div class="mono">${esc(b.box_type_name || '—')} · ${b.grid_width}×${b.grid_length} · ${b.height_u}U</div></div>
      </div>

      ${b.notes ? `<div style="margin-top:12px;"><div class="label" style="margin-bottom:4px;">Notes</div><div style="font-size:var(--text-sm);">${esc(b.notes)}</div></div>` : ''}

      <div class="qr-row">
        <div id="detail-qr-${b.id}" style="background:#fff; padding:6px; border-radius:var(--radius-md);"></div>
        <div style="font-size:var(--text-xs);">
          <div class="caps">Label</div>
          <div style="font-size:var(--text-sm); margin-top:2px;">Bin #${b.id} QR</div>
          <div class="mute" style="margin-top:4px;">scan → opens bin card</div>
          <div style="margin-top:8px;"><button class="btn btn-secondary sm" onclick="App.showQr(${b.id})">Print…</button></div>
        </div>
      </div>`;
  },
});
