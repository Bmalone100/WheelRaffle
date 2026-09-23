import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'entrants.config.json');
const STATE_PATH = path.join(__dirname, 'data', 'state.json');
const SETTINGS_PATH = path.join(__dirname, 'data', 'settings.json');
const LOG_DIR = path.join(__dirname, 'data', 'logs');
const PRIZES_META_PATH = path.join(__dirname, 'data', 'prizes.json');
const PRIZE_IMAGES_DIR = path.join(__dirname, 'data', 'prize-images');
const PRIZE_ICON_SIZE = 320;
const PORT = process.env.PORT || 4000;

// Same id derivation used everywhere an entrant needs a stable key: their
// lowercased email, or a name+index fallback for a hand-edited config entry
// with no email — kept as one function so lookups (e.g. the entries-edit
// endpoint below) agree with how loadEntrantsConfig assigned ids in the
// first place.
function entrantId(e, i) {
  return (e.email && e.email.trim().toLowerCase()) || `${e.name}-${i}`;
}

function loadEntrantsConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const entrants = JSON.parse(raw);
  if (!Array.isArray(entrants)) {
    throw new Error('entrants.config.json must be a JSON array of { name, email, entries }');
  }
  return entrants
    .map((e, i) => ({
      id: entrantId(e, i),
      name: e.name,
      email: e.email || '',
      entries: Number(e.entries) || 0,
    }))
    .filter((e) => e.entries > 0);
}

// Raw (unfiltered, un-id'd) read/write of entrants.config.json itself, for
// the GUI add/import flows below — these persist to the file so it stays
// the source of truth, the same one Load Entrants and Reset read from.
function readEntrantsConfigRaw() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const entrants = JSON.parse(raw);
  if (!Array.isArray(entrants)) {
    throw new Error('entrants.config.json must be a JSON array of { name, email, entries }');
  }
  return entrants;
}

function writeEntrantsConfigRaw(entrants) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(entrants, null, 2)}\n`);
}

// Minimal CSV parser (quoted fields with embedded commas/escaped quotes) —
// no dependency needed for a controlled name,email,entries shape.
function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields.map((f) => f.trim());
  });
}

function freshState() {
  return { pool: loadEntrantsConfig(), history: [], currentPrizeId: null, prizeQueue: [] };
}

function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {
      // corrupt state file, fall through to a fresh load from config
    }
  }
  return freshState();
}

function saveState(next) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
}

function csvField(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Log filenames use this convention (not the literal hh:mm:ss the feature
// was requested with — Windows filenames can't contain `:`, so seconds are
// hyphen-separated instead): Raffle_ddMMMyy_HH-mm-ss.csv
const LOG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatLogTimestamp(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mmm = LOG_MONTHS[date.getMonth()];
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}${mmm}${yy}_${hh}-${mi}-${ss}`;
}
function newLogFileName() {
  return `Raffle_${formatLogTimestamp(new Date())}.csv`;
}

const AUDIT_LOG_HEADER = 'datetime,action,name,email,prize,details\n';

// Creates `filename` under LOG_DIR with a header row if it doesn't exist yet
// (a rotated-to filename never does; re-running this for the current file on
// every append is just a cheap existence check). Returns the full path.
function ensureLogFile(filename) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const filePath = path.join(LOG_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, AUDIT_LOG_HEADER);
  }
  return filePath;
}

// Append-only audit trail of every mutating action (spins, entrant/prize
// add-edit-delete, queue and selection changes, Load Entrants, Reset) —
// independent of state.json/history, which Reset clears. Only Reset rotates
// to a new dated file (see /api/reset); everything else appends to whichever
// file state.currentLogFile currently names.
function appendAudit(action, { name = '', email = '', prize = '', details = '' } = {}) {
  const filePath = ensureLogFile(state.currentLogFile);
  fs.appendFileSync(
    filePath,
    `${csvField(new Date().toISOString())},${csvField(action)},${csvField(name)},${csvField(email)},${csvField(prize)},${csvField(details)}\n`
  );
}

// The Export Log button copies the current log to this folder (see
// /api/log/export) — defaults to the desktop so it's somewhere the organizer
// will actually notice it, falling back to the home directory on a machine
// with no Desktop folder.
function defaultLogFolder() {
  const desktop = path.join(os.homedir(), 'Desktop');
  return fs.existsSync(desktop) ? desktop : os.homedir();
}

