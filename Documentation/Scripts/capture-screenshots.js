'use strict';

// Renders the running Gridfinity Organizer UI to PNGs for the README.
//
// Usage:
//   cd Documentation/Scripts
//   npm install
//   docker compose up -d              # from the repo root, in another terminal
//   APP_URL=http://localhost:3333 npm run capture
//
// APP_URL defaults to http://localhost:3333 (the port docker-compose.yml
// publishes). Images land in ../images, overwriting anything already there.
// This only reads data over the UI — it never creates, edits, or deletes a
// bin/drawer/box type, so it's safe to re-run against a real instance at
// any time (it does log in as your data, though: screenshots reflect
// whatever's actually in the database, not fixture data).

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP_URL = process.env.APP_URL || 'http://localhost:3333';
const OUT_DIR = path.join(__dirname, '..', 'images');

const DESKTOP = { width: 1400, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function shot(page, name, opts = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), ...opts });
  console.log(`✓ ${name}.png`);
}

async function freshPage(browser, viewport, { dark = false } = {}) {
  const page = await browser.newPage({ viewport });
  if (dark) {
    // Seed the theme before first paint so there's no light->dark flash
    // in the screenshot — same storage key theme.js reads on boot.
    await page.addInitScript(() => localStorage.setItem('gridfinity:theme', 'dark'));
  }
  page.on('pageerror', e => console.warn(`  ! page error: ${e}`));
  await page.goto(APP_URL);
  await page.waitForSelector('.sidebar, .nav-item');
  return page;
}

async function main() {
  const browser = await chromium.launch();

  try {
    // ── Inventory (desktop): list + detail + grid-position card ──────
    let page = await freshPage(browser, DESKTOP);
    await page.click('.nav-item:has-text("Inventory")');
    await page.waitForSelector('.inv-list .inv-row');
    await page.waitForTimeout(150); // let the QR code + grid SVG paint
    await shot(page, 'inventory-desktop');

    // ── Inventory quick-filter ────────────────────────────────────────
    const filterInput = await page.$('.qf-pill input.qf-text');
    if (filterInput) {
      await filterInput.click();
      await filterInput.type('M6', { delay: 30 });
      await page.waitForTimeout(150);
      await shot(page, 'inventory-quickfilter');
      await page.click('.qf-clear').catch(() => {});
    }
    await page.close();

    // ── Drawers ─────────────────────────────────────────────────────
    page = await freshPage(browser, DESKTOP);
    await page.click('.nav-item:has-text("Drawers")');
    await page.waitForSelector('.cabinet-grid, .card');
    await page.waitForTimeout(150);
    await shot(page, 'drawers');
    await page.close();

    // ── Box Types ───────────────────────────────────────────────────
    page = await freshPage(browser, DESKTOP);
    await page.click('.nav-item:has-text("Box Types")');
    await page.waitForTimeout(200);
    await shot(page, 'box-types');
    await page.close();

    // ── Content Types ───────────────────────────────────────────────
    page = await freshPage(browser, DESKTOP);
    await page.click('.nav-item:has-text("Content Types")');
    await page.waitForTimeout(200);
    await shot(page, 'content-types');
    await page.close();

    // ── Settings → Appearance ────────────────────────────────────────
    page = await freshPage(browser, DESKTOP);
    await page.click('.settings-btn');
    await page.waitForSelector('#modal-overlay:not(.hidden)');
    await page.waitForTimeout(100);
    await shot(page, 'settings-appearance');

    // ── Settings → Menu Items ────────────────────────────────────────
    await page.click('.settings-nav-item:has-text("Menu Items")');
    await page.waitForTimeout(100);
    await shot(page, 'settings-menu-items');

    // ── Settings → Database → Backup ────────────────────────────────
    await page.click('.settings-nav-item:has-text("Backup")');
    await page.waitForTimeout(100);
    await shot(page, 'settings-database-backup');

    // ── Settings → Database → Export / Import ───────────────────────
    await page.click('.settings-nav-item:has-text("Export / Import")');
    await page.waitForTimeout(100);
    await shot(page, 'settings-database-export-import');
    await page.close();

    // ── Dark theme (Inventory) ───────────────────────────────────────
    page = await freshPage(browser, DESKTOP, { dark: true });
    await page.click('.nav-item:has-text("Inventory")');
    await page.waitForSelector('.inv-list .inv-row');
    await page.waitForTimeout(150);
    await shot(page, 'dark-theme');
    await page.close();

    // ── Mobile: Inventory with the split-table detail open ──────────
    page = await freshPage(browser, MOBILE);
    await page.waitForSelector('.inv-list .inv-row');
    const rows = await page.$$('.inv-list .inv-row:not(.empty)');
    const target = rows[Math.min(5, rows.length - 1)];
    if (target) {
      await target.scrollIntoViewIfNeeded();
      await target.click();
      await page.waitForTimeout(200);
      const detail = await page.$('.inv-row-detail');
      if (detail) await detail.scrollIntoViewIfNeeded();
    }
    await shot(page, 'mobile-inventory-split');
    await page.close();

  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
