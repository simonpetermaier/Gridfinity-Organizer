'use strict';

Object.assign(App, {

  async renderBinScan(id) {
    try {
      const b = await api.get('/bins/' + id);
      $('root').innerHTML = `
        <div class="scan-wrap">
          <div class="scan-header">
            <span style="color:var(--accent); display:inline-flex;">${icon('brand', 22)}</span>
            <span>Gridfinity Organizer</span>
            <a href="/" class="home-link">← App</a>
          </div>
          <div class="scan-card">
            <div class="banner">
              <div class="lbl">Bin ID</div>
              <div class="id">#${b.id}</div>
            </div>
            <div class="body">
              <div>
                <div class="caps">Contents</div>
                <div style="font-size:var(--text-2xl); font-weight:700; font-family:var(--font-mono); word-break:break-word;">${esc(b.attribute || '—')}</div>
                ${b.content_type ? `<div style="margin-top:6px;"><span class="pill accent ${hueClass(b.content_type)}">${esc(b.content_type)}</span></div>` : ''}
              </div>
              <hr style="border:none; border-top:1px solid var(--line-soft); margin:16px 0;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                <div><div class="caps">Cabinet</div><div style="font-weight:600;">${esc(b.cabinet_id || '—')}</div></div>
                <div><div class="caps">Drawer</div><div style="font-weight:600;">${esc(b.drawer_id || '—')}</div></div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:14px;">
                <div><div class="caps">Position</div><div class="mono">${b.grid_x != null ? `(${b.grid_x}, ${b.grid_y})` : '—'}</div></div>
                <div><div class="caps">Grid</div><div class="mono">${b.grid_width}×${b.grid_length}</div></div>
                <div><div class="caps">Height</div><div class="mono">${b.height_u}U</div></div>
              </div>
              ${b.box_type_name ? `
                <div style="margin-top:14px;">
                  <div class="caps">Box Type</div>
                  <div style="font-weight:600;">${esc(b.box_type_name)}</div>
                  ${b.is_divided ? `<div class="mute" style="font-size:var(--text-xs); margin-top:2px;">Divided · ${b.compartments} comp.</div>` : ''}
                </div>` : ''}
              ${b.notes ? `<div style="margin-top:14px;"><div class="caps">Notes</div><div style="font-size:var(--text-sm);">${esc(b.notes)}</div></div>` : ''}
            </div>
            <div class="qr-area">
              <div id="scan-qr" style="background:#fff; padding:8px; border-radius:var(--radius-md);"></div>
            </div>
          </div>
        </div>`;
      new QRCode($('scan-qr'), {
        text: qrPayload(b.id),
        width: 120, height: 120,
        colorDark: '#000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {
      $('root').innerHTML = `
        <div class="scan-wrap" style="align-items:center; justify-content:center; text-align:center;">
          <div style="font-size:48px; margin-bottom:12px;">❓</div>
          <h2 style="margin:0 0 6px;">Bin #${esc(id)} not found</h2>
          <p class="mute">This bin may have been removed.</p>
          <a href="/" style="margin-top:12px;">← Back to App</a>
        </div>`;
    }
  },
});
