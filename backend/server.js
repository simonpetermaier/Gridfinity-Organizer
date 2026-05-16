'use strict';

const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');
const { restoreIfRequested, initBackupSchedule } = require('./backup');

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

// ── SPA catch-all ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3000');
// Boot order: restore (one-shot, if RESTORE_FROM set) → schema migrations →
// startup dump + schedule → listen. Any failure aborts so the container
// doesn't serve traffic against a half-initialised DB.
restoreIfRequested()
  .then(() => ensureSchema())
  .then(() => initBackupSchedule())
  .then(() => app.listen(PORT, () => console.log(`Gridfinity Organizer → http://localhost:${PORT}`)))
  .catch(e => { console.error('Startup failed:', e); process.exit(1); });
