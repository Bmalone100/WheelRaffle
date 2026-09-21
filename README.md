# WheelRaffle

A local raffle draw app: React (Vite) frontend + a small Node/Express backend.
Runs entirely on your machine — no cloud dependency.

## How it works

- [`entrants.config.json`](entrants.config.json) at the project root is the file you
  manually edit: a JSON array of `{ "name", "email", "entries" }`.
- The Express server (`server/index.js`) loads that config on first run, builds a
  weighted ticket pool, and persists the *live* pool + winner history to
  `server/data/state.json` (gitignored) so state survives closing the app.
- Each spin removes **one ticket** from the winner. If they had more entries, they
  stay in the draw with one fewer; once they hit zero, they drop out entirely.
- **Reset Raffle** (in the gear-icon menu, top right) re-reads `entrants.config.json`
  from disk and clears the in-app winner history — use this after editing the config
  file, or to start a fresh round. It does **not** touch the spin log (see below).
- The draw is a scrolling name reel weighted by ticket count (someone with 3 entries
  appears 3 times, scattered through the reel) — a pie wheel can't keep hundreds of
  individual slices legible at any sane page size, so this stays fully readable
  regardless of how many entrants or tickets are in play.
- Click the people icon (top left) to pull out a sidebar listing every current
  entrant and their remaining ticket count.

## Spin log

Every spin appends a row to `server/data/spins.csv` (gitignored): `datetime,name,email`.
Unlike the in-app Winner History panel, this log is never cleared by Reset Raffle —
it's a running audit trail across the whole life of the app. Grab it anytime via the
**Download spin log (CSV)** link in the gear-icon menu, or `GET /api/log`, or just open
the file directly in `server/data/`.

## Running it

First time only:

```bash
npm run install:all
```

Then, from the project root:

```bash
npm run dev
```

This starts both the API (port 4000) and the Vite dev server (port 5173, proxying
`/api` to the backend) together. Open the URL Vite prints (usually
http://localhost:5173).

To run them separately instead:

```bash
npm start --prefix server     # terminal 1: API on :4000
npm run dev --prefix client   # terminal 2: Vite on :5173
```

## Editing entrants

Just edit `entrants.config.json` and click **Reset Raffle** (gear icon, top right) in
the app — this reloads from the file and clears winner history. Example shape:

```json
[
  { "name": "Alice Byrne", "email": "alice@example.com", "entries": 3 },
  { "name": "Barry Coyle", "email": "barry@example.com", "entries": 1 }
]
```

`email` is optional but recommended — it's used as the unique id when two entrants
share a name.

## Theme

Buttons, banners, the reel's frame and the winner confetti use eir's brand names,
**Heather** (purple) and **Wheat** (cream/gold), as CSS variables in
[`client/src/styles.css`](client/src/styles.css). I didn't have eir's exact official
hex values on hand, so the current values (`--heather: #5c3a7a`, `--wheat: #f5deb3`,
plus light/dark variants) are close approximations — swap them for the real brand hex
codes if you have eir's brand guide handy.

## Project structure

```
entrants.config.json   # you edit this
server/                # Express API + persisted state (server/data/, gitignored)
client/                # React + Vite frontend
  src/components/SpinnerList.jsx    # the weighted, decelerating name reel
  src/components/EntrantSidebar.jsx # pull-out list of current entrants + ticket counts
  src/lib/randomOrder.js            # deterministic shuffle shared by the reel
```
