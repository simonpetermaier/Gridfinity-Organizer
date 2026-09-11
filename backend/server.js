'use strict';

const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');
const { spawn } = require('child_process');
const {
  restoreIfRequested, initBackupSchedule, scheduleBackups,
  runBackup, prune,
} = require('./backup');

const app  = express();
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'gridfinity',
  user:     process.env.DB_USER     || 'gridfinity',
  password: process.env.DB_PASSWORD || 'gridfinity_pw',
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────────────
function ok(res, data)  { res.json(data); }
function err(res, e)    { console.error(e); res.status(500).json({ error: e.message }); }
function notFound(res)  { res.status(404).json({ error: 'Not found' }); }

// ── CSV helpers (used by /api/export?format=csv and /api/import) ──────
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Minimal RFC4180-ish parser: quoted fields, doubled-quote escaping, and
// either \n or \r\n line endings. Returns an array of {header: value} objects.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\r') { /* swallow, \n follows */ }
    else if (c === '\n') pushRow();
    else field += c;
  }
  if (field.length || row.length) pushRow();
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.length > 1 || r[0] !== '')
    .map(r => Object.fromEntries(header.map((h, idx) => [h, (r[idx] ?? '').trim()])));
}

// Idempotent schema upgrade for existing DBs (init.sql only runs on a fresh
// volume). Creates new tables if missing and seeds them only when empty —
// user deletions are preserved across restarts.
async function ensureSchema() {
  // Key/value store for runtime-mutable settings. Currently just qr_payload_mode
  // but a stable home for future flags (theme defaults, retention overrides, …).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   VARCHAR(64) PRIMARY KEY,
      value TEXT
    )
  `);
  // Seed qr_payload_mode from the env var on first boot only. After that the
  // DB row wins — changing QR_PAYLOAD_MODE in compose doesn't override the
  // user's choice from the UI.
  const envMode = (process.env.QR_PAYLOAD_MODE || 'url').toLowerCase();
  const seedMode = envMode === 'id' ? 'id' : 'url';
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('qr_payload_mode', $1)
       ON CONFLICT (key) DO NOTHING`,
    [seedMode]
  );

  // Same pattern for the backup interval: BACKUP_INTERVAL_DAYS only seeds
  // app_settings on first boot. After that, the DB row wins — see
  // scheduleBackups() in backup.js for how the UI's changes take effect
  // without a restart.
  const envInterval = parseInt(process.env.BACKUP_INTERVAL_DAYS, 10);
  const seedInterval = Number.isFinite(envInterval) && envInterval >= 0 ? envInterval : 0;
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('backup_interval_days', $1)
       ON CONFLICT (key) DO NOTHING`,
    [String(seedInterval)]
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_types (
      id   SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE
    )
  `);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM content_types');
  if (rows[0].n === 0) {
    await pool.query(`
      INSERT INTO content_types (name) VALUES
        ('Bolt'),('Nut'),('Washer'),('Screw'),('Connector'),
        ('Cable'),('Tool'),('Electronics'),('Spring'),('Bearing'),('Insert')
      ON CONFLICT DO NOTHING
    `);
  }

  // One-shot: promote bins.content_type (VARCHAR) → bins.content_type_id (FK).
  // Guarded by the presence of the legacy column, so it never runs twice.
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'bins' AND column_name IN ('content_type', 'content_type_id')
  `);
  const hasLegacy = cols.rows.some(c => c.column_name === 'content_type');
  const hasFK     = cols.rows.some(c => c.column_name === 'content_type_id');
  if (hasLegacy) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!hasFK) {
        await client.query(`
          ALTER TABLE bins ADD COLUMN content_type_id INT
            REFERENCES content_types(id) ON DELETE SET NULL
        `);
      }
      // Seed catalog with every distinct legacy string, then point bins at the FK.
      await client.query(`
        INSERT INTO content_types (name)
        SELECT DISTINCT content_type FROM bins
        WHERE content_type IS NOT NULL AND content_type <> ''
        ON CONFLICT DO NOTHING
      `);
      await client.query(`
        UPDATE bins SET content_type_id = ct.id
        FROM content_types ct WHERE bins.content_type = ct.name
      `);
      await client.query(`DROP INDEX IF EXISTS idx_bins_content`);
      await client.query(`ALTER TABLE bins DROP COLUMN content_type`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_bins_content_type_id ON bins(content_type_id)`);
      await client.query('COMMIT');
      console.log('Migrated bins.content_type → bins.content_type_id');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ── bin_items table ───────────────────────────────────────────
  // A divided box can hold up to `box_types.compartments` items;
  // undivided boxes hold exactly one. Each item gets its own row.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bin_items (
      id              SERIAL PRIMARY KEY,
      bin_id          INT NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
      slot            INT NOT NULL,
      content_type_id INT REFERENCES content_types(id) ON DELETE SET NULL,
      attribute       VARCHAR(255),
      notes           TEXT,
      updated_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE(bin_id, slot)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bin_items_bin ON bin_items(bin_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bin_items_content_type ON bin_items(content_type_id)`);

  // One-shot: move legacy bins.{content_type_id,attribute,notes} into
  // bin_items (slot 0), then drop the columns. Guarded by presence of
  // the legacy column so it never runs twice.
  const itemCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'bins' AND column_name IN ('content_type_id', 'attribute', 'notes')
  `);
  if (itemCols.rows.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO bin_items (bin_id, slot, content_type_id, attribute, notes, updated_at)
        SELECT id, 0, content_type_id, attribute, notes, COALESCE(updated_at, NOW())
        FROM bins
        WHERE content_type_id IS NOT NULL
           OR (attribute IS NOT NULL AND attribute <> '')
           OR (notes IS NOT NULL AND notes <> '')
        ON CONFLICT DO NOTHING
      `);
      await client.query(`DROP INDEX IF EXISTS idx_bins_content_type_id`);
      await client.query(`ALTER TABLE bins DROP COLUMN IF EXISTS content_type_id`);
      await client.query(`ALTER TABLE bins DROP COLUMN IF EXISTS attribute`);
      await client.query(`ALTER TABLE bins DROP COLUMN IF EXISTS notes`);
      await client.query('COMMIT');
      console.log('Migrated bins.{content_type_id,attribute,notes} → bin_items');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

// Resolve a free-form content_type string to a content_types.id.
// Creates a new catalog row if the name isn't already present so the bin form's
// datalist can keep accepting arbitrary text without a separate "Add" step.
async function resolveContentTypeId(client, raw) {
  const name = (raw || '').trim();
  if (!name) return null;
  const found = await client.query('SELECT id FROM content_types WHERE name=$1', [name]);
  if (found.rows.length) return found.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO content_types (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    [name]
  );
  return inserted.rows[0].id;
}

// Cap on how many bin_items a bin may hold. Undivided / unknown box
// types are treated as single-compartment.
async function getCapacity(client, boxTypeId) {
  if (!boxTypeId) return 1;
  const r = await client.query(
    'SELECT is_divided, compartments FROM box_types WHERE id = $1',
    [boxTypeId]
  );
  if (!r.rows.length) return 1;
  return r.rows[0].is_divided ? Math.max(1, r.rows[0].compartments || 1) : 1;
}

// Replace the items list for a bin in a single transaction step.
// The caller is responsible for the surrounding BEGIN/COMMIT.
async function replaceBinItems(client, binId, items, capacity) {
  const trimmed = (items || [])
    .map(it => ({
      content_type: (it.content_type || '').trim(),
      attribute:    (it.attribute    || '').trim(),
      notes:        (it.notes        || '').trim(),
    }))
    // Drop entirely empty entries — the user may have submitted a form
    // with an empty trailing row.
    .filter(it => it.content_type || it.attribute || it.notes);
  if (trimmed.length > capacity) {
    throw new Error(`This box type allows at most ${capacity} item${capacity === 1 ? '' : 's'} (got ${trimmed.length})`);
  }
  await client.query('DELETE FROM bin_items WHERE bin_id = $1', [binId]);
  for (let i = 0; i < trimmed.length; i++) {
    const ctId = await resolveContentTypeId(client, trimmed[i].content_type);
    await client.query(
      `INSERT INTO bin_items (bin_id, slot, content_type_id, attribute, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [binId, i, ctId, trimmed[i].attribute || null, trimmed[i].notes || null]
    );
  }
}

