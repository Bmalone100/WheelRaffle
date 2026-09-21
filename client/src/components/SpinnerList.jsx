import { useEffect, useMemo, useRef, useState } from 'react';
import { seededShuffle } from '../lib/randomOrder.js';

const ROW_HEIGHT = 68;
const VISIBLE_ROWS = 5;
const BASE_REPEATS = 6;
const MIN_ROWS_TRAVEL = 40;
const REST_PARK_LAP = 1;

function buildTicketReel(pool) {
  const tickets = [];
  pool.forEach((e) => {
    for (let i = 0; i < e.entries; i++) {
      tickets.push({ id: e.id, name: e.name, ticketKey: `${e.id}#${i}` });
    }
  });
  return seededShuffle(tickets, (t) => t.ticketKey);
}

function emphasisFor(distance) {
  if (distance === 0) return 'is-current';
  if (distance === 1) return 'is-near';
  return '';
}

// A scrolling name reel for raffles with too many tickets to keep every
// wheel slice legible — same weighted-by-tickets randomness, same
// frozen-pool correctness pattern, just rendered as a decelerating list
// instead of a pie.
export default function SpinnerList({ pool, spinning, winnerId, spinToken, onSpinComplete }) {
  // offset (scroll position, px) and repeats (how many times `tickets` is
  // tiled to cover that offset) always change together, so they're one
  // state update per effect rather than two separate setState calls.
  const [reel, setReel] = useState({ offset: 0, repeats: BASE_REPEATS });
  const prevToken = useRef(spinToken);

  const tickets = useMemo(() => buildTicketReel(pool), [pool]);
  const centerRow = Math.floor(VISIBLE_ROWS / 2);
  const { offset, repeats } = reel;

  // Every time a new spin is requested, scroll forward by at least
  // MIN_ROWS_TRAVEL rows from wherever the reel currently rests, landing on
  // the winner's row — a fixed, generous distance every time (rather than
  // an independently-computed absolute position, which could happen to be
  // only a few rows from where the reel already sat, making the "spin"
  // barely move) so it always reads as a proper suspenseful scroll.
  useEffect(() => {
    if (spinToken === prevToken.current) return;
    prevToken.current = spinToken;
    if (!winnerId || tickets.length === 0) return;

    const winnerIndices = [];
    tickets.forEach((t, i) => {
      if (t.id === winnerId) winnerIndices.push(i);
    });
    if (winnerIndices.length === 0) return;

    // A person can hold several tickets scattered through the reel; which
    // specific one we land on is cosmetic (any of them identifies the same
    // winner), so Math.random's non-cryptographic randomness is fine here.
    // eslint-disable-next-line sonarjs/pseudo-random
    const chosenLocalIndex = winnerIndices[Math.floor(Math.random() * winnerIndices.length)];
    const n = tickets.length;
    const currentIndex = Math.round(centerRow - offset / ROW_HEIGHT);

    let targetIndex = currentIndex + MIN_ROWS_TRAVEL;
    const rem = (((targetIndex - chosenLocalIndex) % n) + n) % n;
    if (rem !== 0) targetIndex += n - rem;

    // This effect exists specifically to react to an external trigger
    // (spinToken, an imperative "start a new animation now" signal from the
    // parent) and roll a one-time random landing spot — not to derive state
    // from props, which is what this rule guards against. That computation
    // is intentionally impure (Math.random), so it can't move into render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReel({
      offset: -(targetIndex * ROW_HEIGHT) + centerRow * ROW_HEIGHT,
      repeats: Math.ceil((targetIndex + 1) / n) + 1,
    });
  }, [spinToken, winnerId, tickets, centerRow, offset]);

  // Once at rest, silently collapse the reel back to a low lap number so lap
  // counts (and the rendered repeat count) never grow unbounded across a
  // long session. Every lap shows identical content and this only runs
  // while transition is 'none', so it's visually seamless.
  useEffect(() => {
    if (spinning) return;
    const n = tickets.length;
    if (n === 0) return;
    const currentIndex = Math.round(centerRow - offset / ROW_HEIGHT);
    if (currentIndex < (REST_PARK_LAP + 1) * n) return;
    const localIndex = ((currentIndex % n) + n) % n;
    const rebasedIndex = REST_PARK_LAP * n + localIndex;
    // Purely a housekeeping rebase of this component's own internal scroll
    // position once idle — no props/state are being "derived" here, so
    // moving it out of an effect isn't applicable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReel({ offset: -(rebasedIndex * ROW_HEIGHT) + centerRow * ROW_HEIGHT, repeats: BASE_REPEATS });
  }, [spinning, tickets, offset, centerRow]);

  const reelRows = [];
  for (let r = 0; r < repeats; r++) reelRows.push(...tickets);

  // Which reel row currently sits at the selector, so it (and its nearest
  // neighbours) can be visually lifted — only meaningful once the track is
  // at rest, since mid-transition this is a react-state snapshot of the
  // *target* position, not whatever's actually passing the selector that frame.
  const centerReelIndex = spinning ? -1 : Math.round(centerRow - offset / ROW_HEIGHT);

  return (
    <div className="spinner-list" style={{ height: ROW_HEIGHT * VISIBLE_ROWS }}>
      <div className="spinner-selector" style={{ height: ROW_HEIGHT, top: centerRow * ROW_HEIGHT }} />
      <div
        className="spinner-track"
        style={{
          transform: `translateY(${offset}px)`,
          transition: spinning ? 'transform 5.5s cubic-bezier(0.15, 0.8, 0.1, 1)' : 'none',
        }}
        onTransitionEnd={(e) => {
          // Row-level lift/colour transitions (0.25s) bubble up from
          // children through this same handler — only react to the track's
          // own scroll transform finishing, or the reel "completes" the
          // instant a highlighted row resets, long before the real scroll does.
          if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
          if (spinning) onSpinComplete();
        }}
      >
        {reelRows.map((t, i) => (
          <div key={i} className={`spinner-row ${emphasisFor(Math.abs(i - centerReelIndex))}`} style={{ height: ROW_HEIGHT }}>
            {t.name}
          </div>
        ))}
      </div>
    </div>
  );
}
