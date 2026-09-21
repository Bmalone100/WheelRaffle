import { useState } from 'react';
import { Dices, ImageUp, Plus, Trash2, X } from 'lucide-react';
import FilePicker from './FilePicker.jsx';

export default function PrizePicker({
  prizes,
  currentPrizeId,
  mysteryPrize,
  open,
  onClose,
  onSelect,
  onSelectMystery,
  onAdd,
  onDelete,
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [file, setFile] = useState(null);
  const [resetToken, setResetToken] = useState(0);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    const qty = Number.parseInt(quantity, 10);
    if (!name.trim() || !file) {
      setError('Give the prize a name and pick an image.');
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setError('Quantity must be a whole number of at least 1.');
      return;
    }
    setError('');
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('quantity', String(qty));
      formData.append('image', file);
      await onAdd(formData);
      setName('');
      setQuantity('1');
      setFile(null);
      setResetToken((t) => t + 1);
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
            <div className={`prize-card ${mysteryPrize ? 'selected' : ''}`}>
              <button type="button" className="prize-card-select prize-card-mystery" onClick={onSelectMystery}>
                <span className="prize-icon prize-icon-mystery">
                  <Dices size={32} />
                </span>
                <span className="prize-card-name">Mystery Prize</span>
              </button>
            </div>
            {prizes.map((p) => (
              <div key={p.id} className={`prize-card ${!mysteryPrize && p.id === currentPrizeId ? 'selected' : ''}`}>
                <button type="button" className="prize-card-select" onClick={() => onSelect(p.id)}>
                  <span className="prize-icon-wrap">
                    <img src={p.imageUrl} alt={p.name} className="prize-icon" />
                    <span className="prize-qty-badge">×{p.quantity}</span>
                  </span>
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

        <form className="modal-form" onSubmit={handleAdd}>
          <h3>Add a prize</h3>
          <input
            type="text"
            placeholder="Prize name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="modal-text-input"
          />
          <label className="modal-field-label">
            Quantity
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="modal-number-input"
            />
          </label>
          <FilePicker
            accept="image/*"
            file={file}
            onChange={setFile}
            placeholder="Choose a prize image…"
            icon={<ImageUp size={16} />}
            resetToken={resetToken}
          />
          {error && <p className="modal-form-error">{error}</p>}
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
