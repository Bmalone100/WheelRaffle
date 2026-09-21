import { useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export default function PrizePicker({ prizes, currentPrizeId, open, onClose, onSelect, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  if (!open) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !file) {
      setError('Give the prize a name and pick an image.');
      return;
    }
    setError('');
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('image', file);
      await onAdd(formData);
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-header">
          <h2>Prizes</h2>
          <button className="icon-button icon-button-small" onClick={onClose} aria-label="Close prize picker">
            <X size={18} />
          </button>
        </div>

        {prizes.length === 0 ? (
          <p className="prize-picker-empty">No prizes yet — add one below.</p>
        ) : (
          <div className="prize-grid">
            <div className={`prize-card ${currentPrizeId == null ? 'selected' : ''}`}>
              <button type="button" className="prize-card-select prize-card-none" onClick={() => onSelect(null)}>
                <span className="prize-icon prize-icon-none">—</span>
                <span className="prize-card-name">No prize</span>
              </button>
            </div>
            {prizes.map((p) => (
              <div key={p.id} className={`prize-card ${p.id === currentPrizeId ? 'selected' : ''}`}>
                <button type="button" className="prize-card-select" onClick={() => onSelect(p.id)}>
                  <img src={p.imageUrl} alt={p.name} className="prize-icon" />
                  <span className="prize-card-name">{p.name}</span>
                </button>
                <button
                  type="button"
                  className="prize-card-delete"
                  onClick={() => onDelete(p.id)}
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form className="prize-add-form" onSubmit={handleAdd}>
          <h3>Add a prize</h3>
          <input
            type="text"
            placeholder="Prize name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="prize-name-input"
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="prize-file-input"
          />
          {error && <p className="prize-add-error">{error}</p>}
          <button type="submit" className="btn btn-secondary" disabled={adding}>
            {adding ? (
              'Adding…'
            ) : (
              <>
                <Plus size={16} /> Add Prize
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}