// Common JSON-aggregation expression for items belonging to a bin.
// Inlines as a scalar subquery on bins.id; safe to reuse anywhere.
const BIN_ITEMS_JSON = `
  COALESCE((
    SELECT json_agg(json_build_object(
             'id',              bi.id,
             'slot',            bi.slot,
             'content_type_id', bi.content_type_id,
             'content_type',    ct.name,
             'attribute',       bi.attribute,
             'notes',           bi.notes
           ) ORDER BY bi.slot)
    FROM bin_items bi
    LEFT JOIN content_types ct ON bi.content_type_id = ct.id
    WHERE bi.bin_id = b.id
  ), '[]'::json) AS items`;

// ============================================================
// LOCATIONS
// ============================================================
app.get('/api/locations', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM locations ORDER BY cabinet_id, drawer_id'
    );
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

app.get('/api/locations/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM locations WHERE id=$1', [req.params.id]);
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.post('/api/locations', async (req, res) => {
  const { cabinet_id, drawer_id, grid_columns, grid_rows, vertical_space_u, attributes } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO locations (cabinet_id, drawer_id, grid_columns, grid_rows, vertical_space_u, attributes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [cabinet_id, drawer_id, grid_columns || 5, grid_rows || 5, vertical_space_u || 6, attributes]
    );
    ok(res, r.rows[0]);
  } catch (e) { err(res, e); }
});

