'use strict';

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

function toast(msg, ms = 2000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('toast');
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════
const api = {
  async req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch('/api' + path, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  get:    p      => api.req('GET',    p),
  post:   (p, b) => api.req('POST',   p, b),
  put:    (p, b) => api.req('PUT',    p, b),
  delete: p      => api.req('DELETE', p),
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const S = {
  tab:           'inventory',   // inventory | locations | box-types | content-types | search
  theme:         'light',       // light | dark — kept in sync with <html data-theme>
  selectedBinId: null,          // for the inventory split view
  locations:     [],
  boxTypes:      [],
  contentTypes:  [],
  bins:          [],
  locFilter:     '',
  typeFilter:    '',
  ctFilter:      'all',         // all | inuse  — content-types view
  searchQ:       '',
  searchResults: [],
  // grid picker state (shared for add/edit bin modals)
  grid: {
    locId:      null,
    locData:    null,
    drawerBins: [],
    selX:       null,
    selY:       null,
    hoverX:     null,
    hoverY:     null,
    bw:         1,    // bin width in grid units
    bl:         1,    // bin length in grid units
    editId:     null, // bin being edited (excluded from collision map)
  },
  // QR print buffer
  qrBin: null,
};

// ═══════════════════════════════════════════════════════════════
// BIN COLOUR PALETTE  (for drawer map)
// ═══════════════════════════════════════════════════════════════
const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#84cc16', '#e11d48', '#0ea5e9',
];
const binColor = id => PALETTE[id % PALETTE.length];

// Map a content-type name to one of the four --hue-* tokens defined in
// tokens.css. Stable across reloads and views (same name → same hue).
// Returns 0 (no hue) for empty / unset names so callers can branch on it.
function contentHue(name) {
  if (!name) return 0;
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (((h << 5) + h) + name.charCodeAt(i)) >>> 0;
  return (h % 4) + 1;
}
function hueClass(name) {
  const h = contentHue(name);
  return h ? `hue-${h}` : '';
}

// ═══════════════════════════════════════════════════════════════
// ICONS — sprite-based. Sprite is fetched once in App.init() and
// injected into <body>; afterwards `<use href="#icon-X"/>` resolves
// synchronously from the DOM. Stroke color follows currentColor.
// ═══════════════════════════════════════════════════════════════
async function injectIconSprite() {
  if (document.getElementById('gf-icon-sprite')) return;
  try {
    const r = await fetch('/icons/icons.sprite.svg');
    const text = await r.text();
    const wrap = document.createElement('div');
    wrap.id = 'gf-icon-sprite';
    wrap.style.display = 'none';
    wrap.innerHTML = text;
    document.body.insertBefore(wrap, document.body.firstChild);
  } catch (e) {
    console.warn('Icon sprite failed to load:', e);
  }
}

// Returns an inline <svg> markup that references a sprite symbol.
// Size defaults to 16 (inline with body text); pass 18, 20, etc. to
// scale. The currentColor inheritance lets you set color via the
// containing element (e.g. a button class).
function icon(name, size = 16) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
}
