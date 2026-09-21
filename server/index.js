import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'entrants.config.json');
const STATE_PATH = path.join(__dirname, 'data', 'state.json');
const LOG_PATH = path.join(__dirname, 'data', 'spins.csv');
const PRIZES_META_PATH = path.join(__dirname, 'data', 'prizes.json');
const PRIZE_IMAGES_DIR = path.join(__dirname, 'data', 'prize-images');
const PRIZE_ICON_SIZE = 320;
const PORT = process.env.PORT || 4000;

function loadEntrantsConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const entrants = JSON.parse(raw);
  if (!Array.isArray(entrants)) {
    throw new Error('entrants.config.json must be a JSON array of { name, email, entries }');
  }
  return entrants
    .map((e, i) => ({
      id: (e.email && e.email.trim().toLowerCase()) || `${e.name}-${i}`,
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

// Append-only audit trail of every spin, independent of state.json/history —
// Load Entrants/Reset clear the current round but never touch this log.
function appendSpinLog(entry) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, 'datetime,name,email,prize\n');
  }
  fs.appendFileSync(
    LOG_PATH,
    `${csvField(entry.wonAt)},${csvField(entry.name)},${csvField(entry.email)},${csvField(entry.prizeName)}\n`
  );
}

function loadPrizes() {
  if (!fs.existsSync(PRIZES_META_PATH)) return [];
  let loaded;
  try {
    loaded = JSON.parse(fs.readFileSync(PRIZES_META_PATH, 'utf-8'));
  } catch {
    return [];
  }
  // Prizes saved before the mystery-eligibility flag existed default to
  // eligible, so nothing already in play silently drops out of the pool.
  loaded.forEach((p) => {
    if (typeof p.mysteryEligible !== 'boolean') p.mysteryEligible = true;
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
saveState(state);
let prizes = loadPrizes();

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

  res.json({ pool: state.pool, addedCount: added.length, skipped });
});

// Only prizes still in stock are selectable — same pattern as the entrant
// pool, which only lists entrants with entries > 0. Depleted prizes stay in
// prizes.json (so past history's prizeId/prizeImageUrl still resolve) but
// drop out of what the picker and Mystery Prize can offer.
app.get('/api/prizes', (req, res) => {
  res.json(prizes.filter((p) => p.quantity > 0));
});

// Normalizes any uploaded image (PNG/JPEG/etc, any source aspect ratio) into
// a consistent square icon: auto-rotated per EXIF, centre-cropped to fill a
// PRIZE_ICON_SIZE square, saved as PNG so every prize card looks uniform
// regardless of what was uploaded.
app.post('/api/prizes', upload.single('image'), async (req, res) => {
  const name = (req.body.name || '').trim();
  const quantity = Number.parseInt(req.body.quantity, 10);
  if (!name) return res.status(400).json({ error: 'Prize name is required.' });
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'Quantity must be a whole number of at least 1.' });
  }
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
    mysteryEligible: true,
    createdAt: new Date().toISOString(),
  };
  prizes = [...prizes, prize];
  savePrizes(prizes);
  res.json(prize);
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
  res.json(prize);
});

app.delete('/api/prizes/:id', (req, res) => {
  const { id } = req.params;
  prizes = prizes.filter((p) => p.id !== id);
  savePrizes(prizes);
  fs.rm(path.join(PRIZE_IMAGES_DIR, `${id}.png`), { force: true }, () => {});
  if (state.currentPrizeId === id) state.currentPrizeId = null;
  pruneQueue();
  saveState(state);
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
  res.json({ prizeQueue: state.prizeQueue, currentPrizeId: state.currentPrizeId });
});

app.post('/api/spin', (req, res) => {
  const pool = state.pool;
  const totalWeight = pool.reduce((sum, e) => sum + e.entries, 0);

  if (pool.length === 0 || totalWeight <= 0) {
    return res.status(400).json({ error: 'No entrants left in the wheel.' });
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
    wasMysteryPrize: prizeSource === 'mystery',
  };
  state.history = [historyEntry, ...state.history];
  state.pool = pool.filter((e) => e.entries > 0);

  saveState(state);
  appendSpinLog(historyEntry);

  res.json({
    winner: {
      id: winner.id,
      name: winner.name,
      email: winner.email,
      entriesRemaining,
      prizeName: historyEntry.prizeName,
      prizeImageUrl: historyEntry.prizeImageUrl,
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

app.get('/api/log', (req, res) => {
  const content = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf-8') : 'datetime,name,email,prize\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wheelraffle-spins.csv"');
  res.send(content);
});

// Reloads entrants.config.json into the pool but keeps the existing winner
// history — for adding/editing entrants mid-event without losing the round.
app.post('/api/load-entrants', (req, res) => {
  try {
    state = {
      pool: loadEntrantsConfig(),
      history: state.history,
      currentPrizeId: state.currentPrizeId,
      prizeQueue: state.prizeQueue,
    };
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  saveState(state);
  res.json(state);
});

// Full wipe: reloads entrants.config.json AND clears winner history. The
// spin log (appendSpinLog above) already has every past spin permanently
// recorded and is untouched by this. The prize catalogue and current prize
// selection are a separate concern and are left as-is.
app.post('/api/reset', (req, res) => {
  try {
    state = { ...freshState(), currentPrizeId: state.currentPrizeId, prizeQueue: state.prizeQueue };
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  saveState(state);
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`WheelRaffle server running at http://localhost:${PORT}`);
});
