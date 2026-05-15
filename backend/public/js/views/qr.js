'use strict';

Object.assign(App, {

  _qrBin: null,

  async showQr(id) {
    const bin = S.bins.find(b => b.id === id) || await api.get('/bins/' + id);
    this._qrBin = bin;
    const url = `${window.location.origin}/bin/${id}`;
    $('qr-title').textContent = `Bin #${id} · ${bin.attribute || bin.content_type || 'No label'}`;
    $('qr-url').textContent   = url;
    $('qr-box').innerHTML     = '';
    $('qr-overlay').classList.remove('hidden');
    new QRCode($('qr-box'), {
      text: url, width: 200, height: 200,
      colorDark: '#000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  },

  closeQr() { $('qr-overlay').classList.add('hidden'); },

  printQr() {
    const b   = this._qrBin;
    const url = `${window.location.origin}/bin/${b.id}`;
    const pa  = $('print-area');
    pa.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; padding:16px; font-family:sans-serif; color:#000;">
        <div style="font-size:22px; font-weight:700; margin-bottom:4px;">#${b.id} · ${esc(b.attribute || b.content_type || '')}</div>
        <div style="font-size:12px; color:#555; margin-bottom:12px;">${esc(b.cabinet_id || '')} / ${esc(b.drawer_id || '')}</div>
        <div id="print-qr-inner"></div>
        <div style="font-size:9px; color:#999; margin-top:8px;">${url}</div>
      </div>`;
    new QRCode(pa.querySelector('#print-qr-inner'), {
      text: url, width: 180, height: 180,
      colorDark: '#000', colorLight: '#fff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    setTimeout(() => window.print(), 300);
  },
});
