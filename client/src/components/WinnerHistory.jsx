export default function WinnerHistory({ history }) {
  if (history.length === 0) {
    return (
      <section className="history">
        <h2>Winner History</h2>
        <p className="empty">No spins yet.</p>
      </section>
    );
  }

  return (
    <section className="history">
      <h2>Winner History</h2>
      <ol className="history-list">
        {history.map((h, i) => (
          <li key={`${h.id}-${h.wonAt}-${i}`}>
            <span className="history-name">
              {h.name}
              {h.prizeName && <span className="history-prize"> — {h.prizeName}</span>}
            </span>
            <span className="history-meta">{new Date(h.wonAt).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