function loadSettings() {
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      if (loaded.logFolder) return loaded;
    } catch {
      // corrupt settings file, fall through to defaults
    }
  }
  return { logFolder: defaultLogFolder() };
}

function saveSettings(next) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
}

function loadPrizes() {
  if (!fs.existsSync(PRIZES_META_PATH)) return [];
  let loaded;
  try {
    loaded = JSON.parse(fs.readFileSync(PRIZES_META_PATH, 'utf-8'));
  } catch {
    return [];
  }
  // Prizes saved before the mystery-eligibility flag (or the value field)
  // existed default to eligible / worthless, so nothing already in play
  // silently drops out of the pool or crashes a fanfare-tier lookup.
  loaded.forEach((p) => {
    if (typeof p.mysteryEligible !== 'boolean') p.mysteryEligible = true;
    if (typeof p.value !== 'number' || Number.isNaN(p.value)) p.value = 0;
  });
  return loaded;
}

function savePrizes(prizes) {
  fs.mkdirSync(path.dirname(PRIZES_META_PATH), { recursive: true });
  fs.writeFileSync(PRIZES_META_PATH, JSON.stringify(prizes, null, 2));
}

let state = loadState();
if (!Array.isArray(state.prizeQueue)) state.prizeQueue = [];
delete state.mysteryPrize; // superseded: Mystery is now the implicit fallback, not a stored flag
// The very first run ever (no currentLogFile yet) gets a freshly-dated log
// file same as any later rotation — there's no fixed-name starting log.
if (!state.currentLogFile) state.currentLogFile = newLogFileName();
ensureLogFile(state.currentLogFile);
saveState(state);
let prizes = loadPrizes();
let settings = loadSettings();
saveSettings(settings);

// Drops any queue entries pointing at prizes that no longer exist or are
// out of stock, so the front of the queue (if any) is always safe to use
// without needing to re-check on every read. A `null` entry is a queued
// Mystery slot — not tied to any one prize, so it's never pruned.
function pruneQueue() {
  state.prizeQueue = state.prizeQueue.filter((id) => id === null || prizes.some((p) => p.id === id && p.quantity > 0));
}

