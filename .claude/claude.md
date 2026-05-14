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

No build step. The frontend is a single static `index.html` served by Express.

---

## File structure

```
gridfinity/
├── docker-compose.yml          # postgres + backend services
├── init.sql                    # schema DDL + seed data (runs once on first start)
└── backend/
    ├── Dockerfile              # node:20-alpine, copies everything, runs server.js
    ├── package.json            # deps: express, pg, cors
    ├── server.js               # all REST API routes + static file serving
    └── public/
        └── index.html          # entire frontend SPA (~1100 lines, no build step)
```

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

-- Placed inventory items (the core table)
bins (
  id SERIAL PK,                   -- this ID is encoded in the QR code
  location_id     INT → locations,
  grid_x          INT,            -- column of top-left corner (0-indexed), nullable if unplaced
  grid_y          INT,            -- row of top-left corner (0-indexed), nullable if unplaced
  grid_width      INT,            -- columns occupied (from box_type, stored for fast queries)
  grid_length     INT,            -- rows occupied
  height_u        INT,            -- actual height (may override box_type default)
  box_type_id     INT → box_types,
  content_type    VARCHAR(100),   -- "Bolt", "Connector", "Tool", etc.
  attribute       VARCHAR(255),   -- "M5×30", "JST 2.54 mm", etc.
  notes           TEXT,
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)
```

`grid_width` and `grid_length` are deliberately denormalised into `bins` (copied from `box_type` at save time) so grid collision checks and map rendering never need a join to `box_types`.

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

GET    /api/bins                        all bins (joined with locations + box_types)
GET    /api/bins/search?q=<term>        full-text search (IMPORTANT: registered BEFORE /:id)
GET    /api/bins/:id                    single bin (full join)
POST   /api/bins                        create bin
PUT    /api/bins/:id                    update / move bin
DELETE /api/bins/:id                    delete bin

GET    /bin/:id                         → serves index.html (SPA handles the QR scan page)
GET    *                                → serves index.html (SPA catch-all)
```

**Critical ordering:** `/api/bins/search` must be registered before `/api/bins/:id` in Express or "search" is parsed as an ID. Do not reorder these routes.

---

## Frontend architecture (`backend/public/index.html`)

Single HTML file, no bundler, no framework. All JS is in a `<script>` tag at the bottom.

### Key globals

```js
S          // state object — single source of truth
App        // main controller object with all methods
api        // fetch wrapper: api.get(path), api.post(path, body), api.put(...), api.delete(...)
```

### State object (`S`)

```js
{
  tab:           'inventory',   // active tab
  locations:     [],
  boxTypes:      [],
  bins:          [],
  locFilter:     '',            // inventory tab location filter (location id as string)
  typeFilter:    '',            // inventory tab content_type filter
  searchQ:       '',
  searchResults: [],
  grid: {                       // shared state for the bin add/edit modal grid picker
    locId:      null,           // selected location id
    locData:    null,           // location object
    drawerBins: [],             // bins already in the selected drawer
    selX:       null,           // selected grid column
    selY:       null,           // selected grid row
    bw:         1,              // bin width (from selected box_type)
    bl:         1,              // bin length (from selected box_type)
    editId:     null,           // id of bin being edited (excluded from collision map)
  },
}
```

### Rendering pattern

The app uses full re-renders (`App.render()` → sets `$('root').innerHTML`). There is no virtual DOM or diffing. This is intentional to keep the code simple — the dataset is small enough that full re-renders are imperceptible.

```js
App.render()                    // re-renders everything (header + active tab)
App.renderTab()                 // dispatches to the active tab render method
App.renderInventory()           // returns HTML string
App.renderLocations()           // returns HTML string
App.renderBoxTypes()            // returns HTML string
App.renderSearch()              // returns HTML string
```

Modals are rendered into a persistent `#modal-overlay` div via `App.openModal(title, html)`. The QR modal is a separate persistent `#qr-overlay` div.

### Grid picker

The interactive drawer grid in the add/edit bin modal is rendered by `App._renderGridPicker()` into the `#grid-area` div inside the modal. It reads from `S.grid` and:
- Builds an occupancy map from `S.grid.drawerBins` (skipping `S.grid.editId`)
- Renders a `<table>` where each `<td>` has class `gc` (grid cell)
- Clicking a cell calls `App._gridClick(col, row)` → updates `S.grid.selX/selY` → re-renders the picker
- Highlights the selected footprint (`bw × bl` cells) green, conflicts red

### CSS classes for grid cells

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

# Rebuild backend after server.js changes (frontend needs no rebuild)
docker compose build backend && docker compose up -d backend
```

The frontend (`index.html`) is served as a static file — editing it takes effect immediately on next browser refresh with no container restart needed.

---

## Known limitations / good next tasks

- **No authentication** — the app is open to anyone on the network. Adding basic auth to Express would be a natural first hardening step.
- **No image support** — bins have no photo. Adding an `image_url` column to `bins` and a file upload endpoint would be useful.
- **Search is basic** — currently a LIKE query across 5 fields. PostgreSQL full-text search (`tsvector`) would be a clean upgrade.
- **Grid picker has no hover preview** — `App._gridHover()` is stubbed but not implemented. Adding live footprint highlighting on hover would improve UX.
- **No bulk QR printing** — only one QR at a time. A "Print all QRs for this drawer" feature would be practical.
- **No quantity tracking** — bins store *what* but not *how many*. Adding a `quantity INT` and `min_quantity INT` (for low-stock alerts) to `bins` is a common request.
- **Migrations** — `init.sql` runs only on first DB init. For schema changes, either add a migration runner (e.g. `node-pg-migrate`) or document manual `ALTER TABLE` steps.
- **`grid_width`/`grid_length` on `bins` can drift** from `box_types` if a box type is edited after bins are placed. Consider a trigger or application-level sync if this becomes an issue.

---

## Conventions to follow

- **SQL:** parameterised queries only (`$1`, `$2`, …), never string interpolation.
- **API errors:** use the `err(res, e)` helper — logs to console, returns `{ error: message }` with 500.
- **Frontend HTML:** always escape user data with `esc()` before inserting into template literals.
- **No build step:** keep the frontend as a single `index.html`. If it grows too large, split into additional static files (e.g. `app.js`) served from `backend/public/` — Express already serves the whole directory.
- **No ORM:** keep queries in `server.js` as plain SQL. The codebase is small enough that an ORM adds more friction than value.
- **Tailwind:** loaded from CDN. Use only standard utility classes — no arbitrary values like `w-[43px]` as the CDN build won't include them.