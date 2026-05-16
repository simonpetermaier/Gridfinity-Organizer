'use strict';

const NAV = [
  { id: 'inventory',     label: 'Inventory',     icon: 'box' },
  { id: 'locations',     label: 'Drawers',       icon: 'drawer' },
  { id: 'box-types',     label: 'Box Types',     icon: 'grid' },
  { id: 'content-types', label: 'Content Types', icon: 'tag' },
  { id: 'search',        label: 'Search',        icon: 'search' },
  { id: 'scanner',       label: 'Scan',          icon: 'qr' },
];

const TAB_TITLE = {
  'inventory':     'Inventory',
  'locations':     'Drawers',
  'box-types':     'Box Types',
  'content-types': 'Content Types',
  'search':        'Search',
  'scanner':       'Scan',
};

const App = {

  async init() {
    // Sprite first so the first paint has icons; small file, served same-origin.
    await injectIconSprite();

    // Bin scan page (mobile, no shell) — needs config for the inline QR but
    // can skip the inventory/box/content loads.
    const m = window.location.pathname.match(/^\/bin\/(\d+)$/);
    if (m) { await this.loadConfig(); await this.renderBinScan(m[1]); return; }

    await Promise.all([
      this.loadConfig(),
      this.loadLocations(), this.loadBoxTypes(),
      this.loadContentTypes(), this.loadBins(),
    ]);
    this.render();
  },

  // Tiny client-config fetch — currently just qrPayloadMode but a stable
  // place to hang future feature flags on. Failures are non-fatal: the
  // defaults baked into S already match the server's defaults.
  async loadConfig() {
    try {
      const cfg = await api.get('/config');
      if (cfg && cfg.qrPayloadMode) S.qrPayloadMode = cfg.qrPayloadMode;
    } catch (e) {
      console.warn('Config fetch failed; using defaults:', e.message);
    }
  },

  async loadLocations()    { S.locations    = await api.get('/locations'); },
  async loadBoxTypes()     { S.boxTypes     = await api.get('/box-types'); },
  async loadContentTypes() { S.contentTypes = await api.get('/content-types'); },
  async loadBins()         { S.bins         = await api.get('/bins'); },

  // ── Top-level shell render ────────────────────────────────────
  render() {
    $('root').innerHTML = `
      <div class="shell">
        ${this.renderSidebar()}
        <div class="main">
          ${this.renderTopbar()}
          <div class="page">${this.renderTab()}</div>
        </div>
      </div>`;
  },

  renderSidebar() {
    return `
      <aside class="sidebar" aria-label="Primary">
        <div class="sidebar-brand">
          <div class="sidebar-brand-mark">${icon('brand', 20)}</div>
          <div>
            <div class="sidebar-brand-title">Gridfinity</div>
            <div class="sidebar-brand-sub">Organizer</div>
          </div>
        </div>
        <nav>
          ${NAV.map(n => `
            <button class="nav-item ${S.tab === n.id ? 'active' : ''}"
                    onclick="App.switchTab('${n.id}')"
                    ${S.tab === n.id ? 'aria-current="page"' : ''}>
              <span class="nav-ico">${icon(n.icon, 16)}</span>
              <span>${n.label}</span>
            </button>`).join('')}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-stats">
          <div class="sidebar-stats-label">This workspace</div>
          <div class="sidebar-stats-value">${S.bins.length} bins · ${S.locations.length} drawers</div>
        </div>
        <button class="theme-toggle" onclick="Theme.toggle()" aria-label="Toggle theme">
          ${icon(S.theme === 'dark' ? 'moon' : 'sun', 14)}
          <span class="lbl">Theme</span>
          <span class="state">${S.theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
      </aside>`;
  },

  renderTopbar() {
    const action = this.renderTopAction();
    return `
      <header class="topbar">
        <div class="crumbs">
          <span class="crumb">Workspace</span>
          <span class="crumb-sep">${icon('chevron', 10)}</span>
          <span class="crumb current">${TAB_TITLE[S.tab] || ''}</span>
        </div>
        <div class="topbar-spacer"></div>
        <button class="qf-pill" onclick="App.switchTab('search')" aria-label="Jump to search">
          ${icon('search', 14)}
          <span class="qf-text">Jump to a bin, drawer, or type…</span>
          <span class="kbd">/</span>
        </button>
        ${action || ''}
      </header>`;
  },

  renderTopAction() {
    const plus = icon('plus', 14);
    const btn = (label, handler, ariaLabel) =>
      `<button class="btn btn-primary" onclick="${handler}" aria-label="${ariaLabel}">${plus}<span class="btn-label">${label}</span></button>`;
    switch (S.tab) {
      case 'inventory':     return btn('Bin',      'App.showAddBin()',         'Add bin');
      case 'locations':     return btn('Drawer',   'App.showAddLocation()',    'Add drawer');
      case 'box-types':     return btn('Box Type', 'App.showAddBoxType()',     'Add box type');
      case 'content-types': return btn('Type',     'App.showAddContentType()', 'Add content type');
      default:              return '';
    }
  },

  renderTab() {
    switch (S.tab) {
      case 'inventory':     return this.renderInventory();
      case 'locations':     return this.renderLocations();
      case 'box-types':     return this.renderBoxTypes();
      case 'content-types': return this.renderContentTypes();
      case 'search':        return this.renderSearch();
      case 'scanner':       return this.renderScanner();
    }
  },

  // Stop the camera stream whenever the user switches tabs.
  switchTab(tab) {
    if (S.tab === 'scanner' && tab !== 'scanner' && typeof Scanner !== 'undefined') Scanner.stop();
    S.tab = tab;
    if (tab !== 'inventory') S.selectedBinId = null;
    this.render();
  },

  // Flip QR payload mode (persisted server-side). Affects every QR rendered
  // from now on; existing printed stickers in either format keep working
  // since the in-app scanner accepts both.
  async setQrMode(mode) {
    if (mode !== 'url' && mode !== 'id') return;
    if (S.qrPayloadMode === mode) return;
    try {
      const r = await api.put('/config', { qrPayloadMode: mode });
      S.qrPayloadMode = r.qrPayloadMode;
      this.render();
      toast(`QR mode set to ${mode === 'id' ? 'gfbin:N (host-portable)' : 'Full URL'}`);
    } catch (e) {
      alert('Failed to update QR mode: ' + e.message);
    }
  },

  // ── Modal helpers ────────────────────────────────────────────
  openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal-overlay').classList.remove('hidden');
  },
  closeModal() { $('modal-overlay').classList.add('hidden'); },
};
