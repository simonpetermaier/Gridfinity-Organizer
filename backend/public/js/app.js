'use strict';

// ═══════════════════════════════════════════════════════════════
// APP NAMESPACE — view files extend this via Object.assign
// ═══════════════════════════════════════════════════════════════
const App = {

  // ── bootstrap ──────────────────────────────────────────────
  async init() {
    // Check if we're on the /bin/:id scan page
    const m = window.location.pathname.match(/^\/bin\/(\d+)$/);
    if (m) { await this.renderBinScan(m[1]); return; }

    await Promise.all([this.loadLocations(), this.loadBoxTypes(), this.loadBins()]);
    this.render();
  },

  // ── data loaders ───────────────────────────────────────────
  async loadLocations() { S.locations = await api.get('/locations'); },
  async loadBoxTypes()  { S.boxTypes  = await api.get('/box-types'); },
  async loadBins()      { S.bins      = await api.get('/bins'); },

  // ── main render ────────────────────────────────────────────
  render() {
    $('root').innerHTML = `
      <div class="min-h-screen flex flex-col">
        ${this.renderHeader()}
        <main class="flex-1 max-w-7xl mx-auto w-full px-4 py-6 fade-in">
          ${this.renderTab()}
        </main>
      </div>`;
  },

  renderHeader() {
    const tabs = [
      { id: 'inventory', icon: '📦', label: 'Inventory' },
      { id: 'locations', icon: '🗄️', label: 'Drawers'   },
      { id: 'box-types', icon: '📐', label: 'Box Types' },
      { id: 'search',    icon: '🔍', label: 'Search'    },
    ];
    return `
      <header class="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <span class="text-2xl">🗄️</span>
          <div>
            <div class="font-bold text-gray-900 leading-tight">Gridfinity Organizer</div>
            <div class="text-xs text-gray-400">Workshop inventory system</div>
          </div>
          <span class="ml-auto text-xs text-gray-400">${S.bins.length} bins · ${S.locations.length} drawers</span>
        </div>
        <div class="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
          ${tabs.map(t => `
            <button onclick="App.switchTab('${t.id}')"
              class="tab-btn px-5 py-2.5 text-sm text-gray-500 hover:text-blue-600 whitespace-nowrap transition-colors ${S.tab === t.id ? 'active' : ''}">
              ${t.icon} ${t.label}
            </button>`).join('')}
        </div>
      </header>`;
  },

  renderTab() {
    switch (S.tab) {
      case 'inventory': return this.renderInventory();
      case 'locations': return this.renderLocations();
      case 'box-types': return this.renderBoxTypes();
      case 'search':    return this.renderSearch();
    }
  },

  switchTab(tab) { S.tab = tab; this.render(); },

  // ══════════════════════════════════════════════════════════
  // MODAL HELPERS
  // ══════════════════════════════════════════════════════════
  openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal-overlay').classList.remove('hidden');
  },
  closeModal() { $('modal-overlay').classList.add('hidden'); },
};
