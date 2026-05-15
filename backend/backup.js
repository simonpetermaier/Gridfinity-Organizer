'use strict';

// Database backup + restore module.
//
// Configuration (env, all optional except DB_*):
//   BACKUP_DIR             where SQL dumps live (default /backups)
//   BACKUP_INTERVAL_DAYS   periodic dump interval; 0 disables (default 0)
//   BACKUP_RETAIN          newest N dumps to keep; older are pruned (default 14)
//   RESTORE_FROM           filename inside BACKUP_DIR to restore on boot
//
// The restore is "one-shot per filename": after a successful restore we write
// the filename to `<BACKUP_DIR>/.last-restore`. On subsequent boots, if
// RESTORE_FROM still names the same file, we skip — so leaving the var in
// docker-compose.yml is safe and won't wipe out new data. To re-apply the same
// backup, delete the marker (`rm ./backups/.last-restore`) or pick a fresh
// filename.

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');

const BACKUP_DIR           = process.env.BACKUP_DIR || '/backups';
const BACKUP_INTERVAL_DAYS = Number(process.env.BACKUP_INTERVAL_DAYS) || 0;
const BACKUP_RETAIN        = Number(process.env.BACKUP_RETAIN) || 14;
const RESTORE_FROM         = (process.env.RESTORE_FROM || '').trim();
const MARKER_PATH          = path.join(BACKUP_DIR, '.last-restore');

// Filename pattern produced by runBackup() — used by listBackups()/prune() to
// avoid touching anything else a user might drop into the directory.
const BACKUP_PREFIX = 'gridfinity-';
const BACKUP_SUFFIX = '.sql';

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestamp() {
  // Sortable, filesystem-safe, e.g. "2026-05-15T18-30-45Z".
  return new Date().toISOString().replace(/\..*$/, 'Z').replace(/:/g, '-');
}

function pgEnv() {
  return { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' };
}

function pgArgs() {
  return [
    '-h', process.env.DB_HOST || 'postgres',
    '-p', String(process.env.DB_PORT || 5432),
    '-U', process.env.DB_USER || 'gridfinity',
    '-d', process.env.DB_NAME || 'gridfinity',
  ];
}

function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_SUFFIX))
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      return { name: f, path: full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime); // newest first
}

async function runBackup(reason = '') {
  ensureDir();
  const file = path.join(BACKUP_DIR, `${BACKUP_PREFIX}${timestamp()}${BACKUP_SUFFIX}`);
  await new Promise((resolve, reject) => {
    // --clean + --if-exists make the dump idempotently restorable on a
    // populated DB; --no-owner / --no-acl keep it portable across roles.
    const proc = spawn('pg_dump', [
      ...pgArgs(),
      '--no-owner', '--no-acl', '--clean', '--if-exists',
      '-f', file,
    ], { env: pgEnv() });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`pg_dump exited ${code}: ${stderr.trim()}`)));
    proc.on('error', reject);
  });
  console.log(`[backup] created ${path.basename(file)}${reason ? ` (${reason})` : ''}`);
  return file;
}

async function runRestore(filename) {
  const file = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(file)) throw new Error(`Backup file not found: ${file}`);
  await new Promise((resolve, reject) => {
    const proc = spawn('psql', [
      ...pgArgs(),
      '-v', 'ON_ERROR_STOP=1',
      '-q', // quiet header
      '-f', file,
    ], { env: pgEnv(), stdio: ['ignore', 'inherit', 'inherit'] });
    proc.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`psql exited ${code}`)));
    proc.on('error', reject);
  });
  console.log(`[backup] restored from ${filename}`);
}

function prune() {
  const files = listBackups();
  for (const f of files.slice(BACKUP_RETAIN)) {
    try {
      fs.unlinkSync(f.path);
      console.log(`[backup] pruned ${f.name}`);
    } catch (e) {
      console.error(`[backup] prune failed for ${f.name}:`, e.message);
    }
  }
}

function readMarker() {
  try { return fs.readFileSync(MARKER_PATH, 'utf8').trim(); } catch { return ''; }
}
function writeMarker(name) {
  try { fs.writeFileSync(MARKER_PATH, name + '\n'); }
  catch (e) { console.error('[backup] marker write failed:', e.message); }
}

// Phase 1 of boot: run before ensureSchema() so any restored data goes through
// the same idempotent migration path.
async function restoreIfRequested() {
  ensureDir();
  if (!RESTORE_FROM) return;
  if (readMarker() === RESTORE_FROM) {
    console.log(`[backup] already restored from ${RESTORE_FROM} — skipping (remove ${MARKER_PATH} to redo)`);
    return;
  }
  console.log(`[backup] restoring from ${RESTORE_FROM} …`);
  await runRestore(RESTORE_FROM);
  writeMarker(RESTORE_FROM);
}

// Phase 2 of boot: a fresh dump that reflects the current schema state, plus
// the recurring schedule if BACKUP_INTERVAL_DAYS > 0.
async function initBackupSchedule() {
  try {
    await runBackup('startup');
    prune();
  } catch (e) {
    console.error('[backup] startup backup failed:', e.message);
  }
  if (BACKUP_INTERVAL_DAYS > 0) {
    const ms = BACKUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    setInterval(async () => {
      try { await runBackup('scheduled'); prune(); }
      catch (e) { console.error('[backup] scheduled backup failed:', e.message); }
    }, ms).unref(); // don't keep the event loop alive just for backups
    console.log(`[backup] scheduled every ${BACKUP_INTERVAL_DAYS}d, retaining newest ${BACKUP_RETAIN}`);
  } else {
    console.log('[backup] periodic backups disabled (BACKUP_INTERVAL_DAYS=0)');
  }
}

module.exports = {
  restoreIfRequested,
  initBackupSchedule,
  runBackup,
  runRestore,
  prune,
  listBackups,
};