// How many units of each prize are already spoken for by specific (non-
// Mystery) entries still waiting in `entries` — so a Mystery draw can be
// kept from picking a prize whose only remaining stock is reserved for its
// own upcoming queue slot.
function reservedCounts(entries) {
  const counts = new Map();
  for (const id of entries) {
    if (id === null) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

// Random draw from prizes marked mystery-eligible, excluding any stock
// already reserved (see reservedCounts). Used for both the implicit
// default draw and a queued Mystery slot.
function pickMysteryPrize(reserved) {
  const candidates = prizes.filter(
    (p) => p.mysteryEligible !== false && p.quantity - (reserved.get(p.id) || 0) > 0
  );
  if (candidates.length === 0) return null;
  // Drawn fresh each spin so the reveal happens together with the winner —
  // not a security context, non-cryptographic randomness is fine.
  // eslint-disable-next-line sonarjs/pseudo-random
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickWeightedWinner(pool, totalWeight) {
  // Weighted draw for a local, organizer-run raffle — not a security context
  // (no secrets/tokens involved), so Math.random's non-cryptographic
  // randomness is an appropriate, standard choice here.
  // eslint-disable-next-line sonarjs/pseudo-random
  let roll = Math.random() * totalWeight;
  for (const entrant of pool) {
    roll -= entrant.entries;
    if (roll <= 0) return entrant;
  }
  return pool[pool.length - 1];
}

// Pops and resolves the front of the Prize Queue: a specific prize id, or
// `null` for a queued Mystery slot, drawn randomly here and constrained to
// skip any prize whose remaining stock is already fully reserved by a
// specific entry still waiting later in the same queue (see
// reservedCounts) — so e.g. a 1-off prize queued for its own turn can
// never also get handed out early as someone else's "mystery" reveal.
function resolveFromQueue() {
  const [front, ...rest] = state.prizeQueue;
  state.prizeQueue = rest;
  if (front === null) {
    const prize = pickMysteryPrize(reservedCounts(rest));
    return { prize, source: prize ? 'mystery' : 'none' };
  }
  const prize = prizes.find((p) => p.id === front) || null;
  return { prize, source: prize ? 'queue' : 'none' };
}

function resolveFromCurrentPrizeId() {
  const selected = prizes.find((p) => p.id === state.currentPrizeId);
  const prize = selected && selected.quantity > 0 ? selected : null;
  return { prize, source: prize ? 'specific' : 'none' };
}

// Resolves which prize (if any) this spin is for, and claims one unit of
// it (dropping it from the selectable pool at zero stock). Precedence:
//   1. Prize Queue (resolveFromQueue) — a pre-set, organizer-ordered
//      sequence, revealed in advance same as a single specific selection.
//   2. A specific prize explicitly selected (resolveFromCurrentPrizeId).
//   3. Mystery — a fresh random draw from the mystery-eligible, in-stock
//      pool. This is the implicit default whenever neither of the above is
//      set (or the specific selection just sold out), so a spin never
//      blocks for lack of a prize pick; it's also what "Mystery Prize" in
//      the picker selects explicitly (by clearing 1 and 2).
// A queue that resolved to nothing (an exhausted Mystery slot, see above)
// does *not* fall through to this unconstrained draw — otherwise it could
// hand out stock that's promised to a later, specific queue entry.
function resolveAndClaimPrize() {
  pruneQueue();
  let result = { prize: null, source: 'none' };
  let queued = false;

  if (state.prizeQueue.length > 0) {
    queued = true;
    result = resolveFromQueue();
  } else if (state.currentPrizeId) {
    result = resolveFromCurrentPrizeId();
  }

  if (!result.prize && !queued) {
    const prize = pickMysteryPrize(new Map());
    result = { prize, source: prize ? 'mystery' : 'none' };
  }

  const { prize: currentPrize, source } = result;
  if (currentPrize) {
    currentPrize.quantity -= 1;
    if (currentPrize.quantity <= 0 && state.currentPrizeId === currentPrize.id) {
      state.currentPrizeId = null;
    }
    savePrizes(prizes);
    pruneQueue(); // this win may have just depleted another prize still queued further back
  }
  return { prize: currentPrize, source };
}

const upload = multer({
  storage: multer.memoryStorage(),
  // 8MB is a deliberate, generous cap for a single prize photo on this
  // local, single-organizer tool (not a public-facing service) — plenty for
  // a phone photo, small enough to keep memory use and disk usage sane.
  // eslint-disable-next-line sonarjs/content-length
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

const app = express();
app.disable('x-powered-by'); // don't advertise the framework/version to clients
app.use(express.json());
app.use('/api/prizes/images', express.static(PRIZE_IMAGES_DIR));

app.get('/api/state', (req, res) => {
  res.json(state);
});

// Adds one entrant: persisted to entrants.config.json (so it survives a
// Reset, same as anyone edited in by hand) and appended directly to the
// live pool — deliberately NOT a full config reload, so it doesn't disturb
// tickets already spun away from everyone else mid-event.
app.post('/api/entrants', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const entries = Number.parseInt(req.body.entries, 10);

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!Number.isInteger(entries) || entries < 1) {
    return res.status(400).json({ error: 'Entries must be a whole number of at least 1.' });
  }

  let rawEntrants;
  try {
    rawEntrants = readEntrantsConfigRaw();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (rawEntrants.some((e) => (e.email || '').trim().toLowerCase() === email)) {
    return res.status(400).json({ error: `An entrant with email ${email} already exists.` });
  }

  rawEntrants.push({ name, email, entries });
  writeEntrantsConfigRaw(rawEntrants);

  const newEntrant = { id: email, name, email, entries };
  state.pool = [...state.pool, newEntrant];
  saveState(state);
  appendAudit('add_entrant', { name, email, details: `entries: ${entries}` });
  res.json({ pool: state.pool, added: newEntrant });
});

// Bulk version of the above from a CSV's name,email,entries rows (a header
// row is optional and auto-detected). Invalid rows and duplicate emails are
// skipped and reported rather than failing the whole import.
app.post('/api/entrants/import', (req, res) => {
  const csvText = req.body.csv;
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return res.status(400).json({ error: 'CSV content is required.' });
  }

  const rows = parseCsv(csvText);
  const looksLikeHeader = rows.length > 0 && rows[0].some((c) => /^(name|email|entries)$/i.test(c));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  let rawEntrants;
  try {
    rawEntrants = readEntrantsConfigRaw();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const seenEmails = new Set(rawEntrants.map((e) => (e.email || '').trim().toLowerCase()).filter(Boolean));
  const added = [];
  const skipped = [];

  for (const row of dataRows) {
    const [rawName, rawEmail, rawEntries] = row;
    const name = (rawName || '').trim();
    const email = (rawEmail || '').trim().toLowerCase();
    const entries = Number.parseInt(rawEntries, 10);

    if (!name || !email || !Number.isInteger(entries) || entries < 1) {
      skipped.push({ row, reason: 'Missing name/email or invalid entries.' });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ row, reason: 'Duplicate email.' });
      continue;
    }
    seenEmails.add(email);

    rawEntrants.push({ name, email, entries });
    added.push({ id: email, name, email, entries });
  }

  if (added.length > 0) {
    writeEntrantsConfigRaw(rawEntrants);
    state.pool = [...state.pool, ...added];
    saveState(state);
  }
  appendAudit('import_entrants', { details: `added ${added.length}, skipped ${skipped.length}` });

  res.json({ pool: state.pool, addedCount: added.length, skipped });
});

// Edits one entrant's ticket count from the GUI (the pencil icon in the
// entrants sidebar) instead of hand-editing entrants.config.json. Persists
// to the config file, same as Add Entrants, so it survives a Reset — and
// also sets the count directly on the live pool so it takes effect this
// round without needing a Load Entrants.
app.patch('/api/entrants/:id', (req, res) => {
  const { id } = req.params;
  const entries = Number.parseInt(req.body.entries, 10);
  if (!Number.isInteger(entries) || entries < 1) {
    return res.status(400).json({ error: 'Entries must be a whole number of at least 1.' });
  }

  let rawEntrants;
  try {
    rawEntrants = readEntrantsConfigRaw();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const idx = rawEntrants.findIndex((e, i) => entrantId(e, i) === id);
  if (idx === -1) return res.status(404).json({ error: 'Entrant not found.' });

  const before = rawEntrants[idx];
  rawEntrants[idx] = { ...before, entries };
  writeEntrantsConfigRaw(rawEntrants);

  state.pool = state.pool.map((e) => (e.id === id ? { ...e, entries } : e));
  saveState(state);
  appendAudit('edit_entrant', { name: before.name, email: id, details: `entries: ${before.entries} -> ${entries}` });

  res.json({ pool: state.pool });
});

// Only prizes still in stock are selectable — same pattern as the entrant
// pool, which only lists entrants with entries > 0. Depleted prizes stay in
// prizes.json (so past history's prizeId/prizeImageUrl still resolve) but
// drop out of what the picker and Mystery Prize can offer.
app.get('/api/prizes', (req, res) => {
  res.json(prizes.filter((p) => p.quantity > 0));
});

// Shared by create (Add Prize) and edit (PATCH): the only difference between
// the two is whether quantity may be 0 — an edit can zero out existing stock
// the same way a spin does, but you can't *create* a prize with none to give
// away.
function parsePrizeInput(body, minQuantity) {
  const name = (body.name || '').trim();
  const quantity = Number.parseInt(body.quantity, 10);
  const value = body.value === undefined || body.value === '' ? 0 : Number(body.value);

  if (!name) return { error: 'Prize name is required.' };
  if (!Number.isInteger(quantity) || quantity < minQuantity) {
    return { error: `Quantity must be a whole number of ${minQuantity} or more.` };
  }
  if (!Number.isFinite(value) || value < 0) {
    return { error: 'Cost must be a number of 0 or more.' };
  }
  return { name, quantity, value };
}

// Normalizes any uploaded image (PNG/JPEG/etc, any source aspect ratio) into
// a consistent square icon: auto-rotated per EXIF, centre-cropped to fill a
// PRIZE_ICON_SIZE square, saved as PNG so every prize card looks uniform
// regardless of what was uploaded.
app.post('/api/prizes', upload.single('image'), async (req, res) => {
  const parsed = parsePrizeInput(req.body, 1);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { name, quantity, value } = parsed;
  if (!req.file) return res.status(400).json({ error: 'An image file is required.' });

  const id = crypto.randomUUID();
  try {
    fs.mkdirSync(PRIZE_IMAGES_DIR, { recursive: true });
    await sharp(req.file.buffer)
      .rotate()
      .resize(PRIZE_ICON_SIZE, PRIZE_ICON_SIZE, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(path.join(PRIZE_IMAGES_DIR, `${id}.png`));
  } catch {
    return res.status(400).json({ error: 'Could not process that image file.' });
  }

  const prize = {
    id,
    name,
    imageUrl: `/api/prizes/images/${id}.png`,
    quantity,
    value,
    mysteryEligible: true,
    createdAt: new Date().toISOString(),
  };
  prizes = [...prizes, prize];
  savePrizes(prizes);
  appendAudit('add_prize', { prize: name, details: `quantity: ${quantity}, cost: ${value}` });
  res.json(prize);
});

// Edits a prize's name, remaining quantity and/or value from the GUI (the
// pencil icon on a prize card) instead of only being settable at creation.
// Quantity here may drop to 0 (unlike Add Prize's minimum of 1) — same
// "out of stock" state a prize reaches naturally by being won out, so it
// simply drops out of the picker/queue/Mystery pool without needing a
// delete. Value drives which fanfare tier plays when this prize is won, so
// it's editable independently of a re-upload.
app.patch('/api/prizes/:id', (req, res) => {
  const prize = prizes.find((p) => p.id === req.params.id);
  if (!prize) return res.status(404).json({ error: 'Prize not found.' });

  const parsed = parsePrizeInput(req.body, 0);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { name, quantity, value } = parsed;

  const before = { name: prize.name, quantity: prize.quantity, value: prize.value };
  prize.name = name;
  prize.quantity = quantity;
  prize.value = value;
  savePrizes(prizes);
  // Same as a spin claiming the last unit: an edit that zeroes out the
  // currently-selected prize falls back to Mystery rather than leaving a
  // dead selection armed.
  if (quantity <= 0 && state.currentPrizeId === prize.id) state.currentPrizeId = null;
  pruneQueue();
  saveState(state);
  appendAudit('edit_prize', {
    prize: name,
    details: `name: ${before.name} -> ${name}, quantity: ${before.quantity} -> ${quantity}, cost: ${before.value} -> ${value}`,
  });
  res.json({ prize, currentPrizeId: state.currentPrizeId, prizeQueue: state.prizeQueue });
});

// Toggles whether a prize can turn up in a random Mystery draw (the
// implicit default, and any queued Mystery slot) — lets a bigger prize
// stay in the catalogue, selectable by name or via a queue slot, without
// risking getting handed out early by a random pick.
app.patch('/api/prizes/:id/mystery-eligible', (req, res) => {
  const prize = prizes.find((p) => p.id === req.params.id);
  if (!prize) return res.status(404).json({ error: 'Prize not found.' });
  prize.mysteryEligible = Boolean(req.body.mysteryEligible);
  savePrizes(prizes);
  appendAudit('mystery_eligible', { prize: prize.name, details: `eligible: ${prize.mysteryEligible}` });
  res.json(prize);
});

app.delete('/api/prizes/:id', (req, res) => {
  const { id } = req.params;
  // Only remove an image file for an id that actually matched a known
  // prize — those ids are always our own crypto.randomUUID() values.
  // Passing the raw URL param straight into a filesystem path unconditioned
  // on that check would let a `..`-laden id delete a file outside
  // PRIZE_IMAGES_DIR.
  const existingPrize = prizes.find((p) => p.id === id);
  prizes = prizes.filter((p) => p.id !== id);
  savePrizes(prizes);
  if (existingPrize) fs.rm(path.join(PRIZE_IMAGES_DIR, `${id}.png`), { force: true }, () => {});
  if (state.currentPrizeId === id) state.currentPrizeId = null;
  pruneQueue();
  saveState(state);
  if (existingPrize) appendAudit('delete_prize', { prize: existingPrize.name });
  res.json({ ok: true, prizeQueue: state.prizeQueue });
});

// Selects a specific prize to draw for ({ prizeId }), or explicitly returns
// to Mystery mode ({ prizeId: null }) — either way this is a single,
// pre-announced-or-random choice, so it cancels any active Prize Queue
// (queue vs. specific-selection vs. Mystery are mutually exclusive modes).
app.post('/api/current-prize', (req, res) => {
  const { prizeId } = req.body;
  if (prizeId && !prizes.some((p) => p.id === prizeId && p.quantity > 0)) {
    return res.status(400).json({ error: 'Unknown or out-of-stock prize.' });
  }
  state.currentPrizeId = prizeId || null;
  state.prizeQueue = [];
  saveState(state);
  const selectedName = prizeId ? prizes.find((p) => p.id === prizeId)?.name : 'Mystery Prize';
  appendAudit('select_prize', { prize: selectedName });
  res.json({ currentPrizeId: state.currentPrizeId, prizeQueue: state.prizeQueue });
});

// Replaces the whole Prize Queue with an ordered list of prize ids — the
// client recomputes the array locally for add/remove/reorder and always
// sends the full result, so one endpoint covers all three. An entry can be
// `null` for a queued Mystery slot instead of a specific prize. Selecting a
// queue cancels a specific single-prize selection (queue takes over).
app.post('/api/prize-queue', (req, res) => {
  const queue = Array.isArray(req.body.queue) ? req.body.queue : [];
  const invalid = queue.some((id) => id !== null && (typeof id !== 'string' || !prizes.some((p) => p.id === id)));
  if (invalid) {
    return res.status(400).json({ error: 'Queue includes an unknown prize.' });
  }
  state.prizeQueue = queue;
  state.currentPrizeId = null;
  saveState(state);
  const queueNames = queue.map((id) => (id === null ? 'Mystery' : prizes.find((p) => p.id === id)?.name || '?'));
  appendAudit('set_queue', { details: queue.length ? queueNames.join(' > ') : 'cleared' });
  res.json({ prizeQueue: state.prizeQueue, currentPrizeId: state.currentPrizeId });
});

app.post('/api/spin', (req, res) => {
  const pool = state.pool;
  const totalWeight = pool.reduce((sum, e) => sum + e.entries, 0);

  if (pool.length === 0 || totalWeight <= 0) {
    return res.status(400).json({ error: 'No entrants left in the wheel.' });
  }
  // Checked before touching a winner or a ticket: a spin that couldn't
  // possibly award anything (empty catalogue, or every prize already won
  // out) is refused outright rather than quietly declaring "no prize" —
  // nobody should lose their one shot at a prize to a misclick made before
  // the catalogue was set up.
  if (!prizes.some((p) => p.quantity > 0)) {
    return res.status(400).json({ error: 'No prizes available — add one in the Prize Picker before spinning.' });
  }

  const poolBefore = pool.map((e) => ({ ...e }));

  const winner = pickWeightedWinner(pool, totalWeight);
  winner.entries -= 1;
  const entriesRemaining = winner.entries;

  const { prize: currentPrize, source: prizeSource } = resolveAndClaimPrize();

  const historyEntry = {
    id: winner.id,
    name: winner.name,
    email: winner.email,
    wonAt: new Date().toISOString(),
    entriesRemaining,
    prizeId: currentPrize ? currentPrize.id : null,
    prizeName: currentPrize ? currentPrize.name : null,
    prizeImageUrl: currentPrize ? currentPrize.imageUrl : null,
    prizeValue: currentPrize ? currentPrize.value : null,
    wasMysteryPrize: prizeSource === 'mystery',
  };
  state.history = [historyEntry, ...state.history];
  state.pool = pool.filter((e) => e.entries > 0);

  saveState(state);
  appendAudit('spin', {
    name: winner.name,
    email: winner.email,
    prize: historyEntry.prizeName || '',
    details: historyEntry.wasMysteryPrize ? 'mystery' : '',
  });

  res.json({
    winner: {
      id: winner.id,
      name: winner.name,
      email: winner.email,
      entriesRemaining,
      prizeName: historyEntry.prizeName,
      prizeImageUrl: historyEntry.prizeImageUrl,
      prizeValue: historyEntry.prizeValue,
      wasMysteryPrize: historyEntry.wasMysteryPrize,
    },
    poolBefore,
    poolAfter: state.pool,
    history: state.history,
    prizes: prizes.filter((p) => p.quantity > 0),
    currentPrizeId: state.currentPrizeId,
    prizeQueue: state.prizeQueue,
  });
});

// Raw view/fetch of the current audit log — mainly for debugging; the
// organizer-facing way to get a copy is the Export Log button (/api/log/export)
// below, since a browser download always lands in the browser's own
// downloads folder regardless of where the organizer actually wants it.
app.get('/api/log', (req, res) => {
  const filePath = ensureLogFile(state.currentLogFile);
  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${state.currentLogFile}"`);
  res.send(content);
});

app.get('/api/settings', (req, res) => {
  res.json({ logFolder: settings.logFolder, currentLogFile: state.currentLogFile });
});

// Validates a folder path is actually creatable/writable before accepting it
// — saving should mean "this works," not just "this string is non-empty,"
// otherwise a bad path only surfaces later as a confusing failure on Export.
function assertUsableFolder(folder) {
  try {
    fs.mkdirSync(folder, { recursive: true });
    return null;
  } catch (e) {
    return `Could not create/access "${folder}": ${e.message}`;
  }
}

app.post('/api/settings', (req, res) => {
  const logFolder = (req.body.logFolder || '').trim();
  if (!logFolder) return res.status(400).json({ error: 'Log folder is required.' });
  const folderError = assertUsableFolder(logFolder);
  if (folderError) return res.status(400).json({ error: folderError });

  const before = settings.logFolder;
  settings = { ...settings, logFolder };
  saveSettings(settings);
  appendAudit('update_settings', { details: `log folder: ${before} -> ${logFolder}` });
  res.json({ logFolder: settings.logFolder });
});

// Copies the current log file to the configured folder on this machine.
// This app runs entirely locally (see README), so "download" here means a
// direct filesystem copy to wherever the organizer wants it, rather than a
// browser download prompt that always lands in the browser's own downloads
// folder regardless of preference. Accepts an optional `logFolder` so the
// button always acts on whatever's currently typed in the field — without
// this, exporting right after editing the folder (without a separate Save
// first) would silently use the previous, already-saved value instead.
app.post('/api/log/export', (req, res) => {
  const requestedFolder = (req.body.logFolder || '').trim();
  const targetFolder = requestedFolder || settings.logFolder;

  const folderError = assertUsableFolder(targetFolder);
  if (folderError) return res.status(400).json({ error: folderError });

  if (requestedFolder && requestedFolder !== settings.logFolder) {
    const before = settings.logFolder;
    settings = { ...settings, logFolder: requestedFolder };
    saveSettings(settings);
    appendAudit('update_settings', { details: `log folder: ${before} -> ${requestedFolder}` });
  }

  const sourcePath = ensureLogFile(state.currentLogFile);
  const destPath = path.join(targetFolder, state.currentLogFile);
  try {
    fs.copyFileSync(sourcePath, destPath);
  } catch (e) {
    return res.status(400).json({ error: `Could not write log file: ${e.message}` });
  }
  res.json({ path: destPath });
});

// Reloads entrants.config.json into the pool but keeps the existing winner
// history — for adding/editing entrants mid-event without losing the round.
// Same log file as before; only Reset rotates to a new one (see below).
app.post('/api/load-entrants', (req, res) => {
  try {
    state = {
      pool: loadEntrantsConfig(),
      history: state.history,
      currentPrizeId: state.currentPrizeId,
      prizeQueue: state.prizeQueue,
      currentLogFile: state.currentLogFile,
    };
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  saveState(state);
  const tickets = state.pool.reduce((s, e) => s + e.entries, 0);
  appendAudit('load_entrants', { details: `${state.pool.length} entrants, ${tickets} tickets` });
  res.json(state);
});

// Full wipe: reloads entrants.config.json AND clears winner history — and,
// unlike Load Entrants, rotates the audit log to a freshly-dated file, so
// each "reset" of the board starts its own clean trail rather than mixing
// a new round's actions into the outgoing one. The old log file is left
// exactly as it was, never overwritten. The prize catalogue and current
// prize selection are a separate concern and are left as-is.
app.post('/api/reset', (req, res) => {
  let fresh;
  try {
    fresh = freshState();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const nextLogFile = newLogFileName();
  appendAudit('reset', { details: `board and history cleared; next log file: ${nextLogFile}` });
  state = { ...fresh, currentPrizeId: state.currentPrizeId, prizeQueue: state.prizeQueue, currentLogFile: nextLogFile };
  ensureLogFile(nextLogFile);
  saveState(state);
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`WheelRaffle server running at http://localhost:${PORT}`);
});
