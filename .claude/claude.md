# CLAUDE.md — Gridfinity Organizer

This file gives Claude Code all context needed to continue development without re-reading the entire codebase first.

---

## What this project is

A self-hosted workshop inventory system for Gridfinity bins. Physical storage is organised into **cabinets → drawers → grid positions**. Each bin has a QR code that encodes a URL; scanning it on mobile opens a detail page for that bin.

---

## Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Database  | PostgreSQL 16 (Docker)                          |
| Backend   | Node.js 20, Express 4, `pg` (no ORM)           |
| Frontend  | Vanilla JS SPA, Tailwind CSS (CDN), QRCode.js (CDN) |
| Container | Docker Compose (two services: `postgres`, `backend`) |

No build step. The frontend is a thin `index.html` shell plus a set of plain `<script>` files served by `express.static` from `backend/public/`.

---

## File structure

```
gridfinity/
├── docker-compose.yml          # postgres + backend services
├── init.sql                    # schema DDL + seed (runs only on a fresh DB volume)
└── backend/
    ├── Dockerfile              # node:20-alpine, COPY . . then `node server.js`
    ├── package.json            # deps: express, pg, cors
    ├── server.js               # REST routes + ensureSchema() migration + static serving
    └── public/
        ├── index.html          # thin shell: <head>, modals, root div, script tags
        ├── styles/
        │   └── main.css        # custom CSS + CSS variables for theming
        └── js/
            ├── core.js         # $, toast, esc, api, S (state), PALETTE
            ├── app.js          # App namespace, init, render, header/tabs, modal helpers
            └── views/
                ├── inventory.js
                ├── locations.js
                ├── box-types.js
                ├── content-types.js   # user-editable content-type tag catalog
                ├── search.js
                ├── bin-scan.js        # /bin/:id mobile page
                ├── bin-form.js        # add/edit bin modal, grid picker, rotate, save
                ├── drawer-map.js
                └── qr.js
```

Each view file extends the shared global `App` via `Object.assign(App, { … })`.
Script tag order in [index.html](../backend/public/index.html) matters
(`core.js` → `app.js` → views) since there's no module system.

---

## Database schema

```sql
-- One row per physical drawer
locations (
  id SERIAL PK,
  cabinet_id      VARCHAR(100),   -- e.g. "Cabinet A"
  drawer_id       VARCHAR(100),   -- e.g. "Drawer 1"
  grid_columns    INT,            -- how many Gridfinity columns wide
  grid_rows       INT,            -- how many Gridfinity rows deep
  vertical_space_u INT,           -- max stacking height in Gridfinity units
  attributes      TEXT,           -- free-text label, e.g. "Bolts & Screws"
  UNIQUE(cabinet_id, drawer_id)
)

-- Catalog of bin form factors
box_types (
  id SERIAL PK,
  name            VARCHAR(100) UNIQUE,
  grid_width      INT,            -- footprint columns
  grid_length     INT,            -- footprint rows
  grid_height_u   INT,            -- height in Gridfinity units
  is_divided      BOOLEAN,
  compartments    INT,
  description     TEXT
)

-- Physical containers placed in drawers. NO content fields — those moved
-- to bin_items in a one-shot migration; see ensureSchema().
bins (
  id SERIAL PK,                   -- this ID is encoded in the QR code
  location_id     INT → locations,
  grid_x          INT,            -- column of top-left corner (0-indexed), nullable if unplaced
  grid_y          INT,            -- row of top-left corner (0-indexed), nullable if unplaced
  grid_width      INT,            -- cells occupied in X (may be rotated vs. box_type's default)
  grid_length     INT,            -- cells occupied in Y (may be rotated)
  height_u        INT,            -- actual height (may override box_type default)
  box_type_id     INT → box_types,
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)

-- One row per item inside a bin. Divided box → up to `compartments` rows.
-- Undivided / no box → max 1 row. Server enforces the cap; the DB doesn't
-- (capacity depends on a joined column, so it's an app-layer check).
bin_items (
  id SERIAL PK,
  bin_id          INT → bins ON DELETE CASCADE,
  slot            INT,            -- 0-indexed compartment within the bin
  content_type_id INT → content_types ON DELETE SET NULL,
  attribute       VARCHAR(255),   -- "M5×30", "JST 2.54 mm", etc.
  notes           TEXT,
  updated_at      TIMESTAMP,
  UNIQUE(bin_id, slot)            -- two items can't share a compartment
)

-- User-editable tag catalog used by the bin-form datalist
content_types (
  id SERIAL PK,
  name VARCHAR(100) UNIQUE
)

-- Runtime-mutable kv store. Seeded from env on first boot, then UI owns it.
app_settings (
  key   VARCHAR(64) PK,
  value TEXT
)
```

