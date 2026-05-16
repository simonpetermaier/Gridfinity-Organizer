'use strict';

Object.assign(App, {

  _qrBin: null,

  async showQr(id) {
    const bin = S.bins.find(b => b.id === id) || await api.get('/bins/' + id);
    this._qrBin = bin;
    const payload = qrPayload(id);
    const url = `${window.location.origin}/bin/${id}`;   // human-readable line under the QR
    $('qr-title').textContent = `Bin #${id} · ${bin.attribute || bin.content_type || 'No label'}`;
    $('qr-url').textContent   = S.qrPayloadMode === 'id' ? payload : url;
    $('qr-box').innerHTML     = '';
    $('qr-overlay').classList.remove('hidden');
    new QRCode($('qr-box'), {
      text: payload, width: 200, height: 200,
      colorDark: '#000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  },

  closeQr() { $('qr-overlay').classList.add('hidden'); },

  printQr() {
    const b       = this._qrBin;
    const payload = qrPayload(b.id);
    const label   = S.qrPayloadMode === 'id' ? payload : `${window.location.origin}/bin/${b.id}`;
    const pa      = $('print-area');
    pa.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; padding:16px; font-family:sans-serif; color:#000;">
        <div style="font-size:22px; font-weight:700; margin-bottom:4px;">#${b.id} · ${esc(b.attribute || b.content_type || '')}</div>
        <div style="font-size:12px; color:#555; margin-bottom:12px;">${esc(b.cabinet_id || '')} / ${esc(b.drawer_id || '')}</div>
        <div id="print-qr-inner"></div>
        <div style="font-size:9px; color:#999; margin-top:8px;">${esc(label)}</div>
      </div>`;
    new QRCode(pa.querySelector('#print-qr-inner'), {
      text: payload, width: 180, height: 180,
      colorDark: '#000', colorLight: '#fff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    setTimeout(() => window.print(), 300);
  },
});
