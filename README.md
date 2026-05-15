# Gridfinity Organizer

A self-hosted web app for cataloguing the contents of your [Gridfinity](https://gridfinity.xyz/) bins. Organise your workshop as **cabinets → drawers → grid positions**, give every bin a printed QR code, and find anything in seconds — from a laptop or right at the bench on your phone.

> Built around a small Postgres + Node.js stack. No build pipeline, no framework, no account system. Spin it up with one `docker compose` command and start tagging bins.

---

## Highlights

- 📦 **Inventory split view** — list every bin, click for a detail card with its QR, location, and box type.
- 🗄️ **Visual drawers** — each cabinet shows mini-maps of its drawers with bins drawn in their actual positions.
- 📐 **Box-type gallery** — vector previews of every Gridfinity footprint you have, divided bins included.
- 🏷️ **Editable content tags** — rename "Bolt" → "Bolts" and every bin that uses it updates in one transaction.
- 🎨 **Multi-color taxonomy** — each tag picks one of four palette colors so the drawer map turns into a glanceable heat-map.
- 🔍 **Search palette** — type to find bins by content, attribute, cabinet, drawer, or notes.
- 📱 **Scan a QR → mobile detail page** — print the code, stick it on the bin, point your phone at it.
- 🌓 **Light & dark themes** — clay-and-paper or VS Code-style. Respects `prefers-color-scheme`.
- 📲 **Mobile layout** — narrow viewports get a bottom nav, a full-width search bar, and edge-to-edge cards. Desktop is untouched.
- 💾 **Built-in backups** — automatic `pg_dump` on every restart and on a schedule, with a one-shot restore flag.

---

## Quick start

You need **Docker** and **docker-compose** (v2). Nothing else.

```bash
git clone https://github.com/YOUR-FORK/gridfinity-organizer.git
cd gridfinity-organizer
docker compose up -d
```

Open **<http://localhost:3000>** and you're in. The first launch seeds the database with 4 example drawers, 9 common Gridfinity box types, and an 11-tag content-type catalog so the UI has something to draw.

> 💡 **Want to use it from your phone too?** Open the app from your computer's LAN IP (e.g. `http://192.168.1.50:3000`) the very first time. QR codes encode whatever origin you visit the app from, so a code generated while you were on `localhost` won't be reachable from another device.

To stop the stack: `docker compose down`. To wipe everything (including data): `docker compose down -v`.

---

## Configuration

All settings live in [`docker-compose.yml`](docker-compose.yml). The defaults work out of the box; tweak the env vars on the `backend` service to taste.

### Database

| Variable | Default | What it does |
|---|---|---|
| `DB_HOST` | `postgres` | Hostname of the Postgres service |
| `DB_PORT` | `5432` | Postgres port |
| `DB_NAME` | `gridfinity` | Database name |
| `DB_USER` | `gridfinity` | Database role |
| `DB_PASSWORD` | `gridfinity_pw` | **Change this** if you expose the app outside your LAN |
| `PORT` | `3000` | HTTP port the backend listens on |

### Backups

The backend ships with a small backup module that runs `pg_dump` on every startup and on a recurring interval. Dumps land in a host directory you can browse and copy off-box.

| Variable | Default | What it does |
|---|---|---|
| `BACKUP_DIR` | `/backups` | Where dumps live inside the container (bind-mounted from `./backups` on the host) |
| `BACKUP_INTERVAL_DAYS` | `7` | Schedule cadence in days. Set to `0` to disable the recurring dump (startup dump still runs) |
| `BACKUP_RETAIN` | `14` | How many of the newest dumps to keep. Older ones are pruned after each new backup |
| `RESTORE_FROM` | _(unset)_ | If set to a filename in `BACKUP_DIR`, the backend restores from it on boot **before** running migrations |

### Changing the port

Edit the `ports:` line in `docker-compose.yml`:

```yaml
backend:
  ports:
    - "8080:3000"   # host:container — visit http://localhost:8080
```

---

## Using the app

### Adding your first bin

1. Click **+ Drawer** (top-right of the **Drawers** tab) and describe a real drawer — its cabinet, name, grid dimensions, and how tall stacks can go.
2. Switch to **Box Types** and either pick one of the seeded shapes or add your own (e.g. `1×2×3`, `1×4 Div×3`).
3. Back on **Inventory**, click **+ Bin**:
   - Pick a content type (or type a new one — the catalog will pick it up).
   - Enter the *attribute* — the specific thing inside: `M5×30`, `JST 2.54 mm`, etc.
   - Choose the box type and the drawer.
   - In the grid picker, click the top-left corner where the bin sits. The footprint highlights green.
   - **↻ Rotate** swaps width and length for non-square bins.
4. Save. The bin gets a numeric ID (`#1`, `#2`, …) and shows up in the list.

### Printing the QR

Open the bin in the inventory list. The detail pane on the right shows a small QR. Click **Print…** for a paper-friendly version, then stick it on the bin. Scanning the printed code on any phone opens a public page with the bin's contents, location, and another QR.

### Renaming tags safely

The **Content Types** tab is the source of truth for tag names. Editing a tag's name is one transactional `UPDATE` — every bin that referenced it now references the new name. Deleting a tag clears that field on the bins (`ON DELETE SET NULL`), so existing bins survive but lose their type label.

### Switching themes

Use the **☀️/🌙** toggle in the sidebar (or its mobile counterpart). The choice is saved to `localStorage`; first visits pick up your OS-level dark mode preference automatically.

---

## Host-portable QR codes

Printed stickers can outlive your host setup. The backend supports two QR payload formats; the in-app scanner reads either.

| `QR_PAYLOAD_MODE` | Payload encoded | Native iOS Camera app | Scanner-only |
|---|---|---|---|
| `url` *(default)* | `https://host/bin/42` | ✅ | — |
| `id` | `gfbin:42` | ❌ | ✅ |

If you're going to print stickers once and never reprint, switch to `id` mode. The codes won't know your host name and stay valid through every server move.

**Flip it from the UI** (recommended): open the **Scan** tab and toggle between `URL` and `gfbin:N` in the page header. The choice is persisted in Postgres (table `app_settings`) and takes effect on the next QR you render — no restart.

The `QR_PAYLOAD_MODE` env var only **seeds the initial value** on a fresh database. After that the UI toggle wins; changing the env var doesn't override what's in the DB. For unattended provisioning you can pre-seed the value:

```yaml
# docker-compose.yml — only used on a fresh DB
backend:
  environment:
    QR_PAYLOAD_MODE: id
```

Scan codes from any mode with the **Scan** tab in the sidebar. The scanner accepts both `gfbin:N` and full `…/bin/N` URLs, so old stickers keep working when you switch.

---

## Camera & HTTPS

The in-app scanner uses the browser's `getUserMedia` API. **Modern browsers — iOS Safari especially — only allow camera access on a secure origin (HTTPS, or `localhost`).** Plain HTTP on a LAN IP will never trigger the camera prompt. This is a security boundary, not a misconfiguration you can flag-away.

Two pragmatic paths to add HTTPS:

### A. Caddy reverse proxy on the LAN (recommended)

A small `caddy` service block is included in `docker-compose.yml` — commented out by default. To enable:

1. Uncomment the `caddy:` service and the two `caddy_*` lines in the `volumes:` section.
2. `docker compose up -d`. Caddy starts on `:443` using its built-in CA (`tls internal`).
3. Visit `https://<host-ip>/` on your phone and accept the cert warning **once**. The scanner now works.

Want no warnings? Either:

- **mkcert** (LAN-trusted certs):
  ```bash
  brew install mkcert nss              # macOS — Linux is `apt`/`dnf`
  mkcert -install                      # adds the mkcert root CA to your trust store
  cd caddy
  mkcert -cert-file certs/cert.pem -key-file certs/key.pem \
         gridfinity.local 192.168.1.50  # adjust to your host's name/IP
  # Edit caddy/Caddyfile: replace `tls internal` with
  #   tls /certs/cert.pem /certs/key.pem
  docker compose restart caddy
  ```
  Install the mkcert root CA on every phone you scan from (one-time; instructions in the [mkcert README](https://github.com/FiloSottile/mkcert#installation)).

- **Caddy's root CA** (no extra tooling):
  ```bash
  docker compose exec caddy caddy trust-pem
  # → prints PEM. Save as `caddy-root.crt`, email it to yourself,
  #   open on iPhone, Settings → General → Profile → install.
  ```

### B. Tailscale Magic DNS + HTTPS (cleanest if you already use Tailscale)

Tailscale gives every machine on your tailnet a real Let's Encrypt cert:

1. Install Tailscale on the Docker host, enable HTTPS in the admin console.
2. Run `tailscale cert <hostname>.<tailnet>.ts.net` on the host — drops `cert.pem` + `key.pem` in the working directory.
3. Copy them into `./caddy/certs/`, edit the Caddyfile to use them (as in mkcert step), restart Caddy.
4. Scan QRs from any phone on your tailnet via the `https://hostname.tailnet.ts.net` URL — no cert warnings, no root CA install.

### Trade-offs at a glance

| Approach | Setup time | Cert warnings | Where it works |
|---|---|---|---|
| Plain HTTP | 0 min | — | Anywhere, but **no scanner** |
| Caddy + `tls internal` | 2 min | First-visit warning per device | Anywhere on the LAN |
| Caddy + mkcert | 10 min | None (after root install) | Anywhere on the LAN |
| Caddy + Tailscale cert | 15 min | None | Anywhere on the tailnet |

---

## Backup & restore

Backups are **already running** the moment you start the stack — no configuration needed. You'll see them appear in `./backups/`:

```bash
$ ls ./backups
gridfinity-2026-05-15T18-00-57Z.sql
gridfinity-2026-05-22T18-00-57Z.sql
```

### Manual backups

The startup backup gives you a fresh dump on every restart, so the simplest "backup now" is:

```bash
docker compose restart backend
```

### Restoring a previous dump

Pick a file from `./backups` and pass its name through the `RESTORE_FROM` env var:

```bash
RESTORE_FROM=gridfinity-2026-05-15T18-00-57Z.sql docker compose up -d backend
```

What happens on boot:

1. The dump is applied with `psql -v ON_ERROR_STOP=1`. The dump uses `--clean --if-exists`, so it **wipes existing objects** and recreates them from the snapshot.
2. The schema upgrade (`ensureSchema()`) runs so any newer migrations apply on top.
3. A new startup backup is taken — so the pre-restore state is also captured.
4. A `.last-restore` marker is written so subsequent restarts with the same `RESTORE_FROM` value are no-ops. To re-apply the same file, delete `./backups/.last-restore`.

> ⚠️ Restore is a **full overwrite**, not a merge. If you only want to inspect a backup, copy the SQL file out and apply it to a separate database.

### Disabling the schedule

Set `BACKUP_INTERVAL_DAYS: 0` if you only want the startup dump.

---

## Architecture

The whole app is two services:

```
┌──────────────────────────────┐
│   backend (Node.js 20)       │
│   ├── Express REST API       │
│   ├── pg_dump / psql tools   │
│   └── express.static SPA     │
└────────────┬─────────────────┘
             │ pg pool
             ▼
┌──────────────────────────────┐
│   postgres (PostgreSQL 16)   │
│   volume: postgres_data      │
└──────────────────────────────┘
```

- **PostgreSQL 16** in a named volume — survives container restarts.
- **Node.js 20 + Express 4 + `pg`** — no ORM, parameterised SQL everywhere.
- **Vanilla JS SPA** under `backend/public/` — no bundler, no framework, no build step. The frontend is plain `<script>` files served by `express.static`. Theming is done with CSS custom properties; the only dependency loaded over the wire is `qrcodejs` from a CDN.
- **No login.** This is a homelab tool — put it behind your reverse proxy / VPN if you expose it.

### Project layout

```
gridfinity-organizer/
├── docker-compose.yml              # postgres + backend services
├── init.sql                        # schema DDL + seed (runs only on a fresh DB volume)
├── backups/                        # SQL dumps land here (bind-mounted)
└── backend/
    ├── Dockerfile                  # node:20-alpine + postgresql16-client
    ├── package.json                # deps: express, pg, cors
    ├── server.js                   # REST routes + ensureSchema() migration
    ├── backup.js                   # pg_dump / psql + retention + RESTORE_FROM
    └── public/
        ├── index.html              # thin shell — modals, root div, script tags
        ├── icons/                  # SVG sprite (21 icons)
        ├── styles/
        │   ├── tokens.css          # design tokens — colors, type, spacing, motion
        │   └── main.css            # component styles + mobile media block
        └── js/
            ├── core.js             # state, api helper, esc, contentHue, icon helper
            ├── theme.js            # light/dark toggle + persistence
            ├── app.js              # App namespace + shell render
            └── views/              # one file per screen
                ├── inventory.js
                ├── locations.js
                ├── box-types.js
                ├── content-types.js
                ├── search.js
                ├── bin-form.js
                ├── bin-scan.js
                ├── drawer-map.js
                └── qr.js
```

### Data model

```
locations ──┐
            │ 1
            ▼ *
            bins ────┬───* box_types
                     └───* content_types
```

- `locations` — one row per drawer; tracks cabinet name, drawer name, grid dimensions, and max stack height.
- `box_types` — catalog of Gridfinity footprints (size, height, divided/compartments).
- `content_types` — user-editable tag catalog. Bins reference by id, so renames are a single SQL `UPDATE`.
- `bins` — the main table. Stores its own `grid_width`/`grid_length` (denormalised from `box_types`) so the placement grid never needs a join, and so the rotate button has somewhere to put the swapped dimensions.

Schema migrations are additive and idempotent — they live in [`ensureSchema()`](backend/server.js) and run on every boot. The initial DDL in [`init.sql`](init.sql) only fires on a fresh Postgres volume.

### REST API

All routes are JSON. Parameterised queries via `pg`.

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/locations` | List or create drawers |
| `GET` / `PUT` / `DELETE` | `/api/locations/:id` | Single drawer |
| `GET` | `/api/locations/:id/bins` | Bins inside a drawer (drives the visual map) |
| `GET` / `POST` | `/api/box-types` | List or create box types |
| `GET` / `PUT` / `DELETE` | `/api/box-types/:id` | Single box type |
| `GET` / `POST` | `/api/content-types` | List or create tags |
| `GET` / `PUT` / `DELETE` | `/api/content-types/:id` | Single tag — rename cascades through the FK |
| `GET` | `/api/bins/search?q=` | Substring match across content, attribute, location, notes |
| `GET` / `POST` | `/api/bins` | List or create bins |
| `GET` / `PUT` / `DELETE` | `/api/bins/:id` | Single bin |
| `GET` | `/bin/:id` | Public scan page (serves the SPA, which renders the detail) |

---

## Development

Everything is in `backend/`. There's no separate frontend build — edits to the static assets show up on the next browser refresh **after** a container rebuild.

### Live-edit loop

The Dockerfile bakes `backend/public/` into the image, so editing files on the host doesn't auto-reflect. Two options:

**Option A — rebuild on each change** (simple, what the default compose does):

```bash
docker compose build backend && docker compose up -d backend
```

**Option B — bind-mount the public directory** (true live-edit; refresh the browser):

```yaml
# docker-compose.yml — add under the backend service
backend:
  volumes:
    - ./backups:/backups
    - ./backend/public:/app/public:ro   # add this line
```

### Running the backend on the host (no Docker)

You still need a Postgres reachable somewhere:

```bash
cd backend
npm install
DB_HOST=localhost \
DB_USER=gridfinity \
DB_PASSWORD=gridfinity_pw \
DB_NAME=gridfinity \
node server.js
```

### Talking to Postgres directly

```bash
docker compose exec postgres psql -U gridfinity -d gridfinity
```

### No tests, no linter

This is a hobby project — there's no test suite or eslint config to run. Verify changes by exercising the UI in a browser; the golden paths are: add bin → place on grid → rotate → save; rename a tag and check existing bins update; scan a printed QR.

---

## Customising the look

All visual decisions are in CSS variables defined in [`tokens.css`](backend/public/styles/tokens.css). Want a different accent? Override `--accent` for the relevant theme block:

```css
/* in a new <style> block, or appended to main.css */
[data-theme="light"] {
  --accent: #6f42c1;   /* purple instead of clay */
}
```

The four `--hue-1` … `--hue-4` tokens drive the multi-color taxonomy. Edit those and every content-tag pill picks up the new palette automatically.

---

## Roadmap

Things that would make sensible next features (none of these ship today):

- **Authentication** — currently the app is wide open. Behind a reverse proxy with basic auth or OIDC is the typical homelab pattern.
- **Image upload** — attach a photo to each bin. Needs an `image_url` column on `bins` plus a file-upload endpoint.
- **Bulk QR printing** — "print every QR in this drawer" as a single page.
- **Quantity & low-stock alerts** — `quantity` and `min_quantity` columns on `bins`, with a dashboard widget.
- **Drag-and-drop in the drawer map** — today you place via the modal grid picker; dragging tiles around in the cabinet view would be slicker.
- **⌘K command palette overlay** — there's a search *page* but no global overlay yet.

PRs welcome.

---

## License

MIT. Use it, fork it, sell consultancy around it — just don't blame me if you misplace a bolt.
