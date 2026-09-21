import { X } from 'lucide-react';

export default function EntrantSidebar({ pool, open, onClose }) {
  return (
    <>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`entrant-sidebar ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="sidebar-header">
          <h2>Entrants</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close entrants list">
            <X size={20} />
          </button>
        </div>
        {pool.length === 0 ? (
          <p className="sidebar-empty">No entrants left in the wheel.</p>
        ) : (
          <ul className="sidebar-list">
            {pool.map((e) => (
              <li key={e.id}>
                <span className="sidebar-name">{e.name}</span>
                <span className="sidebar-count">
                  {e.entries} ticket{e.entries === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
