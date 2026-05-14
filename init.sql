-- ============================================================
-- Gridfinity Organizer - Database Schema
-- ============================================================

-- Drawers / physical storage locations
CREATE TABLE IF NOT EXISTS locations (
    id              SERIAL PRIMARY KEY,
    cabinet_id      VARCHAR(100) NOT NULL,
    drawer_id       VARCHAR(100) NOT NULL,
    grid_columns    INT NOT NULL DEFAULT 5,
    grid_rows       INT NOT NULL DEFAULT 5,
    vertical_space_u INT NOT NULL DEFAULT 6,
    attributes      TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(cabinet_id, drawer_id)
);

-- Catalog of Gridfinity bin types
CREATE TABLE IF NOT EXISTS box_types (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    grid_width      INT NOT NULL DEFAULT 1,   -- footprint in X
    grid_length     INT NOT NULL DEFAULT 1,   -- footprint in Y
    grid_height_u   INT NOT NULL DEFAULT 3,   -- height in gridfinity units
    is_divided      BOOLEAN DEFAULT FALSE,
    compartments    INT DEFAULT 1,
    description     TEXT
);

-- User-editable catalog of content-type tags shown in the bin form datalist
-- (declared before `bins` because `bins.content_type_id` references it)
CREATE TABLE IF NOT EXISTS content_types (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE
);

-- Actual inventory bins placed in drawers
CREATE TABLE IF NOT EXISTS bins (
    id              SERIAL PRIMARY KEY,
    location_id     INT REFERENCES locations(id) ON DELETE SET NULL,
    grid_x          INT,                      -- column (0-indexed)
    grid_y          INT,                      -- row (0-indexed)
    grid_width      INT NOT NULL DEFAULT 1,   -- cells occupied in X
    grid_length     INT NOT NULL DEFAULT 1,   -- cells occupied in Y
    height_u        INT NOT NULL DEFAULT 3,
    box_type_id     INT REFERENCES box_types(id)     ON DELETE SET NULL,
    content_type_id INT REFERENCES content_types(id) ON DELETE SET NULL,
    attribute       VARCHAR(255),             -- M5×30, JST 2.54 mm, ...
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bins_location         ON bins(location_id);
CREATE INDEX IF NOT EXISTS idx_bins_content_type_id  ON bins(content_type_id);

-- ============================================================
-- Seed data
-- ============================================================

INSERT INTO locations (cabinet_id, drawer_id, grid_columns, grid_rows, vertical_space_u, attributes)
VALUES
    ('Cabinet A', 'Drawer 1', 7, 5, 6, 'Bolts & Screws'),
    ('Cabinet A', 'Drawer 2', 7, 5, 6, 'Nuts & Washers'),
    ('Cabinet B', 'Drawer 1', 5, 3, 9, 'Tools & Pliers'),
    ('Cabinet B', 'Drawer 2', 5, 3, 6, 'Connectors & Cables')
ON CONFLICT DO NOTHING;

INSERT INTO box_types (name, grid_width, grid_length, grid_height_u, is_divided, compartments, description)
VALUES
    ('1×1×3',      1, 1, 3, FALSE, 1, 'Standard small bin'),
    ('1×2×3',      1, 2, 3, FALSE, 1, 'Standard medium bin'),
    ('2×2×3',      2, 2, 3, FALSE, 1, 'Standard large bin'),
    ('2×4×3',      2, 4, 3, FALSE, 1, 'Long bin'),
    ('1×2×6',      1, 2, 6, FALSE, 1, 'Tall medium bin'),
    ('2×2×6',      2, 2, 6, FALSE, 1, 'Tall large bin'),
    ('1×2 Div×3',  1, 2, 3, TRUE,  2, 'Divided 2-compartment bin'),
    ('1×4 Div×3',  1, 4, 3, TRUE,  4, 'Divided 4-compartment bin'),
    ('Toolcrest 3×5', 3, 5, 6, FALSE, 1, 'Deep tool holder')
ON CONFLICT DO NOTHING;

INSERT INTO content_types (name)
VALUES
    ('Bolt'),('Nut'),('Washer'),('Screw'),('Connector'),
    ('Cable'),('Tool'),('Electronics'),('Spring'),('Bearing'),('Insert')
ON CONFLICT DO NOTHING;
