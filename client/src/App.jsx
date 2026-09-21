import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Settings, Users } from 'lucide-react';
import SpinnerList from './components/SpinnerList.jsx';
import EntrantSidebar from './components/EntrantSidebar.jsx';
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
  // What the spinner reel actually renders. This only advances when a new
  // spin begins (to that spin's poolBefore) — never at spin-completion — so
  // the ticket layout used to pick the landing row is exactly what's still
  // on screen when it stops, instead of being silently reshuffled under the
  // selector by the post-spin pool update.
  const [displayPool, setDisplayPool] = useState([]);
  const [history, setHistory] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState(null);
  const [spinToken, setSpinToken] = useState(0);
  const [pendingResult, setPendingResult] = useState(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const optionsRef = useRef(null);

  useEffect(() => {
    if (!optionsOpen) return;
    const handleClickOutside = (e) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target)) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [optionsOpen]);

  useEffect(() => {
    getState()
      .then((s) => {
        setPool(s.pool);
        setDisplayPool(s.pool);
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
      setDisplayPool(result.poolBefore);
      setWinnerId(result.winner.id);
      setSpinToken((t) => t + 1);
      setPendingResult(result);
      setSpinning(true);
    } catch (e) {
      setError(e.message);
    }
  }, [spinning, pool]);

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
      setDisplayPool(s.pool);
      setHistory(s.history);
      setOptionsOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }, [spinning]);

  const totalTickets = pool.reduce((sum, e) => sum + e.entries, 0);

  return (
    <div className="app">
      <button
        type="button"
        className="icon-button corner-button corner-left"
        onClick={() => setSidebarOpen(true)}
        aria-label="Show entrants list"
      >
        <Users size={22} />
      </button>

      <div className="options-menu corner-button corner-right" ref={optionsRef}>
        <button
          type="button"
          className="icon-button"
          onClick={() => setOptionsOpen((v) => !v)}
          aria-label="Options"
          aria-expanded={optionsOpen}
        >
          <Settings size={22} />
        </button>
        {optionsOpen && (
          <div className="options-panel">
            <button className="btn btn-secondary" onClick={handleReset} disabled={spinning}>
              Reset Raffle
            </button>
            <a className="log-link" href="/api/log" download="wheelraffle-spins.csv">
              Download spin log (CSV)
            </a>
          </div>
        )}
      </div>

      <EntrantSidebar pool={pool} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="app-header">
        <h1>WheelRaffle</h1>
        <p className="subtitle">
          {pool.length} entrant{pool.length === 1 ? '' : 's'} · {totalTickets} ticket
          {totalTickets === 1 ? '' : 's'} in the draw
        </p>
      </header>

      {error && <div className="banner banner-error">{error}</div>}

      {loading ? (
        <p>Loading…</p>
      ) : displayPool.length === 0 ? (
        <div className="banner">
          Everyone&rsquo;s won! Edit entrants.config.json and hit Reset Raffle to start again.
        </div>
      ) : (
        <SpinnerList
          pool={displayPool}
          spinning={spinning}
          winnerId={winnerId}
          spinToken={spinToken}
          onSpinComplete={handleSpinComplete}
        />
      )}

      {lastWinner && !spinning && (
        <div className="winner-banner">
          🎉 <strong>{lastWinner.name}</strong> wins!{' '}
          {lastWinner.entriesRemaining > 0
            ? `${lastWinner.entriesRemaining} ticket${lastWinner.entriesRemaining === 1 ? '' : 's'} still in the draw.`
            : 'That was their last ticket — removed from the draw.'}
        </div>
      )}

      <div className="controls">
        <button className="btn btn-primary" onClick={handleSpin} disabled={spinning || pool.length === 0}>
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
      </div>

      <WinnerHistory history={history} />
    </div>
  );
}