app.put('/api/locations/:id', async (req, res) => {
  const { cabinet_id, drawer_id, grid_columns, grid_rows, vertical_space_u, attributes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE locations SET cabinet_id=$1, drawer_id=$2, grid_columns=$3, grid_rows=$4,
       vertical_space_u=$5, attributes=$6 WHERE id=$7 RETURNING *`,
      [cabinet_id, drawer_id, grid_columns, grid_rows, vertical_space_u, attributes, req.params.id]
    );
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.delete('/api/locations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM locations WHERE id=$1', [req.params.id]);
    ok(res, { success: true });
  } catch (e) { err(res, e); }
});

// Bins inside a specific drawer (for grid visualisation)
app.get('/api/locations/:id/bins', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*, bt.name AS box_type_name, bt.is_divided, bt.compartments,
              ${BIN_ITEMS_JSON}
       FROM bins b
       LEFT JOIN box_types bt ON b.box_type_id = bt.id
       WHERE b.location_id = $1
       ORDER BY b.id`,
      [req.params.id]
    );
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

// ============================================================
// BOX TYPES
// ============================================================
app.get('/api/box-types', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM box_types ORDER BY name');
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

app.post('/api/box-types', async (req, res) => {
  const { name, grid_width, grid_length, grid_height_u, is_divided, compartments, description } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO box_types (name, grid_width, grid_length, grid_height_u, is_divided, compartments, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, grid_width || 1, grid_length || 1, grid_height_u || 3, is_divided || false, compartments || 1, description]
    );
    ok(res, r.rows[0]);
  } catch (e) { err(res, e); }
});

app.put('/api/box-types/:id', async (req, res) => {
  const { name, grid_width, grid_length, grid_height_u, is_divided, compartments, description } = req.body;
  try {
    const r = await pool.query(
      `UPDATE box_types SET name=$1, grid_width=$2, grid_length=$3, grid_height_u=$4,
       is_divided=$5, compartments=$6, description=$7 WHERE id=$8 RETURNING *`,
      [name, grid_width, grid_length, grid_height_u, is_divided, compartments, description, req.params.id]
    );
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.delete('/api/box-types/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM box_types WHERE id=$1', [req.params.id]);
    ok(res, { success: true });
  } catch (e) { err(res, e); }
});

// ============================================================
// BINS  — /search must be registered BEFORE /:id
// ============================================================
// Search now lives at the item level — each bin_item is a row in the
// results so M5 and M3 in the same divided bin appear as two hits.
app.get('/api/bins/search', async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  try {
    const r = await pool.query(
      `SELECT bi.id        AS item_id,
              bi.slot,
              bi.attribute,
              bi.notes,
              ct.name      AS content_type,
              b.id         AS bin_id,
              b.id         AS id,       -- kept for frontend convenience
              b.grid_x, b.grid_y, b.grid_width, b.grid_length, b.height_u,
              b.box_type_id,
              l.cabinet_id, l.drawer_id,
              bt.name AS box_type_name, bt.is_divided, bt.compartments
       FROM bin_items bi
       JOIN bins b ON bi.bin_id = b.id
       LEFT JOIN locations     l  ON b.location_id  = l.id
       LEFT JOIN box_types     bt ON b.box_type_id  = bt.id
       LEFT JOIN content_types ct ON bi.content_type_id = ct.id
       WHERE LOWER(COALESCE(ct.name,''))   LIKE $1
          OR LOWER(COALESCE(bi.attribute,'')) LIKE $1
          OR LOWER(COALESCE(bi.notes,''))     LIKE $1
          OR LOWER(COALESCE(l.cabinet_id,'')) LIKE $1
          OR LOWER(COALESCE(l.drawer_id,'')) LIKE $1
       ORDER BY b.id, bi.slot`,
      [q]
    );
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

app.get('/api/bins', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*,
              l.cabinet_id, l.drawer_id,
              bt.name AS box_type_name, bt.is_divided, bt.compartments,
              ${BIN_ITEMS_JSON}
       FROM bins b
       LEFT JOIN locations l  ON b.location_id = l.id
       LEFT JOIN box_types bt ON b.box_type_id = bt.id
       ORDER BY b.id`
    );
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

app.get('/api/bins/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*,
              l.cabinet_id, l.drawer_id, l.grid_columns, l.grid_rows,
              bt.name AS box_type_name,
              bt.is_divided, bt.compartments, bt.description AS box_type_description,
              ${BIN_ITEMS_JSON}
       FROM bins b
       LEFT JOIN locations l  ON b.location_id = l.id
       LEFT JOIN box_types bt ON b.box_type_id = bt.id
       WHERE b.id = $1`,
      [req.params.id]
    );
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.post('/api/bins', async (req, res) => {
  const { location_id, grid_x, grid_y, grid_width, grid_length, height_u,
          box_type_id, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const capacity = await getCapacity(client, box_type_id);
    const r = await client.query(
      `INSERT INTO bins
         (location_id, grid_x, grid_y, grid_width, grid_length, height_u, box_type_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [location_id || null, grid_x ?? null, grid_y ?? null,
       grid_width || 1, grid_length || 1, height_u || 3,
       box_type_id || null]
    );
    await replaceBinItems(client, r.rows[0].id, items, capacity);
    await client.query('COMMIT');
    // Fetch the canonical row (with items aggregate) for the response.
    const out = await pool.query(
      `SELECT b.*, ${BIN_ITEMS_JSON} FROM bins b WHERE b.id = $1`,
      [r.rows[0].id]
    );
    ok(res, out.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    err(res, e);
  } finally {
    client.release();
  }
});

app.put('/api/bins/:id', async (req, res) => {
  const { location_id, grid_x, grid_y, grid_width, grid_length, height_u,
          box_type_id, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const capacity = await getCapacity(client, box_type_id);
    const r = await client.query(
      `UPDATE bins SET
         location_id=$1, grid_x=$2, grid_y=$3, grid_width=$4, grid_length=$5,
         height_u=$6, box_type_id=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [location_id || null, grid_x ?? null, grid_y ?? null,
       grid_width || 1, grid_length || 1, height_u || 3,
       box_type_id || null, req.params.id]
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return notFound(res); }
    // Only replace items when the client actually sent them — keeps PUT
    // useful for "just move the bin" without touching contents.
    if (Array.isArray(items)) {
      await replaceBinItems(client, r.rows[0].id, items, capacity);
    }
    await client.query('COMMIT');
    const out = await pool.query(
      `SELECT b.*, ${BIN_ITEMS_JSON} FROM bins b WHERE b.id = $1`,
      [r.rows[0].id]
    );
    ok(res, out.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    err(res, e);
  } finally {
    client.release();
  }
});

app.delete('/api/bins/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bins WHERE id=$1', [req.params.id]);
    ok(res, { success: true });
  } catch (e) { err(res, e); }
});

// ============================================================
// CONTENT TYPES  (user-editable catalog for the bin-form datalist)
// ============================================================
app.get('/api/content-types', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM content_types ORDER BY name');
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

app.post('/api/content-types', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await pool.query(
      'INSERT INTO content_types (name) VALUES ($1) RETURNING *', [name]
    );
    ok(res, r.rows[0]);
  } catch (e) { err(res, e); }
});