`grid_width` and `grid_length` are deliberately denormalised into `bins` (copied
from `box_type` at save time, then optionally swapped by the rotate button) so
grid collision checks and map rendering never need a join to `box_types`.

**Important — joins must not shadow the bin's stored dims.** When joining `bins`
with `box_types`, never `SELECT b.*, bt.grid_width, bt.grid_length …`. The
unaliased box-type columns will overwrite the bin's columns of the same name in
the JSON response, silently undoing any rotation. Either omit those box-type
columns or alias them (e.g. `bt.grid_width AS box_type_grid_width`).

**Schema migrations.** `init.sql` only runs on a fresh DB volume. For
incremental upgrades, [server.js](../backend/server.js) defines an
`ensureSchema()` function that runs once before `app.listen` and is idempotent
— it does `CREATE TABLE IF NOT EXISTS …` and only seeds when a table is empty
(so user deletions survive restarts). Add new tables there; do not edit
`init.sql` and expect existing deployments to pick up the change.

---

## API routes

All routes are in `backend/server.js`. Parameterised queries via `pg` pool, no ORM.

```
GET    /api/locations                   all drawers
GET    /api/locations/:id               single drawer
POST   /api/locations                   create drawer
PUT    /api/locations/:id               update drawer
DELETE /api/locations/:id               delete drawer (bins lose location_id, not deleted)
GET    /api/locations/:id/bins          bins in drawer (for grid map; includes box_type dims)

GET    /api/box-types                   all box types
POST   /api/box-types                   create
PUT    /api/box-types/:id               update
DELETE /api/box-types/:id               delete

GET    /api/content-types               all tag entries (sorted by name)
POST   /api/content-types               create  { name }
PUT    /api/content-types/:id           rename (atomic — bins join by id, no cascade needed)
DELETE /api/content-types/:id           delete (FK ON DELETE SET NULL — referencing bins lose the tag)

GET    /api/bins                        all bins; each row has items: [...] aggregated via BIN_ITEMS_JSON
GET    /api/bins/search?q=<term>        ONE ROW PER MATCHING bin_item (with bin context); registered BEFORE /:id
GET    /api/bins/:id                    single bin with full items array
POST   /api/bins                        create bin; body may include items: [{ content_type, attribute, notes }]
PUT    /api/bins/:id                    update bin metadata; if body has items array, also replace items transactionally
DELETE /api/bins/:id                    delete bin (CASCADEs to bin_items)

GET    /api/config                      runtime settings (qrPayloadMode, …) — reads from app_settings
PUT    /api/config                      mutate a runtime setting from the UI

GET    /bin/:id                         → serves index.html (SPA handles the QR scan page)
GET    *                                → serves index.html (SPA catch-all)
```

**Critical ordering:** `/api/bins/search` must be registered before `/api/bins/:id` in Express or "search" is parsed as an ID. Do not reorder these routes.

**Item capacity is enforced in the server, not the DB.** `getCapacity(client, boxTypeId)` reads `box_types.is_divided`/`compartments` and returns 1 for undivided/unknown box types. `replaceBinItems()` calls it before inserting and throws if `items.length > capacity`. The DB only enforces `UNIQUE(bin_id, slot)` — the capacity cap lives in app code because it depends on a joined column. If you change the validation rules, update both call sites in `POST` and `PUT /api/bins`.

**`PUT /api/bins/:id` items handling:** if the body has an `items` field, items are replaced transactionally. If it's omitted, only bin metadata is updated — useful for "just move the bin" without touching contents. `Array.isArray(items)` is the guard, so `items: []` does clear the bin, but a missing key leaves items alone.

**Aggregation pattern:** the constant `BIN_ITEMS_JSON` near the top of `server.js` is a SQL fragment that produces `items: [...]` as a JSON array via `json_agg(json_build_object(...))` scoped to `b.id`. Reuse it on any query that needs the items inline; don't roll your own.

---

## Frontend architecture (`backend/public/`)

Plain `<script>` files, no bundler, no framework, no modules. [index.html](../backend/public/index.html) is a thin shell that loads `core.js` → `app.js` → each `views/*.js` in order, then calls `App.init()`. Each view file extends the shared `App` global via `Object.assign(App, { … })`. Reload-as-you-go: the order in [index.html](../backend/public/index.html) is load-bearing because there are no imports.

