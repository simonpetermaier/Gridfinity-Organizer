'use strict';

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

function toast(msg, ms = 2000) {
  const el = $('toast');
  el.textContent = msg;
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
  tab:           'inventory',   // inventory | locations | box-types | search
  locations:     [],
  boxTypes:      [],
  bins:          [],
  locFilter:     '',
  typeFilter:    '',
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
