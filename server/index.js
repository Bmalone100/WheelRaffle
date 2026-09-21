import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'entrants.config.json');
const STATE_PATH = path.join(__dirname, 'data', 'state.json');
const LOG_PATH = path.join(__dirname, 'data', 'spins.csv');
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
// a Reset Raffle clears the current round but never touches this log.
function appendSpinLog(entry) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, 'datetime,name,email\n');
  }
  fs.appendFileSync(LOG_PATH, `${csvField(entry.wonAt)},${csvField(entry.name)},${csvField(entry.email)}\n`);
}

let state = loadState();
saveState(state);

const app = express();
app.use(express.json());

app.get('/api/state', (req, res) => {
  res.json(state);
});

app.post('/api/spin', (req, res) => {
  const pool = state.pool;
  const totalWeight = pool.reduce((sum, e) => sum + e.entries, 0);

  if (pool.length === 0 || totalWeight <= 0) {
    return res.status(400).json({ error: 'No entrants left in the wheel.' });
  }

  const poolBefore = pool.map((e) => ({ ...e }));

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

  const historyEntry = {
    id: winner.id,
    name: winner.name,
    email: winner.email,
    wonAt: new Date().toISOString(),
    entriesRemaining,
  };
  state.history = [historyEntry, ...state.history];
  state.pool = pool.filter((e) => e.entries > 0);

  saveState(state);
  appendSpinLog(historyEntry);

  res.json({
    winner: { id: winner.id, name: winner.name, email: winner.email, entriesRemaining },
    poolBefore,
    poolAfter: state.pool,
    history: state.history,
  });
});

app.get('/api/log', (req, res) => {
  const content = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf-8') : 'datetime,name,email\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wheelraffle-spins.csv"');
  res.send(content);
});

// Reloads entrants.config.json into the pool but keeps the existing winner
// history — for adding/editing entrants mid-event without losing the round.
app.post('/api/load-entrants', (req, res) => {
  try {
    state = { pool: loadEntrantsConfig(), history: state.history };
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  saveState(state);
  res.json(state);
});

// Full wipe: reloads entrants.config.json AND clears winner history. The
// spin log (appendSpinLog above) already has every past spin permanently
// recorded and is untouched by this.
app.post('/api/reset', (req, res) => {
  try {
    state = freshState();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  saveState(state);
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`WheelRaffle server running at http://localhost:${PORT}`);
});
