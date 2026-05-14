# 🗄️ Gridfinity Organizer

Workshop inventory management with PostgreSQL backend, REST API, and a full-featured web UI.

## Features

- **Inventory table** — all bins with filtering, QR code generation, edit/delete
- **Drawer grid map** — visual top-down view per drawer, click bins to pull up QR
- **Interactive grid picker** — click to place bins with live conflict detection
- **Box type catalog** — manage bin form factors (size, divided, compartments)
- **Full-text search** — by type, attribute, location, or notes
- **QR scan page** — scan a printed QR code to open the bin's detail page directly on mobile

## Database schema

| Table        | Purpose                                      |
|-------------|----------------------------------------------|
| `locations`  | Cabinets → Drawers with grid dimensions       |
| `box_types`  | Catalog of Gridfinity bin form factors        |
| `bins`       | Placed inventory items (the main table)       |

## Quick start

```bash
docker compose up -d
```

Then open **http://localhost:3000** in your browser.

The database is initialised automatically on first start with seed data
(4 example drawers and 9 common box types).

## QR codes

Every bin has a unique ID. Clicking 📱 generates a QR code that encodes
`http://<your-server-ip>:3000/bin/<id>`.

**For printing to work on mobile scans**, make sure the URL uses your
machine's local network IP (e.g. `192.168.1.50`), not `localhost`.
The app uses `window.location.origin` automatically — just open the
app from the correct IP in your browser before generating QR codes.

You can print directly from the QR modal with the 🖨 Print button.

## Port

The web UI is exposed on **port 3000**. To change it, edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"   # host:container
```

## Data persistence

PostgreSQL data is stored in a named Docker volume (`postgres_data`).
It survives container restarts and `docker compose down`.
To wipe all data: `docker compose down -v`.

## Development

To run the backend locally (with a local Postgres):

```bash
cd backend
npm install
DB_HOST=localhost DB_USER=gridfinity DB_PASSWORD=gridfinity_pw DB_NAME=gridfinity node server.js
```
