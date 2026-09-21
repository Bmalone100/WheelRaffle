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
  regardless of how many entrants or tickets are in play. An entrant's repeated
  tickets are spread out rather than shown back-to-back, so "Jane Doe / Jane Doe" on
  consecutive rows never reads as a glitch to someone who doesn't know it's just two
  tickets.
- Click the people icon (top left) to pull out a sidebar listing every current
  entrant and their remaining ticket count. **This is deliberately the only place
  ticket counts are shown** — the winner banner and Winner History only ever show a
  name (and prize, if one's selected), never a number, so what's presented to a room
  keeps some mystery rather than telegraphing anyone's odds.
- Click a name in that sidebar to reveal their email underneath (click again to hide
  it) — so you know where to send a prize-winner email without it being on screen
  the rest of the time.
- **Add Entrants** (button at the top of that sidebar) adds people without touching
  `entrants.config.json` by hand: either one at a time (name, email, entries — all
  required), or by picking a CSV file, which imports immediately on selection (no
  separate "import" click). CSV columns are `name,email,entries`; a header row is
  optional and auto-detected. Either way, new entrants are appended to
  `entrants.config.json` (so they survive a Reset) *and* added straight to the live
  pool — this does not touch anyone else's already-spun-away tickets, unlike Load
  Entrants' full reload. Duplicate emails and invalid rows are rejected (or skipped
  and reported, for CSV) rather than silently overwriting an existing entrant.

## Prizes

Click the prize badge above the Spin button (it shows "Mystery Prize" by default) to
open the prize picker:

- **Add a prize**: give it a name, a quantity (how many you have to give away), and
  pick any image file (PNG, JPEG, whatever) — the server centre-crops and resizes it
  to a uniform 320×320 icon (via `sharp`) so every prize card looks consistent
  regardless of the source photo's shape, and converts it to PNG. Originals aren't
  kept; only the normalized icon is stored, under `server/data/prize-images/`
  (gitignored).
- Each win claims **one unit** of the prize drawn (shown as a small `×N` badge on its
  card in the picker — not shown anywhere on the presented screen, same reasoning as
  ticket counts below). Once a prize hits zero it drops out of the picker, the queue,
  and Mystery Prize's pool, same as a ticket-pool entrant hitting zero entries.
- Spinning always has something to resolve to. In order:
  1. **Prize Queue** — a fixed, pre-set sequence, revealed in advance. Click the small
     "add to queue" icon on any prize card (or the Mystery Prize tile itself) to
     append it; the Prize Queue section below the grid lists the order, and each
     entry can be reordered or removed. Every spin claims and pops the front of the
     queue; once it's empty, spins fall back to whatever's set below.
     - A queue entry can itself be a **queued Mystery slot** — added from the Mystery
       Prize tile — which draws randomly *when its turn comes up*, same secrecy as
       the default, just at a pre-planned position in the sequence instead of
       whenever the queue runs out.
  2. **A specific prize**, selected by clicking its card — every win from that point
     is recorded against it until you pick something else. Selecting a specific
     prize (or Mystery) clears any queue.
  3. **Mystery Prize** — the default when neither of the above is set. The server
     randomly draws from the in-stock, mystery-eligible catalogue *at spin time*;
     nobody, not even you, knows which one until the winner's revealed alongside it.
  Spin is never blocked waiting on a prize choice — with no prizes in the catalogue
  at all, a spin simply has no prize to award.
- **Mystery-eligible**: each prize card has a small dice/eye-off toggle to exclude it
  from random Mystery draws (both the default and any queued Mystery slot) while
  keeping it in the catalogue — handy for a big-ticket prize you want to keep in
  reserve for a specific moment rather than risk it coming up early on a random pick.
  It's still selectable by name, or placed directly in the queue, either way.
- **Reserved stock stays reserved**: a prize placed specifically in the queue (not as
  a Mystery slot) has that unit set aside for its own turn — an earlier queued Mystery
  slot will never draw it if doing so would leave nothing for its dedicated slot
  later. If a Mystery slot's draw comes up with nothing eligible left to give
  (everything's either reserved ahead or excluded), that spin just awards no prize
  rather than dipping into stock that's spoken for.
- Deleting a prize removes its icon file, drops it from the queue if it was in one,
  and leaves past history entries intact (they keep a snapshot of the prize name at
  the time of the win).

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

Easiest: use **Add Entrants** in the entrants sidebar (people icon, top left) — see
above. You can still hand-edit `entrants.config.json` directly too (e.g. to change
someone's ticket count); after doing so, click **Load Entrants** (gear icon, top
right) to refresh from the file without losing winner history, or **Reset** for a
full fresh start. Example shape:

```json
[
  { "name": "Alice Byrne", "email": "alice@example.com", "entries": 3 },
  { "name": "Barry Coyle", "email": "barry@example.com", "entries": 1 }
]
```

`email` is used as each entrant's unique id (and is how you know who to contact
about a prize) — the Add Entrants GUI requires it, though hand-editing the JSON
file doesn't enforce that.

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
  src/components/SpinnerList.jsx      # the weighted, decelerating name reel
  src/components/EntrantSidebar.jsx   # entrant list, click-to-reveal email, Add Entrants
  src/components/AddEntrantsModal.jsx # single-entrant form + CSV import
  src/components/PrizePicker.jsx      # add/select/delete prizes, build/reorder the Prize Queue
  src/components/PrizeBadge.jsx       # the "Drawing for..." badge above Spin
  src/components/FilePicker.jsx       # shared single-control file input (image/CSV)
  src/lib/randomOrder.js              # deterministic shuffle + no-adjacent-repeat arrangement for the reel
```
