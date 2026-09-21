import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { AlertTriangle, Settings, Users, X } from 'lucide-react';
import SpinnerList from './components/SpinnerList.jsx';
import EntrantSidebar from './components/EntrantSidebar.jsx';
import AddEntrantsModal from './components/AddEntrantsModal.jsx';
import PrizeBadge from './components/PrizeBadge.jsx';
import PrizePicker from './components/PrizePicker.jsx';
import WinnerHistory from './components/WinnerHistory.jsx';
import {
  addEntrant,
  addPrize,
  deletePrize,
  getPrizes,
  getState,
  importEntrantsCsv,
  loadEntrants,
  resetRaffle,
  setCurrentPrize,
  setMysteryPrize,
  spin,
} from './api.js';

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
  const [addEntrantsOpen, setAddEntrantsOpen] = useState(false);
  const [prizes, setPrizes] = useState([]);
  const [currentPrizeId, setCurrentPrizeId] = useState(null);
  const [mysteryPrize, setMysteryPrizeFlag] = useState(false);
  const [prizePickerOpen, setPrizePickerOpen] = useState(false);
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
    Promise.all([getState(), getPrizes()])
      .then(([s, p]) => {
        setPool(s.pool);
        setDisplayPool(s.pool);
        setHistory(s.history);
        setCurrentPrizeId(s.currentPrizeId || null);
        setMysteryPrizeFlag(Boolean(s.mysteryPrize));
        setPrizes(p);
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
    // A specific (non-Mystery) prize may have just sold out and been
    // auto-cleared server-side, or simply had its stock decremented — stay
    // in sync so the badge/picker never show stale quantities or a
    // selection that's no longer valid.
    setPrizes(pendingResult.prizes);
    setCurrentPrizeId(pendingResult.currentPrizeId ?? null);
    setPendingResult(null);
    celebrateWinner();
  }, [pendingResult]);

  const handleLoadEntrants = useCallback(async () => {
    if (spinning) return;
    if (!window.confirm('Reload entrants.config.json? Ticket counts will refresh from the file; winner history is kept.')) {
      return;
    }
    setError('');
    setLastWinner(null);
    try {
      const s = await loadEntrants();
      setPool(s.pool);
      setDisplayPool(s.pool);
      setHistory(s.history);
      setOptionsOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }, [spinning]);

  const handleReset = useCallback(async () => {
    if (spinning) return;
    if (
      !window.confirm(
        'Reset the whole raffle? This wipes the current board and the winner history shown in the app, and reloads everyone fresh from entrants.config.json. Every past spin is already permanently recorded in the spin log (CSV), so nothing is actually lost — but this cannot be undone in the app itself.'
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

  const handleSelectPrize = useCallback(async (prizeId) => {
    setError('');
    try {
      await setCurrentPrize(prizeId);
      setCurrentPrizeId(prizeId);
      setMysteryPrizeFlag(false);
      setPrizePickerOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleSelectMystery = useCallback(async () => {
    setError('');
    try {
      await setMysteryPrize();
      setCurrentPrizeId(null);
      setMysteryPrizeFlag(true);
      setPrizePickerOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleAddPrize = useCallback(async (formData) => {
    const prize = await addPrize(formData);
    setPrizes((prev) => [...prev, prize]);
  }, []);

  const handleDeletePrize = useCallback(
    async (id) => {
      try {
        await deletePrize(id);
        setPrizes((prev) => prev.filter((p) => p.id !== id));
        if (currentPrizeId === id) setCurrentPrizeId(null);
      } catch (e) {
        setError(e.message);
      }
    },
    [currentPrizeId]
  );

  const handleAddEntrant = useCallback(async (entrant) => {
    const result = await addEntrant(entrant);
    setPool(result.pool);
    setDisplayPool(result.pool);
  }, []);

  const handleImportEntrants = useCallback(async (csvText) => {
    const result = await importEntrantsCsv(csvText);
    setPool(result.pool);
    setDisplayPool(result.pool);
    return result;
  }, []);

  const totalTickets = pool.reduce((sum, e) => sum + e.entries, 0);
  const currentPrize = prizes.find((p) => p.id === currentPrizeId) || null;
  const prizeRequired = prizes.length > 0;
  const noPrizeArmed = prizeRequired && !mysteryPrize && !currentPrize;
  const emptyMysteryPool = mysteryPrize && prizes.length === 0;
  const spinBlockedByPrize = noPrizeArmed || emptyMysteryPool;

  let mainContent;
  if (loading) {
    mainContent = <p>Loading…</p>;
  } else if (displayPool.length === 0) {
    mainContent = (
      <div className="banner">
        Everyone&rsquo;s won! Edit entrants.config.json, then use Load Entrants or Reset (gear icon,
        top right) to start again.
      </div>
    );
  } else {
    mainContent = (
      <SpinnerList
        pool={displayPool}
        spinning={spinning}
        winnerId={winnerId}
        spinToken={spinToken}
        onSpinComplete={handleSpinComplete}
      />
    );
  }

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
            <div className="options-panel-header">
              <h2>Options</h2>
              <button className="icon-button icon-button-small" onClick={() => setOptionsOpen(false)} aria-label="Close options">
                <X size={16} />
              </button>
            </div>

            <button className="btn btn-secondary" onClick={handleLoadEntrants} disabled={spinning}>
              Load Entrants
            </button>
            <p className="options-hint">Reloads entrants.config.json. Keeps winner history.</p>

            <button className="btn btn-danger" onClick={handleReset} disabled={spinning}>
              Reset
            </button>
            <p className="options-hint options-hint-warning">
              <AlertTriangle size={14} /> Wipes the current board and history. Past spins stay in the log.
            </p>

            <a className="log-link" href="/api/log" download="wheelraffle-spins.csv">
              Download spin log (CSV)
            </a>
          </div>
        )}
      </div>

      <EntrantSidebar
        pool={pool}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAddClick={() => setAddEntrantsOpen(true)}
      />

      <AddEntrantsModal
        open={addEntrantsOpen}
        onClose={() => setAddEntrantsOpen(false)}
        onAdd={handleAddEntrant}
        onImport={handleImportEntrants}
      />

      <header className="app-header">
        <h1>{document.title}</h1>
        <p className="subtitle">
          {pool.length} entrant{pool.length === 1 ? '' : 's'} · {totalTickets} ticket
          {totalTickets === 1 ? '' : 's'} in the draw
        </p>
      </header>

      {error && <div className="banner banner-error">{error}</div>}

      {mainContent}

      {lastWinner && !spinning && (
        <div className="winner-banner">
          {lastWinner.wasMysteryPrize && <div className="winner-banner-mystery-tag">🎲 Mystery prize revealed!</div>}
          🎉 <strong>{lastWinner.name}</strong> wins
          {lastWinner.prizeName ? (
            <>
              {' '}
              <strong>{lastWinner.prizeName}</strong>
            </>
          ) : (
            ''
          )}
          !
        </div>
      )}

      <PrizeBadge
        mysteryPrize={mysteryPrize}
        currentPrize={currentPrize}
        prizeRequired={prizeRequired}
        onClick={() => setPrizePickerOpen(true)}
      />

      <div className="controls">
        <button
          className="btn btn-primary"
          onClick={handleSpin}
          disabled={spinning || pool.length === 0 || spinBlockedByPrize}
        >
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
      </div>
      {spinBlockedByPrize && !spinning && (
        <p className="spin-hint">
          {emptyMysteryPool
            ? 'Add at least one prize for Mystery Prize to draw from.'
            : 'Choose a prize (or Mystery Prize) above before spinning.'}
        </p>
      )}

      <PrizePicker
        prizes={prizes}
        currentPrizeId={currentPrizeId}
        mysteryPrize={mysteryPrize}
        open={prizePickerOpen}
        onClose={() => setPrizePickerOpen(false)}
        onSelect={handleSelectPrize}
        onSelectMystery={handleSelectMystery}
        onAdd={handleAddPrize}
        onDelete={handleDeletePrize}
      />

      <WinnerHistory history={history} />
    </div>
  );
}
