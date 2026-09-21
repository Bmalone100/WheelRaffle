function describeOutcome(entriesRemaining) {
  if (entriesRemaining <= 0) return 'removed from wheel';
  const ticketWord = entriesRemaining === 1 ? 'ticket' : 'tickets';
  return `${entriesRemaining} ${ticketWord} left`;
}

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
            <span className="history-name">{h.name}</span>
            <span className="history-meta">
              {new Date(h.wonAt).toLocaleString()} · {describeOutcome(h.entriesRemaining)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
