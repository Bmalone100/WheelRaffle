# WheelRaffle

A local raffle draw app — React (Vite) frontend + a small Node/Express backend.
Runs entirely on your machine, no cloud dependency, no bundled assets.

## Running it

```bash
npm run install:all   # first time only
npm run dev           # API on :4000, Vite on :5173 (proxies /api)
```

Open the URL Vite prints (usually http://localhost:5173). To run the two halves
separately: `npm start --prefix server` and `npm run dev --prefix client`.

## Updating a local copy (`git pull`)

If you're running your own copy of this app with your own entrants and prizes
already set up, here's what a pull can and can't affect:

- **Safe automatically — `git pull` never touches these:** `server/data/` (prizes,
  prize photos, live pool/history, settings, audit logs) is entirely gitignored.
  Schema additions to these files (a new field on a prize, etc.) are always given a
  backward-compatible default the first time the server boots after the update, so
  existing data upgrades in place rather than breaking or resetting.
- **Not gitignored — back this up first:** [`entrants.config.json`](entrants.config.json)
  *is* tracked by git, despite being per-deployment data same as your prizes. If
  you've edited it locally, `git pull` can refuse ("local changes would be
  overwritten by merge") or conflict. Copy it somewhere safe before pulling, then
  restore it (or resolve the conflict) after. This split — one piece of "your
  event's data" tracked, the rest not — is a known inconsistency in the project
  layout, not a deliberate design; untracking the file is the real fix, but that's
  a workflow change worth deciding deliberately rather than doing silently.
- **Superseded, not deleted:** if you're updating from before the audit-log
  rewrite, your old fixed-name `server/data/spins.csv` stops receiving new rows
  (logging moves to dated files under `server/data/logs/`) but is left on disk
  untouched — nothing is lost, it just stops being the active log.

General rule of thumb for any future update: anything under `server/data/` is
yours and safe; anything tracked in git (currently just `entrants.config.json`) is
shared with the repo and should be backed up before pulling if you've customized it.

## How a raffle works

- [`entrants.config.json`](entrants.config.json) is the source of truth: a JSON
  array of `{ "name", "email", "entries" }`. The server loads it into a live pool
  and persists that pool + winner history to `server/data/state.json` (gitignored),
  so state survives closing the app.
- Each spin is a ticket-weighted random draw (someone with 3 entries has 3x the
  odds of someone with 1) that removes **one ticket** from the winner; they stay in
  the draw with one fewer until they hit zero.
- The draw itself is a scrolling, decelerating name reel rather than a pie wheel —
  it stays legible regardless of how many entrants/tickets are in play, and a
  person's repeated tickets are spread through the reel instead of clustering.
- Gear icon (top right): **Load Entrants** re-reads the config file and refreshes
  ticket counts while keeping winner history; **Reset** does the same but also
  clears history for a full restart — and starts a new audit log file (see below).

## Entrants

Click the people icon (top left) for the entrant list. Ticket counts and emails
are hidden by default and only reveal on clicking a name — so the list can be shown
to a room without spoiling anyone's odds. A pencil icon on the revealed row lets you
edit someone's ticket count directly (applies to the live pool immediately and
persists to `entrants.config.json`).

**Add Entrants** (button at the top of that list) adds people without hand-editing
the JSON: one at a time, or via a CSV (`name,email,entries`, header row optional).
New entrants are appended to the config file and the live pool without disturbing
anyone else's already-spun tickets. Duplicate emails and invalid rows are rejected
(or skipped and reported, for CSV import).

## Prizes

Click the prize badge above Spin to open the picker. Each prize card has one
action row (edit, mystery-eligibility, add-to-queue, delete); **+ Add a prize**
opens a small dialog for name, quantity, cost, and an image (auto-cropped to a
320×320 icon). The same dialog, pre-filled, handles edits — quantity can drop to 0
there without a full delete.

What a spin draws for, in priority order:

1. **Prize Queue** — a pre-set, revealed sequence; every spin pops its front entry.
   A queued slot can itself be a Mystery draw, resolved when its turn comes up.
2. **A specific prize** — selected by clicking its card; stays armed until changed.
3. **Mystery Prize** — the default: a random draw from in-stock, eligible prizes at
   spin time, secret until revealed. The dice/eye-off toggle on a card excludes it
   from random Mystery draws while keeping it selectable by name or by queue slot.

Deleting a prize removes its image file and any queue entries, but past Winner
History keeps a snapshot of its name.

**Spin is disabled whenever the catalogue has nothing in stock** — no prizes added
yet, or everything already won out — both greyed out in the UI and refused by the
server if called directly. A spin only ever runs when it's guaranteed to award
something; nobody wins nothing to a misclick or a forgotten setup step.

## Sound effects

Synthesized on the fly with the Web Audio API — nothing to license or download.
Spin plays a whoosh-and-ticks cue; a win plays a fanfare tiered by the prize's
**cost** (edit thresholds in `client/src/lib/sound.js` → `fanfareTierForCost`):

| Cost      | Fanfare                          |
|-----------|-----------------------------------|
| < 150     | light two-note chime              |
| 150-499   | brighter four-note arpeggio       |
| 500+      | longer "ta-da" with sustained chord |

Cost defaults to 0 (light chime) and is only ever shown in the Prize Picker.

## Audit log

Every mutating action — spins, adding/editing/deleting entrants and prizes,
selecting a prize, changing the queue, Load Entrants, Reset — appends a row to a
CSV under `server/data/logs/` (gitignored):
`datetime,action,name,email,prize,details`. Load Entrants appends to the same
file; only **Reset** rotates to a new one, named `Raffle_ddMMMyy_HH-mm-ss.csv`
(e.g. `Raffle_23Sep26_14-30-05.csv` — hyphens instead of colons in the time, since
Windows filenames can't contain `:`). The outgoing file's last row always names the
file it handed off to; nothing is ever overwritten, so every past round's full
history stays on disk under its own dated file. The very first log the app ever
creates uses this same naming convention.

**Export Log** (gear-icon menu) copies the *current* log file straight to a folder
on your machine — a direct filesystem copy, not a browser download, since this app
runs entirely locally and a browser download would just land in the browser's own
downloads folder regardless of where you actually want it. That destination folder
is configurable right above the button (defaults to your Desktop) and is remembered
in `server/data/settings.json` (gitignored).

## Theme

Colors are eir's brand names, **Heather** (purple) and **Wheat** (cream/gold), as
CSS variables in `client/src/styles.css`. The current hex values are approximations
— swap in the real brand hex codes if you have them.

## Project structure

```
entrants.config.json   # you edit this
server/                 # Express API + persisted state (server/data/, gitignored)
client/src/
  components/
    SpinnerList.jsx        # the weighted, decelerating name reel
    EntrantSidebar.jsx      # entrant list, click-to-reveal, ticket-count edit
    AddEntrantsModal.jsx    # single-entrant form + CSV import
    PrizePicker.jsx         # add/edit/select/delete prizes, Prize Queue
    PrizeBadge.jsx           # the "Drawing for..." badge above Spin
    FilePicker.jsx           # shared file-input control (image/CSV)
  lib/
    randomOrder.js          # deterministic shuffle + no-adjacent-repeat reel arrangement
    sound.js                # synthesized spin whoosh + cost-tiered win fanfare
```