### Key globals

```js
S          // state object — single source of truth
App        // main controller object with all methods
api        // fetch wrapper: api.get(path), api.post(path, body), api.put(...), api.delete(...)
```

### State object (`S`) — defined in [core.js](../backend/public/js/core.js)

```js
{
  tab:           'inventory',   // inventory | locations | box-types | content-types | search | scanner
  theme:         'light',       // light | dark — kept in sync with <html data-theme>
  qrPayloadMode: 'url',         // 'url' = host-coupled URL · 'id' = host-portable gfbin:N
  selectedBinId: null,          // for the inventory split view
  locations:     [],
  boxTypes:      [],
  contentTypes:  [],            // user-editable tag catalog (drives the bin-form datalist)
  bins:          [],            // each bin has items: [{ slot, content_type, attribute, notes, ... }]
  locFilter:     '',
  typeFilter:    '',
  ctFilter:      'all',         // all | inuse — content-types view
  searchQ:       '',
  searchResults: [],            // ITEM rows from /api/bins/search (each has bin_id, slot, ...)
  formItems:     [],            // draft items inside the bin-form modal (cleared on open)
  grid: {                       // shared state for the bin add/edit modal grid picker
    locId:      null,
    locData:    null,
    drawerBins: [],
    selX:       null,
    selY:       null,
    bw:         1,              // bin width (from selected box_type, or swapped by rotate)
    bl:         1,              // bin length
    editId:     null,           // id of bin being edited (excluded from collision map)
  },
  qrBin: null,                  // last-shown bin for the QR print buffer
}
```

**Bin vs item terminology:** a `bin` is a physical container with a placement and a box-type; `items` are the things inside it (one per compartment for divided boxes, max one for undivided). The inventory list shows one row **per item** with `#binId·SlotLetter` IDs for divided bins. The detail pane shows one bin and all its items.

### Rendering pattern

The app uses full re-renders (`App.render()` → sets `$('root').innerHTML`). There is no virtual DOM or diffing. This is intentional to keep the code simple — the dataset is small enough that full re-renders are imperceptible.

```js
App.render()                    // re-renders everything (header + active tab)
App.renderTab()                 // dispatches to the active tab render method
App.renderInventory()           // views/inventory.js
App.renderLocations()           // views/locations.js
App.renderBoxTypes()            // views/box-types.js
App.renderContentTypes()        // views/content-types.js
App.renderSearch()              // views/search.js
App.renderBinScan(id)           // views/bin-scan.js — /bin/:id page
```

Modals are rendered into a persistent `#modal-overlay` div via `App.openModal(title, html)`. The QR modal is a separate persistent `#qr-overlay` div.

### Grid picker (in [views/bin-form.js](../backend/public/js/views/bin-form.js))

`App._renderGridPicker()` renders into the `#grid-area` div inside the bin modal. It reads from `S.grid` and:
- Builds an occupancy map from `S.grid.drawerBins` (skipping `S.grid.editId`)
- Renders a `<table>` where each `<td>` has class `gc` (grid cell)
- Clicking a cell calls `App._gridClick(col, row)` → updates `S.grid.selX/selY` → re-renders
- Highlights the selected footprint (`bw × bl` cells) green, conflicts red
- `App._gridRotate()` swaps `bw`/`bl` and clamps `selX/selY` so the rotated footprint still fits the drawer; the saved bin row keeps the rotated dims (no schema bit needed)

### CSS classes for grid cells

Custom CSS lives in [styles/main.css](../backend/public/styles/main.css) and uses CSS variables on `:root` so themes (dark mode, etc.) can be added by overriding tokens in a `[data-theme="dark"]` block — stub is already in the file.

```
.gc           base cell style (46×46px, pointer cursor)
.gc.occ       occupied by another bin (blue)
.gc.sel       selected position, no conflict (green)
.gc.conflict  selected position has a conflict (red)
```

### QR code

`QRCode` from `qrcodejs` CDN. Usage:

```js
new QRCode(domElement, {
  text: url,
  width: 200, height: 200,
  colorDark: '#1e40af', colorLight: '#ffffff',
  correctLevel: QRCode.CorrectLevel.M,
});
```

The URL encoded is `window.location.origin + '/bin/' + id`. The bin scan page is rendered client-side by `App.renderBinScan(id)` when `window.location.pathname` matches `/bin/:id`.

### HTML escaping

Use the `esc(value)` helper for all user-supplied strings inserted into HTML template literals. Never skip this.

