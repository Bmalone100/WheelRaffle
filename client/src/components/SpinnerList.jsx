import { useEffect, useMemo, useRef, useState } from 'react';
import { seededShuffle } from '../lib/randomOrder.js';

const ROW_HEIGHT = 68;
const VISIBLE_ROWS = 5;
const REPEATS = 6;

function buildTicketReel(pool) {
  const tickets = [];
  pool.forEach((e) => {
    for (let i = 0; i < e.entries; i++) {
      tickets.push({ id: e.id, name: e.name, ticketKey: `${e.id}#${i}` });
    }
  });
  return seededShuffle(tickets, (t) => t.ticketKey);
}

// A scrolling name reel for raffles with too many tickets to keep every
// wheel slice legible (see Wheel.jsx's sizeForPool) — same weighted-by-
// tickets randomness, same frozen-pool correctness pattern, just rendered
// as a decelerating list instead of a pie.
export default function SpinnerList({ pool, spinning, winnerId, spinToken, onSpinComplete }) {
  const [offset, setOffset] = useState(0);
  const prevToken = useRef(spinToken);

  const tickets = useMemo(() => buildTicketReel(pool), [pool]);

  useEffect(() => {
    if (spinToken === prevToken.current) return;
    prevToken.current = spinToken;
    if (!winnerId || tickets.length === 0) return;

    const winnerIndices = [];
    tickets.forEach((t, i) => {
      if (t.id === winnerId) winnerIndices.push(i);
    });
    if (winnerIndices.length === 0) return;

    // Land inside a late lap of the repeated reel so the strip visibly
    // scrolls through many names first, with one more lap left to coast
    // through after landing on the winner's row for a smooth finish.
    const chosenLocalIndex = winnerIndices[Math.floor(Math.random() * winnerIndices.length)];
    const lap = REPEATS - 2;
    const targetIndex = lap * tickets.length + chosenLocalIndex;

    const centerRow = Math.floor(VISIBLE_ROWS / 2);
    setOffset(-(targetIndex * ROW_HEIGHT) + centerRow * ROW_HEIGHT);
  }, [spinToken, winnerId, tickets]);

  const reel = [];
  for (let r = 0; r < REPEATS; r++) reel.push(...tickets);

  return (
    <div className="spinner-list" style={{ height: ROW_HEIGHT * VISIBLE_ROWS }}>
      <div className="spinner-selector" style={{ height: ROW_HEIGHT, top: Math.floor(VISIBLE_ROWS / 2) * ROW_HEIGHT }} />
      <div
        className="spinner-track"
        style={{
          transform: `translateY(${offset}px)`,
          transition: spinning ? 'transform 5.5s cubic-bezier(0.15, 0.8, 0.1, 1)' : 'none',
        }}
        onTransitionEnd={() => spinning && onSpinComplete()}
      >
        {reel.map((t, i) => (
          <div key={i} className="spinner-row" style={{ height: ROW_HEIGHT }}>
            {t.name}
          </div>
        ))}
      </div>
    </div>
  );
}
