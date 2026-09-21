import { useState } from 'react';
import { UserRoundPlus, X } from 'lucide-react';

export default function EntrantSidebar({ pool, open, onClose, onAddClick }) {
  const [revealedId, setRevealedId] = useState(null);

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

        <button type="button" className="sidebar-add-button" onClick={onAddClick}>
          <UserRoundPlus size={16} /> Add Entrants
        </button>

        {pool.length === 0 ? (
          <p className="sidebar-empty">No entrants left in the wheel.</p>
        ) : (
          <ul className="sidebar-list">
            {pool.map((e) => (
              <li key={e.id}>
                <div className="sidebar-row-main">
                  <button
                    type="button"
                    className="sidebar-name"
                    onClick={() => setRevealedId(revealedId === e.id ? null : e.id)}
                  >
                    {e.name}
                  </button>
                  <span className="sidebar-count">
                    {e.entries} ticket{e.entries === 1 ? '' : 's'}
                  </span>
                </div>
                {revealedId === e.id && (
                  <div className="sidebar-email-reveal">{e.email || 'No email on file'}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