---

## Running locally

```bash
# Start everything
docker compose up -d

# Watch backend logs
docker compose logs -f backend

# Connect to DB directly
docker compose exec postgres psql -U gridfinity -d gridfinity

# Rebuild backend after ANY change under backend/ (server.js OR public/)
docker compose build backend && docker compose up -d backend

# Run backend on the host without Docker (needs a reachable Postgres)
cd backend && npm install
DB_HOST=localhost DB_USER=gridfinity DB_PASSWORD=gridfinity_pw DB_NAME=gridfinity node server.js
```

**Heads-up about static-file iteration.** The [backend Dockerfile](../backend/Dockerfile)
does `COPY . .`, so files under `backend/public/` are baked into the image at
build time — editing them on the host does **not** show up until a rebuild. If
you want true live-edit for the frontend, add a bind mount on the `backend`
service in [docker-compose.yml](../docker-compose.yml):
`- ./backend/public:/app/public:ro`.

UI / frontend changes: open the app in a browser and exercise the feature you
changed (golden path + the obvious edge cases). Type-checking and the (absent)
test suite can't confirm UI correctness. If browser verification isn't possible
in the current environment, say so explicitly rather than declaring success.

**No tests, no linter, no frontend build.** Don't go hunting for `npm test` /
`npm run lint`.

---

## Known limitations / good next tasks

- **No authentication** — the app is open to anyone on the network. Adding basic auth to Express would be a natural first hardening step.
- **No image support** — bins have no photo. Adding an `image_url` column to `bins` and a file upload endpoint would be useful.
- **Search is basic** — currently a LIKE query across 5 fields. PostgreSQL full-text search (`tsvector`) would be a clean upgrade.
- **Grid picker has no hover preview** — `App._gridHover()` is stubbed but not implemented. Adding live footprint highlighting on hover would improve UX.
- **No bulk QR printing** — only one QR at a time. A "Print all QRs for this drawer" feature would be practical.
- **No quantity tracking** — bins store *what* but not *how many*. Adding a `quantity INT` and `min_quantity INT` (for low-stock alerts) to `bins` is a common request.
- **Migrations are ad-hoc** — `ensureSchema()` in [server.js](../backend/server.js) is the only mechanism. It's idempotent (`CREATE TABLE IF NOT EXISTS`, seed only when empty) and runs on every boot. Fine for additive changes; for column-level changes (renames, type changes, drops) you'd want either explicit guarded `ALTER TABLE` steps in `ensureSchema()` or a proper runner (e.g. `node-pg-migrate`).
- **`grid_width`/`grid_length` on `bins` can drift** from `box_types` if a box type is edited after bins are placed. Consider a trigger or application-level sync if this becomes an issue. (Note: rotation deliberately differs from the box-type defaults — see the schema note above.)

---

## Conventions to follow

- **SQL:** parameterised queries only (`$1`, `$2`, …), never string interpolation.
- **API errors:** use the `err(res, e)` helper — logs to console, returns `{ error: message }` with 500.
- **Frontend HTML:** always escape user data with `esc()` before inserting into template literals.
- **No build step:** keep the frontend as plain `<script>` files under `backend/public/`. When adding a view, drop a new file under `public/js/views/`, extend the `App` global via `Object.assign(App, { … })`, and add the `<script>` tag in [index.html](../backend/public/index.html) (order matters — after `core.js` and `app.js`).
- **Joins on `bins` + `box_types`:** never `SELECT b.*, bt.grid_width, bt.grid_length …` — the same-named box-type columns shadow the bin's stored (possibly rotated) dims in the response. Either omit or alias them.
- **Catalog references:** `bin_items.content_type_id REFERENCES content_types(id) ON DELETE SET NULL` is the FK. `POST/PUT /api/bins` accept each item's `content_type` as a *string*; the server resolves it to an id via `resolveContentTypeId(client, name)` — creating the catalog row on the fly when the name is new. GET responses expose `content_type` as a joined string per item for frontend compat. When you add another lookup catalog, mirror this shape (FK + resolve-by-name helper) rather than storing free-text on the referencing rows.
- **No ORM:** keep queries in `server.js` as plain SQL. The codebase is small enough that an ORM adds more friction than value.
- **Tailwind:** loaded from CDN. Use only standard utility classes — no arbitrary values like `w-[43px]` as the CDN build won't include them. Bespoke styles belong in [styles/main.css](../backend/public/styles/main.css), driven by CSS variables for theme-readiness.