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
  setPrizeMysteryEligible,
  setPrizeQueue,
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
  const [prizeQueue, setPrizeQueueState] = useState([]);
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
        setPrizeQueueState(Array.isArray(s.prizeQueue) ? s.prizeQueue : []);
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
    // auto-cleared server-side, or simply had its stock decremented, and the
    // queue has advanced (or self-pruned a now-depleted entry) — stay in
    // sync so the badge/picker never show stale quantities or a queue/
    // selection that's no longer valid.
    setPrizes(pendingResult.prizes);
    setCurrentPrizeId(pendingResult.currentPrizeId ?? null);
    setPrizeQueueState(Array.isArray(pendingResult.prizeQueue) ? pendingResult.prizeQueue : []);
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
      setPrizeQueueState([]);
      setPrizePickerOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Mystery Prize is just "nothing specific armed" — clearing both the
  // specific selection and the queue is enough to fall back to it.
  const handleSelectMystery = useCallback(async () => {
    setError('');
    try {
      await setCurrentPrize(null);
      setCurrentPrizeId(null);
      setPrizeQueueState([]);
      setPrizePickerOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleSetQueue = useCallback(async (queueIds) => {
    setError('');
    try {
      const result = await setPrizeQueue(queueIds);
      setPrizeQueueState(result.prizeQueue);
      setCurrentPrizeId(result.currentPrizeId ?? null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleAddPrize = useCallback(async (formData) => {
    const prize = await addPrize(formData);
    setPrizes((prev) => [...prev, prize]);
  }, []);

  const handleSetMysteryEligible = useCallback(async (id, mysteryEligible) => {
    setError('');
    try {
      const updated = await setPrizeMysteryEligible(id, mysteryEligible);
      setPrizes((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleDeletePrize = useCallback(
    async (id) => {
      try {
        const result = await deletePrize(id);
        setPrizes((prev) => prev.filter((p) => p.id !== id));
        if (currentPrizeId === id) setCurrentPrizeId(null);
        setPrizeQueueState(Array.isArray(result.prizeQueue) ? result.prizeQueue : []);
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
  // The queue's front entry is `null` for a queued Mystery slot — same as
  // no prize armed at all, the badge just shows Mystery (never revealing
  // which one ahead of time).
  const inQueue = prizeQueue.length > 0;
  const queueFrontId = inQueue ? prizeQueue[0] : null;
  const currentPrize = inQueue
    ? (queueFrontId && prizes.find((p) => p.id === queueFrontId)) || null
    : prizes.find((p) => p.id === currentPrizeId) || null;

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
        currentPrize={currentPrize}
        queued={inQueue}
        queueLength={prizeQueue.length}
        onClick={() => setPrizePickerOpen(true)}
      />

      <div className="controls">
        <button className="btn btn-primary" onClick={handleSpin} disabled={spinning || pool.length === 0}>
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
      </div>

      <PrizePicker
        prizes={prizes}
        currentPrizeId={currentPrizeId}
        prizeQueue={prizeQueue}
        open={prizePickerOpen}
        onClose={() => setPrizePickerOpen(false)}
        onSelect={handleSelectPrize}
        onSelectMystery={handleSelectMystery}
        onSetQueue={handleSetQueue}
        onAdd={handleAddPrize}
        onDelete={handleDeletePrize}
        onSetMysteryEligible={handleSetMysteryEligible}
      />

      <WinnerHistory history={history} />
    </div>
  );
}
