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
- The gear-icon menu (top right) has two distinct actions:
  - **Load Entrants** re-reads `entrants.config.json` and refreshes ticket counts,
    but keeps the winner history — use this after editing the config file mid-event.
  - **Reset** wipes the current board *and* the in-app winner history, then reloads
    fresh from `entrants.config.json` — a full restart. It does **not** touch the
    spin log (see below); every past spin is already permanently recorded there.
- The draw is a scrolling name reel weighted by ticket count (someone with 3 entries
  appears 3 times, scattered through the reel) — a pie wheel can't keep hundreds of
  individual slices legible at any sane page size, so this stays fully readable
  regardless of how many entrants or tickets are in play.
- Click the people icon (top left) to pull out a sidebar listing every current
  entrant and their remaining ticket count. **This is deliberately the only place
  ticket counts are shown** — the winner banner and Winner History only ever show a
  name (and prize, if one's selected), never a number, so what's presented to a room
  keeps some mystery rather than telegraphing anyone's odds.

## Prizes

Click the prize badge above the Spin button (or the gift icon it shows when nothing's
selected) to open the prize picker:

- **Add a prize**: give it a name, a quantity (how many you have to give away), and
  pick any image file (PNG, JPEG, whatever) — the server centre-crops and resizes it
  to a uniform 320×320 icon (via `sharp`) so every prize card looks consistent
  regardless of the source photo's shape, and converts it to PNG. Originals aren't
  kept; only the normalized icon is stored, under `server/data/prize-images/`
  (gitignored).
- Each win claims **one unit** of the prize drawn (shown as a small `×N` badge on its
  card in the picker — not shown anywhere on the presented screen, same reasoning as
  ticket counts below). Once a prize hits zero it drops out of the picker and Mystery
  Prize's pool, same as a ticket-pool entrant hitting zero entries; if it was the
  active selection, the badge reverts to "Pick a prize" and Spin re-locks until you
  choose the next one.
- **Select a prize** before spinning — every win from that point is recorded against
  it: the winner banner, Winner History, and the CSV spin log (an added `prize`
  column) all show which prize was drawn. The selection persists across spins, so
  you set it once per prize and keep spinning until you move to the next one.
- **Mystery Prize**: instead of picking one, choose the dice tile to have the server
  randomly draw a different prize from the catalogue *at spin time* — nobody, not
  even you, knows which one until the winner's revealed alongside it. Stays in
  Mystery mode for subsequent spins until you pick something else.
- Once any prizes exist, **Spin is disabled until you've chosen one** (a specific
  prize or Mystery) — a raffle can't run without something on the line. With zero
  prizes in the catalogue there's nothing to require, so spinning is unrestricted.
- Deleting a prize removes its icon file but leaves past history entries intact (they
  keep a snapshot of the prize name at the time of the win).

## Spin log

Every spin appends a row to `server/data/spins.csv` (gitignored):
`datetime,name,email,prize`.
Unlike the in-app Winner History panel, this log is never cleared by Load Entrants or
Reset — it's a running audit trail across the whole life of the app. Grab it anytime
via the **Download spin log (CSV)** link in the gear-icon menu, or `GET /api/log`, or
just open the file directly in `server/data/`.

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

Just edit `entrants.config.json` and click **Load Entrants** (gear icon, top right) in
the app to refresh ticket counts without losing winner history — or **Reset** for a
full fresh start. Example shape:

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
  src/components/PrizePicker.jsx    # add/select/delete prizes, Mystery Prize
  src/components/PrizeBadge.jsx     # the "Drawing for..." badge above Spin
  src/lib/randomOrder.js            # deterministic shuffle shared by the reel
```
