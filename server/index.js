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

function freshState() {
  return { pool: loadEntrantsConfig(), history: [] };
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
  try {
    return JSON.parse(fs.readFileSync(PRIZES_META_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function savePrizes(prizes) {
  fs.mkdirSync(path.dirname(PRIZES_META_PATH), { recursive: true });
  fs.writeFileSync(PRIZES_META_PATH, JSON.stringify(prizes, null, 2));
}

let state = loadState();
saveState(state);
let prizes = loadPrizes();

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

app.get('/api/prizes', (req, res) => {
  res.json(prizes);
});

// Normalizes any uploaded image (PNG/JPEG/etc, any source aspect ratio) into
// a consistent square icon: auto-rotated per EXIF, centre-cropped to fill a
// PRIZE_ICON_SIZE square, saved as PNG so every prize card looks uniform
// regardless of what was uploaded.
app.post('/api/prizes', upload.single('image'), async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Prize name is required.' });
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

  const prize = { id, name, imageUrl: `/api/prizes/images/${id}.png`, createdAt: new Date().toISOString() };
  prizes = [...prizes, prize];
  savePrizes(prizes);
  res.json(prize);
});

app.delete('/api/prizes/:id', (req, res) => {
  const { id } = req.params;
  prizes = prizes.filter((p) => p.id !== id);
  savePrizes(prizes);
  fs.rm(path.join(PRIZE_IMAGES_DIR, `${id}.png`), { force: true }, () => {});
  if (state.currentPrizeId === id) {
    state.currentPrizeId = null;
    saveState(state);
  }
  res.json({ ok: true });
});

app.post('/api/current-prize', (req, res) => {
  const { prizeId } = req.body;
  if (prizeId && !prizes.some((p) => p.id === prizeId)) {
    return res.status(400).json({ error: 'Unknown prize.' });
  }
  state.currentPrizeId = prizeId || null;
  saveState(state);
  res.json({ currentPrizeId: state.currentPrizeId });
});

app.post('/api/spin', (req, res) => {
  const pool = state.pool;
  const totalWeight = pool.reduce((sum, e) => sum + e.entries, 0);

  if (pool.length === 0 || totalWeight <= 0) {
    return res.status(400).json({ error: 'No entrants left in the wheel.' });
  }

  const poolBefore = pool.map((e) => ({ ...e }));

  // Weighted draw for a local, organizer-run raffle — not a security context
  // (no secrets/tokens involved), so Math.random's non-cryptographic
  // randomness is an appropriate, standard choice here.
  // eslint-disable-next-line sonarjs/pseudo-random
  let roll = Math.random() * totalWeight;
  let winner = null;
  for (const entrant of pool) {
    roll -= entrant.entries;
    if (roll <= 0) {
      winner = entrant;
      break;
    }
  }
  if (!winner) winner = pool[pool.length - 1];

  winner.entries -= 1;
  const entriesRemaining = winner.entries;

  const currentPrize = prizes.find((p) => p.id === state.currentPrizeId) || null;
  const historyEntry = {
    id: winner.id,
    name: winner.name,
    email: winner.email,
    wonAt: new Date().toISOString(),
    entriesRemaining,
    prizeId: currentPrize ? currentPrize.id : null,
    prizeName: currentPrize ? currentPrize.name : null,
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
    },
    poolBefore,
    poolAfter: state.pool,
    history: state.history,
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
    state = { pool: loadEntrantsConfig(), history: state.history, currentPrizeId: state.currentPrizeId };
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
    state = { ...freshState(), currentPrizeId: state.currentPrizeId };
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  saveState(state);
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`WheelRaffle server running at http://localhost:${PORT}`);
});
