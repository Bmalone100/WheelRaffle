import { useState } from 'react';
import { Check, Pencil, UserRoundPlus, X } from 'lucide-react';

export default function EntrantSidebar({ pool, open, onClose, onAddClick, onEditEntries }) {
  const [revealedId, setRevealedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleReveal = (id) => {
    setRevealedId(revealedId === id ? null : id);
    setEditingId(null);
    setEditError('');
  };

  const startEdit = (entrant) => {
    setEditingId(entrant.id);
    setEditValue(String(entrant.entries));
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError('');
  };

  const saveEdit = async (id) => {
    const entries = Number.parseInt(editValue, 10);
    if (!Number.isInteger(entries) || entries < 1) {
      setEditError('Enter a whole number of at least 1.');
      return;
    }
    setSaving(true);
    try {
      await onEditEntries(id, entries);
      setEditingId(null);
      setEditError('');
    } catch (e) {
      setEditError(e.message);
    } finally {
      setSaving(false);
    }
  };

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
                  <button type="button" className="sidebar-name" onClick={() => toggleReveal(e.id)}>
                    {e.name}
                  </button>
                </div>
                {revealedId === e.id && (
                  <div className="sidebar-email-reveal">
                    {editingId === e.id ? (
                      <div className="sidebar-edit-entries">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={editValue}
                          onChange={(ev) => setEditValue(ev.target.value)}
                          className="sidebar-edit-input"
                          disabled={saving}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="icon-button icon-button-small"
                          onClick={() => saveEdit(e.id)}
                          disabled={saving}
                          aria-label={`Save ${e.name}'s ticket count`}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-small"
                          onClick={cancelEdit}
                          disabled={saving}
                          aria-label="Cancel edit"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="sidebar-reveal-entries">
                        {e.entries} ticket{e.entries === 1 ? '' : 's'}
                        <button
                          type="button"
                          className="icon-button icon-button-small sidebar-edit-button"
                          onClick={() => startEdit(e)}
                          aria-label={`Edit ${e.name}'s ticket count`}
                        >
                          <Pencil size={12} />
                        </button>
                      </span>
                    )}
                    {' · '}
                    {e.email || 'No email on file'}
                    {editError && editingId === e.id && <div className="sidebar-edit-error">{editError}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
