import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import Wheel, { buildSegments } from './components/Wheel.jsx';
import WinnerHistory from './components/WinnerHistory.jsx';
import { getState, resetRaffle, spin } from './api.js';

const CONFETTI_COLORS = ['#5C3A7A', '#F5DEB3', '#e63946', '#43aa8b', '#277da1'];

function celebrateWinner() {
  const duration = 1800;
  const end = Date.now() + duration;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 65, origin: { x: 0, y: 0.6 }, colors: CONFETTI_COLORS });
    confetti({ particleCount: 4, angle: 120, spread: 65, origin: { x: 1, y: 0.6 }, colors: CONFETTI_COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 }, colors: CONFETTI_COLORS });
}

export default function App() {
  const [pool, setPool] = useState([]);
  const [history, setHistory] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [pendingResult, setPendingResult] = useState(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getState()
      .then((s) => {
        setPool(s.pool);
        setHistory(s.history);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSpin = useCallback(async () => {
    if (spinning || pool.length === 0) return;
    setError('');
    setLastWinner(null);
    try {
      const result = await spin();
      const segments = buildSegments(result.poolBefore);
      // A person can hold several ticket-slices scattered around the wheel now,
      // so pick a random one of theirs to spin toward rather than assuming one match.
      const candidates = segments.filter((s) => s.id === result.winner.id);
      const winnerSegment = candidates[Math.floor(Math.random() * candidates.length)];
      const spread = winnerSegment.endAngle - winnerSegment.startAngle;
      const margin = spread * 0.15;
      const pointInSegment =
        winnerSegment.startAngle + margin + Math.random() * Math.max(0, spread - margin * 2);

      const extraSpins = 5 + Math.floor(Math.random() * 3);
      const currentMod = ((rotation % 360) + 360) % 360;
      const delta = (((360 - pointInSegment - currentMod) % 360) + 360) % 360;
      const nextRotation = rotation + extraSpins * 360 + delta;

      setPendingResult(result);
      setSpinning(true);
      setRotation(nextRotation);
    } catch (e) {
      setError(e.message);
    }
  }, [spinning, pool, rotation]);

  const handleSpinComplete = useCallback(() => {
    if (!pendingResult) return;
    setSpinning(false);
    setPool(pendingResult.poolAfter);
    setHistory(pendingResult.history);
    setLastWinner(pendingResult.winner);
    setPendingResult(null);
    celebrateWinner();
  }, [pendingResult]);

  const handleReset = useCallback(async () => {
    if (spinning) return;
    if (
      !window.confirm(
        'Reset the raffle? This reloads everyone from entrants.config.json and clears winner history.'
      )
    ) {
      return;
    }
    setError('');
    setLastWinner(null);
    try {
      const s = await resetRaffle();
      setPool(s.pool);
      setHistory(s.history);
      setRotation(0);
    } catch (e) {
      setError(e.message);
    }
  }, [spinning]);

  const totalTickets = pool.reduce((sum, e) => sum + e.entries, 0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>WheelRaffle</h1>
        <p className="subtitle">
          {pool.length} entrant{pool.length === 1 ? '' : 's'} · {totalTickets} ticket
          {totalTickets === 1 ? '' : 's'} in the wheel
        </p>
      </header>

      {error && <div className="banner banner-error">{error}</div>}

      {loading ? (
        <p>Loading…</p>
      ) : pool.length === 0 ? (
        <div className="banner">
          Everyone&rsquo;s won! Edit entrants.config.json and hit Reset Raffle to start again.
        </div>
      ) : (
        <Wheel pool={pool} spinning={spinning} targetAngle={rotation} onSpinComplete={handleSpinComplete} />
      )}

      {lastWinner && !spinning && (
        <div className="winner-banner">
          🎉 <strong>{lastWinner.name}</strong> wins!{' '}
          {lastWinner.entriesRemaining > 0
            ? `${lastWinner.entriesRemaining} ticket${lastWinner.entriesRemaining === 1 ? '' : 's'} still in the wheel.`
            : 'That was their last ticket — removed from the wheel.'}
        </div>
      )}

      <div className="controls">
        <button className="btn btn-primary" onClick={handleSpin} disabled={spinning || pool.length === 0}>
          {spinning ? 'Spinning…' : 'Spin the Wheel'}
        </button>
        <button className="btn btn-secondary" onClick={handleReset} disabled={spinning}>
          Reset Raffle
        </button>
      </div>

      <a className="log-link" href="/api/log" download="wheelraffle-spins.csv">
        Download spin log (CSV)
      </a>

      <WinnerHistory history={history} />
    </div>
  );
}
