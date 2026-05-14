'use strict';

Object.assign(App, {

  async renderBinScan(id) {
    try {
      const b = await api.get('/bins/' + id);
      $('root').innerHTML = `
        <div class="min-h-screen bg-slate-100 flex flex-col">
          <header class="bg-white border-b px-4 py-3 flex items-center gap-2 shadow-sm">
            <span class="text-xl">🗄️</span>
            <span class="font-bold text-gray-900">Gridfinity Organizer</span>
            <a href="/" class="ml-auto text-sm text-blue-600 hover:underline">← App</a>
          </header>
          <main class="flex-1 max-w-md mx-auto w-full px-4 py-8">
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div class="bg-blue-600 px-6 py-5 text-white">
                <div class="text-xs font-medium opacity-70 mb-1 uppercase tracking-wider">Bin ID</div>
                <div class="text-5xl font-bold font-mono">#${b.id}</div>
              </div>
              <div class="p-6 space-y-5">
                <div>
                  <div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Contents</div>
                  <div class="text-2xl font-bold text-gray-900">${esc(b.attribute || '—')}</div>
                  ${b.content_type ? `<span class="mt-1 inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">${esc(b.content_type)}</span>` : ''}
                </div>
                <hr class="border-gray-100">
                <div class="grid grid-cols-2 gap-4">
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Cabinet</div>
                       <div class="font-semibold">${esc(b.cabinet_id || '—')}</div></div>
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Drawer</div>
                       <div class="font-semibold">${esc(b.drawer_id || '—')}</div></div>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Position</div>
                       <div class="font-semibold font-mono text-sm">${b.grid_x != null ? `(${b.grid_x}, ${b.grid_y})` : '—'}</div></div>
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Grid</div>
                       <div class="font-semibold font-mono text-sm">${b.grid_width}×${b.grid_length}</div></div>
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Height</div>
                       <div class="font-semibold">${b.height_u}U</div></div>
                </div>
                ${b.box_type_name ? `
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Box Type</div>
                       <div class="font-semibold">${esc(b.box_type_name)}</div>
                       ${b.is_divided ? `<div class="text-xs text-green-600 mt-0.5">Divided · ${b.compartments} compartments</div>` : ''}</div>` : ''}
                ${b.notes ? `
                  <div><div class="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Notes</div>
                       <div class="text-gray-600 text-sm">${esc(b.notes)}</div></div>` : ''}
              </div>
              <div class="bg-slate-50 flex justify-center py-5 border-t border-gray-100">
                <div id="scan-qr"></div>
              </div>
            </div>
          </main>
        </div>`;
      new QRCode($('scan-qr'), {
        text: window.location.href,
        width: 120, height: 120,
        colorDark: '#1e40af', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {
      $('root').innerHTML = `
        <div class="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <div class="text-6xl mb-4">❓</div>
          <h2 class="text-xl font-bold mb-2">Bin #${id} not found</h2>
          <p class="text-gray-500 mb-4">This bin may have been removed.</p>
          <a href="/" class="text-blue-600 hover:underline">← Back to App</a>
        </div>`;
    }
  },
});
