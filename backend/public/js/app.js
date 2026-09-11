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

// Per-browser sidebar customization (order + on/off) — same persistence
// pattern as Theme (localStorage, no server round-trip). Stored as an
// ordered [{id, hidden}] list; NAV stays the source of truth for
// label/icon so a future NAV addition just appears (visible, at the end)
// without needing a migration.
const MenuItems = {
  STORAGE_KEY: 'gridfinity:menuItems',

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const parsed = raw && JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  },
  save(list) {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list)); } catch {}
  },

  // Full list (visible + hidden) in display order, NAV's label/icon merged in.
  list() {
    const saved = this.load();
    if (!saved) return NAV.map(n => ({ ...n, hidden: false }));
    const byId = Object.fromEntries(NAV.map(n => [n.id, n]));
    const seen = new Set();
    const result = [];
    for (const s of saved) {
      const n = byId[s.id];
      if (!n) continue; // stale id (e.g. removed tab) — drop it
      result.push({ ...n, hidden: !!s.hidden });
      seen.add(s.id);
    }
    for (const n of NAV) if (!seen.has(n.id)) result.push({ ...n, hidden: false });
    return result;
  },
  visible() { return this.list().filter(n => !n.hidden); },

  toggle(id) {
    this.save(this.list().map(n => n.id === id ? { id: n.id, hidden: !n.hidden } : { id: n.id, hidden: n.hidden }));
  },
  move(id, dir) {
    const list = this.list();
    const i = list.findIndex(n => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.save(list.map(({ id, hidden }) => ({ id, hidden })));
  },
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

    // Some views (inventory) restructure their DOM rather than just their
    // CSS between phone and tablet/desktop — re-render on crossing that
    // breakpoint so resizing/rotating doesn't leave a stale layout.
    window.matchMedia('(max-width: 768px)').addEventListener('change', () => this.render());
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
          ${MenuItems.visible().map(n => `
            <button class="nav-item ${S.tab === n.id ? 'active' : ''}"
                    onclick="App.switchTab('${n.id}')"
                    ${S.tab === n.id ? 'aria-current="page"' : ''}>
              <span class="nav-ico">${icon(n.icon, 16)}</span>
              <span>${n.label}</span>
            </button>`).join('')}
        </nav>
        <div class="sidebar-spacer"></div>
        <button class="nav-item settings-btn" onclick="App.showSettings()" aria-label="Settings">
          <span class="nav-ico">${icon('settings', 16)}</span>
          <span>Settings</span>
        </button>
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
        ${isMobile() ? `<button class="icon-btn topbar-settings-btn" onclick="App.showSettings()" aria-label="Settings">${icon('settings', 18)}</button>` : ''}
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

  SETTINGS_PAGES: [
    { id: 'appearance', label: 'Appearance' },
    { id: 'menu-items', label: 'Menu Items' },
  ],

  showSettings() { this.openModal('Settings', this._settingsBody()); },

  setSettingsTab(id) {
    S.settingsTab = id;
    $('modal-body').innerHTML = this._settingsBody();
  },

  _settingsBody() {
    return `
      <div class="settings-layout">
        <nav class="settings-nav">
          ${this.SETTINGS_PAGES.map(p => `
            <button class="settings-nav-item ${S.settingsTab === p.id ? 'active' : ''}" onclick="App.setSettingsTab('${p.id}')">
              ${esc(p.label)}
            </button>`).join('')}
        </nav>
        <div class="settings-page">
          ${this._settingsPage()}
        </div>
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--line-soft); margin:24px -20px -16px; padding:16px 20px 12px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>`;
  },

  _settingsPage() {
    switch (S.settingsTab) {
      case 'menu-items': return this._settingsMenuItemsPage();
      case 'appearance':
      default:           return this._settingsAppearancePage();
    }
  },

  // Re-render the app (so the sidebar/bottom nav picks up the change) and
  // refresh the modal body in place (it lives outside #root, so App.render()
  // alone wouldn't touch it).
  _refreshSettings() {
    this.render();
    const body = $('modal-body');
    if (body) body.innerHTML = this._settingsBody();
  },

  _settingsAppearancePage() {
    const current = Theme.current();
    const opt = (id, label, iconName) => `
      <button class="pill ${current === id ? 'active' : ''}" onclick="Theme.apply('${id}');App._refreshSettings()">
        ${icon(iconName, 12)} ${label}
      </button>`;
    return `
      <div class="field-label" style="margin-bottom:10px;">Theme</div>
      <div style="display:flex; gap:8px;">
        ${opt('light', 'Light', 'sun')}
        ${opt('dark', 'Dark', 'moon')}
      </div>`;
  },

  _settingsMenuItemsPage() {
    const items = MenuItems.list();
    return `
      <div class="field-label" style="margin-bottom:10px;">Sidebar / bottom nav items</div>
      <div class="menu-items-list">
        ${items.map((it, i) => `
          <div class="menu-item-row ${it.hidden ? 'is-hidden' : ''}">
            <input type="checkbox" ${it.hidden ? '' : 'checked'}
                   onchange="MenuItems.toggle('${it.id}');App._refreshSettings()"
                   aria-label="Show ${esc(it.label)}">
            <span class="nav-ico">${icon(it.icon, 16)}</span>
            <span class="menu-item-label">${esc(it.label)}</span>
            <div class="menu-item-sort">
              <button class="icon-btn" style="transform:rotate(-90deg);" ${i === 0 ? 'disabled' : ''}
                      onclick="MenuItems.move('${it.id}',-1);App._refreshSettings()" aria-label="Move ${esc(it.label)} up">
                ${icon('chevron', 14)}
              </button>
              <button class="icon-btn" style="transform:rotate(90deg);" ${i === items.length - 1 ? 'disabled' : ''}
                      onclick="MenuItems.move('${it.id}',1);App._refreshSettings()" aria-label="Move ${esc(it.label)} down">
                ${icon('chevron', 14)}
              </button>
            </div>
          </div>`).join('')}
      </div>`;
  },

  // ── Modal helpers ────────────────────────────────────────────
  openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal-overlay').classList.remove('hidden');
  },
  closeModal() { $('modal-overlay').classList.add('hidden'); },
};
