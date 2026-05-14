'use strict';

const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');

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
      `SELECT b.*, bt.name AS box_type_name, bt.grid_width, bt.grid_length
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
app.get('/api/bins/search', async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  try {
    const r = await pool.query(
      `SELECT b.*,
              l.cabinet_id, l.drawer_id,
              bt.name AS box_type_name, bt.grid_width, bt.grid_length, bt.is_divided, bt.compartments
       FROM bins b
       LEFT JOIN locations l  ON b.location_id  = l.id
       LEFT JOIN box_types bt ON b.box_type_id   = bt.id
       WHERE LOWER(b.content_type) LIKE $1
          OR LOWER(b.attribute)    LIKE $1
          OR LOWER(b.notes)        LIKE $1
          OR LOWER(COALESCE(l.cabinet_id,'')) LIKE $1
          OR LOWER(COALESCE(l.drawer_id,''))  LIKE $1
       ORDER BY b.id`,
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
              bt.name AS box_type_name, bt.grid_width, bt.grid_length, bt.is_divided, bt.compartments
       FROM bins b
       LEFT JOIN locations l  ON b.location_id  = l.id
       LEFT JOIN box_types bt ON b.box_type_id   = bt.id
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
              bt.name AS box_type_name, bt.grid_width, bt.grid_length,
              bt.is_divided, bt.compartments, bt.description AS box_type_description
       FROM bins b
       LEFT JOIN locations l  ON b.location_id  = l.id
       LEFT JOIN box_types bt ON b.box_type_id   = bt.id
       WHERE b.id = $1`,
      [req.params.id]
    );
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.post('/api/bins', async (req, res) => {
  const { location_id, grid_x, grid_y, grid_width, grid_length, height_u,
          box_type_id, content_type, attribute, notes } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO bins
         (location_id, grid_x, grid_y, grid_width, grid_length, height_u,
          box_type_id, content_type, attribute, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [location_id || null, grid_x ?? null, grid_y ?? null,
       grid_width || 1, grid_length || 1, height_u || 3,
       box_type_id || null, content_type, attribute, notes]
    );
    ok(res, r.rows[0]);
  } catch (e) { err(res, e); }
});

app.put('/api/bins/:id', async (req, res) => {
  const { location_id, grid_x, grid_y, grid_width, grid_length, height_u,
          box_type_id, content_type, attribute, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE bins SET
         location_id=$1, grid_x=$2, grid_y=$3, grid_width=$4, grid_length=$5,
         height_u=$6, box_type_id=$7, content_type=$8, attribute=$9, notes=$10,
         updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [location_id || null, grid_x ?? null, grid_y ?? null,
       grid_width || 1, grid_length || 1, height_u || 3,
       box_type_id || null, content_type, attribute, notes,
       req.params.id]
    );
    r.rows.length ? ok(res, r.rows[0]) : notFound(res);
  } catch (e) { err(res, e); }
});

app.delete('/api/bins/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bins WHERE id=$1', [req.params.id]);
    ok(res, { success: true });
  } catch (e) { err(res, e); }
});

// ── SPA catch-all ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => console.log(`Gridfinity Organizer → http://localhost:${PORT}`));