// Renames are atomic now that bins.content_type_id references content_types(id).
app.put('/api/content-types/:id', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await pool.query(
      'UPDATE content_types SET name=$1 WHERE id=$2 RETURNING *', [name, req.params.id]
    );
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.delete('/api/content-types/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM content_types WHERE id=$1', [req.params.id]);
    ok(res, { success: true });
  } catch (e) { err(res, e); }
});

// ============================================================
// CLIENT CONFIG — runtime-mutable settings persisted in
// app_settings. The env var QR_PAYLOAD_MODE only seeds the
// initial value on a fresh DB; after that, the UI is the
// source of truth.
// ============================================================
app.get('/api/config', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'qr_payload_mode'`
    );
    const mode = r.rows[0]?.value || 'url';
    ok(res, { qrPayloadMode: mode === 'id' ? 'id' : 'url' });
  } catch (e) { err(res, e); }
});

app.put('/api/config', async (req, res) => {
  const { qrPayloadMode } = req.body || {};
  if (qrPayloadMode !== 'url' && qrPayloadMode !== 'id') {
    return res.status(400).json({ error: 'qrPayloadMode must be "url" or "id"' });
  }
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('qr_payload_mode', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [qrPayloadMode]
    );
    ok(res, { qrPayloadMode });
  } catch (e) { err(res, e); }
});

// ============================================================
// DATABASE — backup schedule + manual backup, and export/import.
// ============================================================

// Backup interval, persisted the same way as qr_payload_mode above.
// Changing it reschedules backup.js's timer immediately in-process —
// no container restart needed (see scheduleBackups() in backup.js).
app.get('/api/backup/settings', async (_req, res) => {
  try {
    const r = await pool.query(`SELECT value FROM app_settings WHERE key = 'backup_interval_days'`);
    const intervalDays = r.rows[0] ? parseInt(r.rows[0].value, 10) : 0;
    ok(res, { intervalDays: Number.isFinite(intervalDays) ? intervalDays : 0 });
  } catch (e) { err(res, e); }
});

app.put('/api/backup/settings', async (req, res) => {
  const intervalDays = parseInt(req.body?.intervalDays, 10);
  if (!Number.isFinite(intervalDays) || intervalDays < 0) {
    return res.status(400).json({ error: 'intervalDays must be a non-negative integer' });
  }
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('backup_interval_days', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(intervalDays)]
    );
    scheduleBackups(intervalDays);
    ok(res, { intervalDays });
  } catch (e) { err(res, e); }
});

app.post('/api/backup/create', async (_req, res) => {
  try {
    const file = await runBackup('manual');
    prune();
    ok(res, { success: true, file: path.basename(file) });
  } catch (e) { err(res, e); }
});

// Export: SQL is a full pg_dump streamed straight to the response (the
// same shape as the on-disk backups, minus the disk round-trip). CSV is a
// flattened one-row-per-item sheet — spreadsheet-friendly, not a full
// schema dump — matched by /api/import below.
app.get('/api/export', async (req, res) => {
  const format = (req.query.format || 'sql').toLowerCase();
  const stamp = new Date().toISOString().replace(/\..*$/, 'Z').replace(/:/g, '-');

  if (format === 'sql') {
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="gridfinity-export-${stamp}.sql"`);
    const proc = spawn('pg_dump', [
      '-h', process.env.DB_HOST || 'postgres',
      '-p', String(process.env.DB_PORT || 5432),
      '-U', process.env.DB_USER || 'gridfinity',
      '-d', process.env.DB_NAME || 'gridfinity',
      '--no-owner', '--no-acl', '--clean', '--if-exists',
    ], { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' } });
    proc.stdout.pipe(res);
    proc.stderr.on('data', d => console.error('[export] pg_dump:', d.toString().trim()));
    proc.on('error', e => { if (!res.headersSent) err(res, e); });
    return;
  }

  if (format === 'csv') {
    try {
      const r = await pool.query(`
        SELECT b.id AS bin_id, bt.name AS box_type, l.cabinet_id AS cabinet, l.drawer_id AS drawer,
               b.grid_x, b.grid_y, bi.slot, ct.name AS content_type, bi.attribute, bi.notes
        FROM bin_items bi
        JOIN bins b            ON b.id = bi.bin_id
        LEFT JOIN box_types bt ON bt.id = b.box_type_id
        LEFT JOIN locations l  ON l.id = b.location_id
        LEFT JOIN content_types ct ON ct.id = bi.content_type_id
        ORDER BY b.id, bi.slot
      `);
      const header = ['bin_id', 'box_type', 'cabinet', 'drawer', 'grid_x', 'grid_y', 'slot', 'content_type', 'attribute', 'notes'];
      const lines = [header.join(',')];
      for (const row of r.rows) lines.push(header.map(h => csvEscape(row[h])).join(','));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="gridfinity-export-${stamp}.csv"`);
      res.send(lines.join('\n'));
    } catch (e) { err(res, e); }
    return;
  }

  res.status(400).json({ error: 'format must be "sql" or "csv"' });
});

// Import: additive only — never updates or deletes existing rows. Each CSV
// row (matching the export shape above) creates one new bin + item. A row
// is skipped (not guessed at) when its box type or drawer doesn't already
// exist, and a bin is placed unplaced (no grid position) rather than
// overwriting another bin if its recorded position is already occupied.
// Accepts the raw CSV as the request body (any content-type — the frontend
// sends it as plain text from a File, not multipart).
app.post('/api/import', express.text({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : '';
  if (!csv.trim()) return res.status(400).json({ error: 'Empty CSV body' });

  const client = await pool.connect();
  try {
    const rows = parseCsv(csv);
    let imported = 0;
    const skipped = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNo = i + 2; // header is line 1
      const boxTypeName = row.box_type || '';
      const cabinet = row.cabinet || '';
      const drawer = row.drawer || '';
      if (!boxTypeName || !cabinet || !drawer) {
        skipped.push({ line: lineNo, reason: 'missing box_type, cabinet, or drawer' });
        continue;
      }

      const bt = await client.query('SELECT * FROM box_types WHERE name = $1', [boxTypeName]);
      if (!bt.rows.length) {
        skipped.push({ line: lineNo, reason: `unknown box type "${boxTypeName}"` });
        continue;
      }
      const boxType = bt.rows[0];

      const loc = await client.query(
        'SELECT * FROM locations WHERE cabinet_id = $1 AND drawer_id = $2', [cabinet, drawer]
      );
      if (!loc.rows.length) {
        skipped.push({ line: lineNo, reason: `unknown drawer "${cabinet} / ${drawer}"` });
        continue;
      }
      const location = loc.rows[0];

      let gx = row.grid_x !== '' ? parseInt(row.grid_x, 10) : null;
      let gy = row.grid_y !== '' ? parseInt(row.grid_y, 10) : null;
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) { gx = null; gy = null; }

      if (gx != null && gy != null) {
        // Never overwrite/collide with an existing bin — fall back to
        // unplaced instead, so an import can only add, never disturb.
        const existing = await client.query(
          'SELECT grid_x, grid_y, grid_width, grid_length FROM bins WHERE location_id = $1 AND grid_x IS NOT NULL',
          [location.id]
        );
        const collides = existing.rows.some(b =>
          gx < b.grid_x + b.grid_width && gx + boxType.grid_width > b.grid_x &&
          gy < b.grid_y + b.grid_length && gy + boxType.grid_length > b.grid_y
        );
        if (collides) { gx = null; gy = null; }
      }

      const binIns = await client.query(
        `INSERT INTO bins (location_id, grid_x, grid_y, grid_width, grid_length, height_u, box_type_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [location.id, gx, gy, boxType.grid_width, boxType.grid_length, boxType.grid_height_u, boxType.id]
      );
      const binId = binIns.rows[0].id;

      const contentTypeId = row.content_type ? await resolveContentTypeId(client, row.content_type) : null;
      const slot = row.slot !== '' && Number.isFinite(parseInt(row.slot, 10)) ? parseInt(row.slot, 10) : 0;
      await client.query(
        `INSERT INTO bin_items (bin_id, slot, content_type_id, attribute, notes) VALUES ($1,$2,$3,$4,$5)`,
        [binId, slot, contentTypeId, row.attribute || null, row.notes || null]
      );
      imported++;
    }

    ok(res, { imported, skipped });
  } catch (e) { err(res, e); }
  finally { client.release(); }
});

// ── SPA catch-all ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3000');
// Boot order: restore (one-shot, if RESTORE_FROM set) → schema migrations →
// startup dump → read the persisted interval and start the recurring
// schedule → listen. Any failure aborts so the container doesn't serve
// traffic against a half-initialised DB.
restoreIfRequested()
  .then(() => ensureSchema())
  .then(() => initBackupSchedule())
  .then(async () => {
    const r = await pool.query(`SELECT value FROM app_settings WHERE key = 'backup_interval_days'`);
    const days = r.rows[0] ? parseInt(r.rows[0].value, 10) : 0;
    scheduleBackups(Number.isFinite(days) ? days : 0);
  })
  .then(() => app.listen(PORT, () => console.log(`Gridfinity Organizer → http://localhost:${PORT}`)))
  .catch(e => { console.error('Startup failed:', e); process.exit(1); });
