'use strict';

Object.assign(App, {

  renderInventory() {
    const filteredBins = this.filteredBins();
    // Auto-select the first visible bin so the detail pane is never empty
    // when there's data.
    if (S.selectedBinId && !filteredBins.find(b => b.id === S.selectedBinId)) S.selectedBinId = null;
    if (!S.selectedBinId && filteredBins.length) S.selectedBinId = filteredBins[0].id;
    const sel = filteredBins.find(b => b.id === S.selectedBinId);

    // Explode bins into (bin, item) pairs, then optionally narrow by
    // typeFilter on the item's content_type. Bins with no items still get
    // one placeholder row so empty containers stay discoverable — unless
    // a typeFilter is active, in which case they're irrelevant.
    const rows = [];
    for (const b of filteredBins) {
      const items = b.items || [];
      if (items.length === 0) {
        if (!S.typeFilter) rows.push({ b, item: null });
      } else {
        for (const item of items) {
          if (S.typeFilter && item.content_type !== S.typeFilter) continue;
          rows.push({ b, item });
        }
      }
    }

    const usedTypes = [...new Set(
      S.bins.flatMap(b => (b.items || []).map(i => i.content_type)).filter(Boolean)
    )].sort();
    const totalItems = S.bins.reduce((n, b) => n + (b.items?.length || 0), 0);

    return `
      <div class="page-header">
        <h1 class="page-title">Inventory</h1>
        <span class="count-chip">${rows.length} item${rows.length === 1 ? '' : 's'} · ${S.bins.length} bin${S.bins.length === 1 ? '' : 's'} (${totalItems} total)</span>
      </div>

      <div class="filters">
        ${this._locFilterChips()}
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
          ${rows.length ? this._invRowsHtml(rows, sel) :
            `<div class="inv-row empty">No items match the current filters.</div>`}
        </div>

        ${isMobile() ? '' : `
        <div class="inv-right">
          <div class="card inv-detail">
            ${sel ? this._invDetail(sel) :
              `<div class="placeholder">Select a bin to see its details.</div>`}
          </div>

          <div class="card">
            <div class="caps" style="margin-bottom:8px;">Grid position</div>
            ${this._invGridMap(sel)}
          </div>
        </div>`}
      </div>`;
  },

  // Desktop/tablet: plain row list, detail shown separately in .inv-right.
  // Phone (≤768px): the detail + grid-position card are spliced into the
  // table right after the selected bin's row(s), splitting the list open
  // instead of pushing detail into a side panel that doesn't fit.
  _invRowsHtml(rows, sel) {
    const mobile = isMobile();
    if (!mobile || !sel) return rows.map(r => this._invRow(r.b, r.item)).join('');

    let html = '';
    rows.forEach((r, i) => {
      html += this._invRow(r.b, r.item);
      const next = rows[i + 1];
      const isLastRowOfSelectedBin = r.b.id === sel.id && (!next || next.b.id !== sel.id);
      if (isLastRowOfSelectedBin) html += this._invMobileDetail(sel);
    });
    return html;
  },

  _invMobileDetail(bin) {
    return `
      <div class="inv-row-detail inv-detail">
        ${this._invDetail(bin)}
        <div class="card" style="margin-top:12px;">
          <div class="caps" style="margin-bottom:8px;">Grid position</div>
          ${this._invGridMap(bin)}
        </div>
      </div>`;
  },

  // Mini grid map for the currently selected bin, highlighting its footprint
  // within its drawer. Reuses App._miniGrid (locations.js) with a selectedId.
  _invGridMap(bin) {
    if (!bin) return `<div class="mute" style="font-size:var(--text-sm);">Select a bin to see its position.</div>`;

    const loc = bin.location_id != null ? S.locations.find(l => l.id === bin.location_id) : null;
    if (!loc || bin.grid_x == null) {
      return `<div class="mute" style="font-size:var(--text-sm);">This bin isn't placed in a drawer yet.</div>`;
    }

    const drawerBins = S.bins.filter(b => b.location_id === loc.id);
    return `
      <div class="inv-minimap" onclick="App.showDrawerMap(${loc.id})" title="Open full drawer map">
        ${this._miniGrid(loc, drawerBins, bin.id, 56)}
      </div>
      <div class="mute" style="font-size:var(--text-xs); margin-top:8px; text-align:center;">
        ${esc(loc.cabinet_id)} · ${esc(loc.drawer_id)} — (${bin.grid_x}, ${bin.grid_y})
      </div>`;
  },

  filteredBins() {
    let bins = S.bins;
    if (S.locFilter)  bins = bins.filter(b => String(b.location_id) === String(S.locFilter));
    if (S.typeFilter) bins = bins.filter(b => (b.items || []).some(i => i.content_type === S.typeFilter));
    return bins;
  },

  // On phone, selecting a row splices detail content into the table right
  // there (see _invRowsHtml), which can insert/remove a large block above
  // the tapped row and shove it around on screen. Anchor on the tapped
  // row's on-screen position before re-rendering and correct the scroll
  // afterwards so it stays put instead of jumping under your thumb.
  _selectBin(id, rowEl) {
    const anchor = (isMobile() && rowEl) ? {
      bin: rowEl.dataset.bin, slot: rowEl.dataset.slot,
      top: rowEl.getBoundingClientRect().top,
    } : null;

    S.selectedBinId = id;
    this.render();

    if (anchor) {
      const again = document.querySelector(`.inv-row[data-bin="${anchor.bin}"][data-slot="${anchor.slot}"]`);
      if (again) {
        const delta = again.getBoundingClientRect().top - anchor.top;
        if (delta) window.scrollBy(0, delta);
      }
    }
  },

  _locFilterChips() {
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

  // Slot letter for divided bins (A, B, C, …). Returns '' for undivided.
  _slotLabel(b, slot) {
    return b.is_divided ? String.fromCharCode(65 + (slot || 0)) : '';
  },

  _invRow(b, item) {
    const selected = b.id === S.selectedBinId;
    const loc = b.cabinet_id ? `${esc(b.cabinet_id).slice(-1)}·${esc(b.drawer_id).replace(/[^0-9]/g,'') || ''}` : '—';
    const pos = b.grid_x != null ? `<span class="mono mute" style="font-size:var(--text-xs);">(${b.grid_x},${b.grid_y})</span>` : '';
    const slotLetter = item ? this._slotLabel(b, item.slot) : '';
    const idLabel = slotLetter ? `#${b.id}·${slotLetter}` : `#${b.id}`;
    const ctype = item?.content_type || '';
    const attr  = item?.attribute || '';
    const hue   = hueClass(ctype);
    const typeText = item
      ? (ctype || '—')
      : '<span class="mute">— empty —</span>';
    return `
      <div class="inv-row ${selected ? 'selected' : ''}" data-bin="${b.id}" data-slot="${item ? item.slot : ''}" onclick="App._selectBin(${b.id}, this)">
        <div class="bin-id mono">${idLabel}</div>
        <div class="two-line">
          <div class="top" style="display:flex; align-items:center; gap:6px;">
            ${hue ? `<span class="hue-dot ${hue}"></span>` : ''}
            <span>${typeText}</span>
          </div>
          <div class="bot">${esc(attr)}</div>
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

    const items = b.items || [];
    const capacity = b.is_divided ? (b.compartments || 1) : 1;
    const capacityLine = b.is_divided
      ? `<div class="mute" style="font-size:var(--text-xs); margin-top:6px;">Divided box · ${items.length}/${capacity} compartments used</div>`
      : '';

    const itemsHtml = items.length
      ? `<div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
           ${items.map(it => {
             const slot = this._slotLabel(b, it.slot);
             const hue = hueClass(it.content_type);
             return `
               <div class="card" style="padding:10px 12px; background:var(--bg);">
                 <div style="display:flex; align-items:center; gap:8px;">
                   ${slot ? `<span class="bin-id mono" title="Compartment">${slot}</span>` : ''}
                   ${it.content_type ? `<span class="pill accent ${hue}">${esc(it.content_type)}</span>` : '<span class="mute" style="font-size:var(--text-xs);">no tag</span>'}
                 </div>
                 ${it.attribute ? `<div class="mono" style="margin-top:6px; font-size:var(--text-md); font-weight:600;">${esc(it.attribute)}</div>` : ''}
                 ${it.notes ? `<div class="mute" style="font-size:var(--text-xs); margin-top:4px;">${esc(it.notes)}</div>` : ''}
               </div>`;
           }).join('')}
         </div>`
      : `<div class="mute" style="margin-top:8px; font-style:italic; font-size:var(--text-sm);">No items yet — click <strong>Edit</strong> to add some.</div>`;

    return `
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div class="id-chip">#${b.id}</div>
        <div style="flex:1; min-width:0;">
          <div class="caps">Contents</div>
          <div class="mono" style="font-size:var(--text-md); font-weight:600;">${items.length} item${items.length === 1 ? '' : 's'}</div>
          ${capacityLine}
        </div>
        <button class="icon-btn" title="Edit" onclick="App.showEditBin(${b.id})">${icon('pencil', 16)}</button>
        <button class="icon-btn" title="Delete" onclick="App.deleteBin(${b.id})">${icon('trash', 16)}</button>
      </div>

      ${itemsHtml}

      <div class="meta-grid" style="margin-top:16px;">
        <div><div class="label">Cabinet</div><div>${esc(b.cabinet_id || '—')}</div></div>
        <div><div class="label">Drawer</div><div>${esc(b.drawer_id || '—')}</div></div>
        <div><div class="label">Position</div><div class="mono">${b.grid_x != null ? `(${b.grid_x}, ${b.grid_y})` : '—'}</div></div>
        <div><div class="label">Box</div><div class="mono">${esc(b.box_type_name || '—')} · ${b.grid_width}×${b.grid_length} · ${b.height_u}U</div></div>
      </div>

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
