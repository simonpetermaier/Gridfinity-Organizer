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

    // Every route under /api requires a session — including the bin-scan
    // page's data — so this gate covers the whole app, QR scanning included.
    // Not logged in? Show the login form (or, on a fresh install with no
    // users yet, the one-time "create admin account" screen) regardless of
    // what URL was opened.
    if (!(await this.checkAuth())) {
      if (S.needsSetup) this.renderSetup(); else this.renderLogin();
      return;
    }

    // Bin scan page (mobile, no shell) — needs config for the inline QR but
    // can skip the inventory/box/content loads.
    const m = window.location.pathname.match(/^\/bin\/(\d+)$/);
    if (m) { await this.loadConfig(); await this.renderBinScan(m[1]); return; }

    await Promise.all([
      this.loadConfig(), this.loadBackupSettings(),
      this.loadLocations(), this.loadBoxTypes(),
      this.loadContentTypes(), this.loadBins(),
    ]);
    this.render();

    // Some views (inventory) restructure their DOM rather than just their
    // CSS between phone and tablet/desktop — re-render on crossing that
    // breakpoint so resizing/rotating doesn't leave a stale layout.
    window.matchMedia('(max-width: 768px)').addEventListener('change', () => this.render());
  },

  async checkAuth() {
    try {
      const r = await api.get('/auth/me');
      S.currentUser = (r && r.user) || null;
      S.needsSetup = !!(r && r.needsSetup);
    } catch (e) {
      S.currentUser = null;
      S.needsSetup = false;
    }
    return !!S.currentUser;
  },

  // One-time screen shown only while the users table is empty — creates
  // the first (and only API-reachable) admin account.
  renderSetup(error) {
    $('root').innerHTML = `
      <div class="login-screen">
        <form class="login-card" onsubmit="App.setup(event)">
          <div class="login-brand">
            <div class="sidebar-brand-mark">${icon('brand', 22)}</div>
            <div>
              <div class="sidebar-brand-title">Gridfinity</div>
              <div class="sidebar-brand-sub">Organizer</div>
            </div>
          </div>
          <p class="mute" style="font-size:var(--text-sm); margin:0 0 16px;">
            No account exists yet. Create the admin account to get started.
          </p>
          <label class="field-label">Username</label>
          <input class="input" id="login-username" autocomplete="username" required>
          <label class="field-label" style="margin-top:12px;">Password</label>
          <input class="input" id="login-password" type="password" autocomplete="new-password" required>
          ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
          <button class="btn btn-primary" type="submit" style="margin-top:18px; width:100%;">Create admin account</button>
        </form>
      </div>`;
    $('login-username')?.focus();
  },

  async setup(e) {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    try {
      const r = await api.post('/auth/setup', { username, password });
      S.currentUser = r.user;
      S.needsSetup = false;
      await this.init();
    } catch (setupErr) {
      this.renderSetup(setupErr.message || 'Setup failed');
    }
  },

  // mode: 'login' (default) or 'signup' — same screen, toggled by the link
  // at the bottom. Signup always creates a 'viewer' account server-side
  // regardless of anything the client sends.
  renderLogin({ mode = 'login', error } = {}) {
    const isSignup = mode === 'signup';
    $('root').innerHTML = `
      <div class="login-screen">
        <form class="login-card" onsubmit="App.${isSignup ? 'signup' : 'login'}(event)">
          <div class="login-brand">
            <div class="sidebar-brand-mark">${icon('brand', 22)}</div>
            <div>
              <div class="sidebar-brand-title">Gridfinity</div>
              <div class="sidebar-brand-sub">Organizer</div>
            </div>
          </div>
          <label class="field-label">Username</label>
          <input class="input" id="login-username" autocomplete="username" required>
          <label class="field-label" style="margin-top:12px;">Password</label>
          <input class="input" id="login-password" type="password"
                 autocomplete="${isSignup ? 'new-password' : 'current-password'}" required>
          ${isSignup ? `<p class="mute" style="font-size:var(--text-xs); margin:4px 0 0;">New accounts are read-only (Viewer) — an admin can upgrade one later.</p>` : ''}
          ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
          <button class="btn btn-primary" type="submit" style="margin-top:18px; width:100%;">
            ${isSignup ? 'Create account' : 'Log in'}
          </button>
          <p class="mute" style="font-size:var(--text-xs); text-align:center; margin:16px 0 0;">
            ${isSignup
              ? `Already have an account? <a href="#" onclick="event.preventDefault();App.renderLogin();">Log in</a>`
              : `Need an account? <a href="#" onclick="event.preventDefault();App.renderLogin({mode:'signup'});">Sign up</a>`}
          </p>
        </form>
      </div>`;
    $('login-username')?.focus();
  },

  async login(e) {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    try {
      const r = await api.post('/auth/login', { username, password });
      S.currentUser = r.user;
      await this.init();
    } catch (loginErr) {
      this.renderLogin({ error: loginErr.message || 'Login failed' });
    }
  },

  async signup(e) {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    try {
      const r = await api.post('/auth/signup', { username, password });
      S.currentUser = r.user;
      await this.init();
    } catch (signupErr) {
      this.renderLogin({ mode: 'signup', error: signupErr.message || 'Sign up failed' });
    }
  },

  async logout() {
    try { await api.post('/auth/logout'); } catch (e) { /* logging out anyway */ }
    window.location.href = '/';
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

  // Settings → Database → Backup's interval field. Failures are non-fatal:
  // the default baked into S (0) just means the field shows "disabled"
  // until the fetch succeeds.
  async loadBackupSettings() {
    try {
      const r = await api.get('/backup/settings');
      if (r && Number.isFinite(r.intervalDays)) S.backupIntervalDays = r.intervalDays;
    } catch (e) {
      console.warn('Backup settings fetch failed; using defaults:', e.message);
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
          <div class="page" id="page-content">${this.renderTab()}</div>
        </div>
      </div>`;
  },

  // Re-renders only the current tab's content, leaving the topbar (and the
  // quick-filter input's focus/cursor) untouched — used on every keystroke
  // in the quick-filter box, where a full render() would steal focus.
  refreshPage() {
    const el = $('page-content');
    if (el) el.innerHTML = this.renderTab();
  },

  setQuickFilter(v) {
    S.quickFilter = v;
    this.refreshPage();
  },

  // Used by the clear (×) button rather than setQuickFilter: a full render()
  // is safe here (focus already left the input when the button was
  // clicked) and it's needed to update the input's displayed value and
  // swap the clear button back out for the "/" hint.
  clearQuickFilter() {
    S.quickFilter = '';
    this.render();
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
        <div class="qf-pill">
          ${icon('search', 14)}
          <input class="qf-text" type="text" placeholder="Filter this page…"
                 value="${esc(S.quickFilter)}" oninput="App.setQuickFilter(this.value)"
                 aria-label="Filter items on this page">
          ${S.quickFilter
            ? `<button class="qf-clear" onclick="App.clearQuickFilter()" aria-label="Clear filter">${icon('close', 12)}</button>`
            : `<span class="kbd">/</span>`}
        </div>
        ${isMobile() ? `<button class="icon-btn topbar-settings-btn" onclick="App.showSettings()" aria-label="Settings">${icon('settings', 18)}</button>` : ''}
        ${action || ''}
      </header>`;
  },

  renderTopAction() {
    if (S.currentUser?.role !== 'admin') return ''; // viewers are read-only; nothing here would do anything but 403
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
    { id: 'account',    label: 'Account' },
  ],
  SETTINGS_DATABASE_PAGES: [
    { id: 'db-backup',        label: 'Backup' },
    { id: 'db-export-import', label: 'Export / Import' },
  ],
  SETTINGS_ACCESS_PAGES: [
    { id: 'access-users', label: 'Users' },
  ],

  showSettings() { this.openModal('Settings', this._settingsBody()); },

  setSettingsTab(id) {
    S.settingsTab = id;
    $('modal-body').innerHTML = this._settingsBody();
    if (id === 'access-users' && S.users == null) this.refreshUsers();
  },

  _settingsBody() {
    const navItem = p => `
      <button class="settings-nav-item ${S.settingsTab === p.id ? 'active' : ''}" onclick="App.setSettingsTab('${p.id}')">
        ${esc(p.label)}
      </button>`;
    // Backups, export/import, and user management are all mutating/admin
    // surfaces — the server already rejects them for viewers, but there's
    // no reason to show a viewer buttons that only ever 403.
    const isAdmin = S.currentUser?.role === 'admin';
    return `
      <div class="settings-layout">
        <nav class="settings-nav">
          ${this.SETTINGS_PAGES.map(navItem).join('')}
          ${isAdmin ? `
            <div class="settings-nav-divider"></div>
            <div class="settings-nav-heading">Database</div>
            ${this.SETTINGS_DATABASE_PAGES.map(navItem).join('')}
            <div class="settings-nav-divider"></div>
            <div class="settings-nav-heading">Access</div>
            ${this.SETTINGS_ACCESS_PAGES.map(navItem).join('')}
          ` : ''}
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
    const isAdmin = S.currentUser?.role === 'admin';
    switch (S.settingsTab) {
      case 'menu-items':       return this._settingsMenuItemsPage();
      case 'account':          return this._settingsAccountPage();
      case 'db-backup':        return isAdmin ? this._settingsBackupPage() : this._settingsAppearancePage();
      case 'db-export-import': return isAdmin ? this._settingsExportImportPage() : this._settingsAppearancePage();
      case 'access-users':     return isAdmin ? this._settingsUsersPage() : this._settingsAppearancePage();
      case 'appearance':
      default:                 return this._settingsAppearancePage();
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

  _settingsAccountPage() {
    const u = S.currentUser || {};
    return `
      <div class="field-label" style="margin-bottom:10px;">Signed in as</div>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
        <span class="pill accent">${esc(u.username || '—')}</span>
        <span class="mute" style="font-size:var(--text-xs); text-transform:capitalize;">${esc(u.role || '')}</span>
      </div>

      <div class="field-label" style="margin-bottom:10px;">Change password</div>
      <div style="display:flex; flex-direction:column; gap:8px; max-width:280px;">
        <input class="input" type="password" id="acct-current-pw" placeholder="Current password" autocomplete="current-password">
        <input class="input" type="password" id="acct-new-pw" placeholder="New password" autocomplete="new-password">
        <button class="btn btn-secondary" onclick="App.changeOwnPassword()" style="align-self:flex-start;">Update password</button>
      </div>

      <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--line-soft);">
        <button class="btn btn-secondary" onclick="App.logout()">Log out</button>
      </div>`;
  },

  async changeOwnPassword() {
    const currentPassword = $('acct-current-pw').value;
    const newPassword = $('acct-new-pw').value;
    if (!newPassword) {
      alert('Enter a new password.');
      return;
    }
    try {
      await api.put('/auth/password', { currentPassword, newPassword });
      toast('Password updated');
      $('acct-current-pw').value = '';
      $('acct-new-pw').value = '';
    } catch (e) {
      alert('Failed to update password: ' + e.message);
    }
  },

  _settingsUsersPage() {
    if (S.users == null) return `<div class="mute" style="font-size:var(--text-sm);">Loading…</div>`;
    const isSelf = id => S.currentUser && id === S.currentUser.id;
    return `
      <div class="field-label" style="margin-bottom:10px;">Users</div>
      <div class="users-list">
        ${S.users.map(u => `
          <div class="user-row">
            <span class="user-name">${esc(u.username)}</span>
            <select class="select" style="width:110px; height:32px;"
                    onchange="App.setUserRole(${u.id}, this.value)"
                    ${isSelf(u.id) ? 'disabled title="You can\'t change your own role"' : ''}>
              <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <button class="icon-btn" title="Delete" onclick="App.deleteUser(${u.id}, '${esc(u.username).replace(/'/g, "\\'")}')">${icon('trash', 16)}</button>
          </div>`).join('') || '<div class="mute" style="font-size:var(--text-sm);">No users yet.</div>'}
      </div>

      <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--line-soft);">
        <div class="field-label" style="margin-bottom:10px;">Add user</div>
        <div style="display:flex; flex-direction:column; gap:8px; max-width:280px;">
          <input class="input" id="nu-username" placeholder="Username">
          <input class="input" type="password" id="nu-password" placeholder="Password">
          <select class="select" id="nu-role">
            <option value="viewer" selected>Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <button class="btn btn-primary" onclick="App.createUser()" style="align-self:flex-start;">Add user</button>
        </div>
      </div>`;
  },

  async refreshUsers() {
    try { S.users = await api.get('/users'); } catch (e) { S.users = []; }
    this._refreshSettings();
  },

  async createUser() {
    const username = $('nu-username').value.trim();
    const password = $('nu-password').value;
    const role = $('nu-role').value;
    if (!username || !password) {
      alert('Username and password are required.');
      return;
    }
    try {
      await api.post('/users', { username, password, role });
      toast(`User "${username}" created`);
      await this.refreshUsers();
    } catch (e) {
      alert('Failed to create user: ' + e.message);
    }
  },

  async setUserRole(id, role) {
    try {
      await api.put('/users/' + id, { role });
      toast('Role updated');
    } catch (e) {
      alert('Failed to update role: ' + e.message);
    }
    this.refreshUsers();
  },

  async deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? This can't be undone.`)) return;
    try {
      await api.delete('/users/' + id);
      toast(`User "${username}" deleted`);
      await this.refreshUsers();
    } catch (e) {
      alert('Failed to delete user: ' + e.message);
    }
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

  _settingsBackupPage() {
    return `
      <div class="field-label" style="margin-bottom:10px;">Backup interval (days)</div>
      <div style="display:flex; align-items:center; gap:10px;">
        <input class="input" type="number" min="0" step="1" style="width:100px;"
               value="${S.backupIntervalDays}"
               onchange="App.saveBackupInterval(this.value)">
        <span class="mute" style="font-size:var(--text-xs);">0 disables automatic backups</span>
      </div>
      <p class="mute" style="font-size:var(--text-xs); margin-top:8px;">
        BACKUP_INTERVAL_DAYS in docker-compose.yml is only the default for a fresh install —
        changing this here takes effect immediately and persists across restarts.
      </p>

      <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--line-soft);">
        <div class="field-label" style="margin-bottom:10px;">Manual backup</div>
        <button class="btn btn-secondary" onclick="App.createBackupNow()">Create Backup</button>
      </div>`;
  },

  async saveBackupInterval(value) {
    const days = parseInt(value, 10);
    if (!Number.isFinite(days) || days < 0) {
      alert('Enter a non-negative number of days.');
      this._refreshSettings();
      return;
    }
    try {
      const r = await api.put('/backup/settings', { intervalDays: days });
      S.backupIntervalDays = r.intervalDays;
      toast(r.intervalDays === 0
        ? 'Automatic backups disabled'
        : `Backup interval set to ${r.intervalDays} day${r.intervalDays === 1 ? '' : 's'}`);
    } catch (e) {
      alert('Failed to update backup interval: ' + e.message);
    }
    this._refreshSettings();
  },

  async createBackupNow() {
    try {
      const r = await api.post('/backup/create');
      toast(`Backup created: ${r.file}`);
    } catch (e) {
      alert('Backup failed: ' + e.message);
    }
  },

  _settingsExportImportPage() {
    const fmtBtn = (id, label) => `
      <button class="pill ${S.exportFormat === id ? 'active' : ''}" onclick="App.setExportFormat('${id}')">${label}</button>`;
    return `
      <div class="field-label" style="margin-bottom:10px;">Export format</div>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        ${fmtBtn('sql', 'SQL (full backup)')}
        ${fmtBtn('csv', 'CSV (spreadsheet)')}
      </div>
      <button class="btn btn-secondary" onclick="App.exportDatabase()">Export</button>

      <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--line-soft);">
        <div class="field-label" style="margin-bottom:6px;">Import</div>
        <p class="mute" style="font-size:var(--text-xs); margin:0 0 10px;">
          Imports a CSV in the same shape as the export above. This only adds new bins/items —
          existing data is never changed or removed. Rows naming an unknown drawer or box type are skipped.
        </p>
        <input type="file" id="import-file-input" accept=".csv,text/csv" style="display:none;"
               onchange="App.importDatabase(this.files[0])">
        <button class="btn btn-secondary" onclick="$('import-file-input').click()">Import…</button>
      </div>`;
  },

  setExportFormat(fmt) {
    S.exportFormat = fmt;
    this._refreshSettings();
  },

  exportDatabase() {
    window.location.href = '/api/export?format=' + encodeURIComponent(S.exportFormat);
  },

  async importDatabase(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const r = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.statusText);

      await Promise.all([this.loadLocations(), this.loadBoxTypes(), this.loadContentTypes(), this.loadBins()]);
      this._refreshSettings();

      const skippedMsg = data.skipped.length ? `, ${data.skipped.length} skipped` : '';
      toast(`Imported ${data.imported} item${data.imported === 1 ? '' : 's'}${skippedMsg}`);
      if (data.skipped.length) console.warn('Import skipped rows:', data.skipped);
    } catch (e) {
      alert('Import failed: ' + e.message);
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
