import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Dices, EyeOff, ImageUp, ListOrdered, ListPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import FilePicker from './FilePicker.jsx';

// Add and Edit share one dialog and one set of form state — they differ only
// in whether an image is required, whether quantity may be 0, and whether
// submit uploads a new prize or PATCHes an existing one. `formMode` is null
// (dialog closed), 'add', or the id of the prize being edited.
export default function PrizePicker({
  prizes,
  currentPrizeId,
  prizeQueue,
  open,
  onClose,
  onSelect,
  onSelectMystery,
  onSetQueue,
  onAdd,
  onEdit,
  onDelete,
  onSetMysteryEligible,
}) {
  const [formMode, setFormMode] = useState(null);
  const [formName, setFormName] = useState('');
  const [formQuantity, setFormQuantity] = useState('1');
  const [formValue, setFormValue] = useState('0');
  const [formFile, setFormFile] = useState(null);
  const [fileResetToken, setFileResetToken] = useState(0);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  if (!open) return null;

  const isEditing = formMode !== null && formMode !== 'add';

  const openAddForm = () => {
    setFormMode('add');
    setFormName('');
    setFormQuantity('1');
    setFormValue('0');
    setFormFile(null);
    setFormError('');
  };

  const openEditForm = (p) => {
    setFormMode(p.id);
    setFormName(p.name);
    setFormQuantity(String(p.quantity));
    setFormValue(String(p.value ?? 0));
    setFormError('');
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormMode(null);
    setFormError('');
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const qty = Number.parseInt(formQuantity, 10);
    const val = Number(formValue);
    const minQty = isEditing ? 0 : 1;

    if (!formName.trim() || (!isEditing && !formFile)) {
      setFormError(isEditing ? 'Give the prize a name.' : 'Give the prize a name and pick an image.');
      return;
    }
    if (!Number.isInteger(qty) || qty < minQty) {
      setFormError(`Quantity must be a whole number of ${minQty} or more.`);
      return;
    }
    if (!Number.isFinite(val) || val < 0) {
      setFormError('Cost must be a number of 0 or more.');
      return;
    }

    setFormError('');
    setFormSaving(true);
    try {
      if (isEditing) {
        await onEdit(formMode, { name: formName.trim(), quantity: qty, value: val });
      } else {
        const formData = new FormData();
        formData.append('name', formName.trim());
        formData.append('quantity', String(qty));
        formData.append('value', String(val));
        formData.append('image', formFile);
        await onAdd(formData);
        setFileResetToken((t) => t + 1);
      }
      setFormMode(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  };

  const noQueue = prizeQueue.length === 0;
  const mysteryQueuedCount = prizeQueue.filter((id) => id === null).length;

  const handleAddToQueue = (id) => onSetQueue([...prizeQueue, id]);
  const handleRemoveFromQueue = (index) => onSetQueue(prizeQueue.filter((_, i) => i !== index));
  const handleMoveInQueue = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= prizeQueue.length) return;
    const next = prizeQueue.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onSetQueue(next);
  };
  const handleClearQueue = () => onSetQueue([]);

  let formSubmitLabel = (
    <>
      <Plus size={16} /> Add Prize
    </>
  );
  if (formSaving) {
    formSubmitLabel = 'Saving…';
  } else if (isEditing) {
    formSubmitLabel = (
      <>
        <Check size={16} /> Save
      </>
    );
  }

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

        <div className="prize-grid">
          <div className={`prize-card ${noQueue && !currentPrizeId ? 'selected' : ''}`}>
            <button type="button" className="prize-card-select prize-card-mystery" onClick={onSelectMystery}>
              <span className="prize-icon prize-icon-mystery">
                <Dices size={32} />
              </span>
              <span className="prize-card-name">Mystery Prize</span>
              {mysteryQueuedCount > 0 && (
                <span className="prize-card-queued-badge">In queue ×{mysteryQueuedCount}</span>
              )}
            </button>
            <div className="prize-card-actions">
              <button
                type="button"
                className="prize-action-btn"
                onClick={() => handleAddToQueue(null)}
                aria-label="Add a Mystery Prize slot to the prize queue"
                title="Add to queue"
              >
                <ListPlus size={13} />
              </button>
            </div>
          </div>

          {prizes.map((p) => {
            const queuedCount = prizeQueue.filter((id) => id === p.id).length;
            const eligible = p.mysteryEligible !== false;
            return (
              <div key={p.id} className={`prize-card ${noQueue && p.id === currentPrizeId ? 'selected' : ''}`}>
                <button type="button" className="prize-card-select" onClick={() => onSelect(p.id)}>
                  <span className="prize-icon-wrap">
                    <img src={p.imageUrl} alt={p.name} className="prize-icon" />
                    <span className="prize-qty-badge">×{p.quantity}</span>
                  </span>
                  <span className="prize-card-name">{p.name}</span>
                  {p.value > 0 && <span className="prize-card-value">Cost: {p.value}</span>}
                  {queuedCount > 0 && <span className="prize-card-queued-badge">In queue ×{queuedCount}</span>}
                </button>
                <div className="prize-card-actions">
                  <button
                    type="button"
                    className="prize-action-btn"
                    onClick={() => openEditForm(p)}
                    aria-label={`Edit ${p.name}`}
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className={`prize-action-btn ${eligible ? '' : 'prize-action-btn-muted'}`}
                    onClick={() => onSetMysteryEligible(p.id, !eligible)}
                    aria-label={
                      eligible
                        ? `Exclude ${p.name} from Mystery Prize draws`
                        : `Allow ${p.name} in Mystery Prize draws`
                    }
                    title={eligible ? 'Eligible for Mystery draws — click to exclude' : 'Excluded from Mystery draws — click to allow'}
                  >
                    {eligible ? <Dices size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    className="prize-action-btn"
                    onClick={() => handleAddToQueue(p.id)}
                    aria-label={`Add ${p.name} to the prize queue`}
                    title="Add to queue"
                  >
                    <ListPlus size={13} />
                  </button>
                  <button
                    type="button"
                    className="prize-action-btn prize-action-btn-danger"
                    onClick={() => onDelete(p.id)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          <button type="button" className="prize-card-add" onClick={openAddForm}>
            <span className="prize-card-add-icon">
              <Plus size={22} />
            </span>
            <span className="prize-card-add-label">Add a prize</span>
          </button>
        </div>

        <div className="prize-queue-section">
          <div className="prize-queue-header">
            <h3>
              <ListOrdered size={16} /> Prize Queue
            </h3>
            {prizeQueue.length > 0 && (
              <button type="button" className="prize-queue-clear" onClick={handleClearQueue}>
                Clear queue
              </button>
            )}
          </div>
          {prizeQueue.length === 0 ? (
            <p className="prize-queue-empty">
              Empty — every spin draws a Mystery Prize. Use <ListPlus size={13} /> on a prize above to set a fixed order.
            </p>
          ) : (
            <ol className="prize-queue-list">
              {prizeQueue.map((id, index) => {
                const isMystery = id === null;
                const p = isMystery ? null : prizes.find((prize) => prize.id === id);
                if (!isMystery && !p) return null;
                const itemLabel = isMystery ? 'Mystery Prize' : p.name;
                return (
                  <li key={`${id ?? 'mystery'}-${index}`} className="prize-queue-item">
                    {isMystery ? (
                      <span className="prize-queue-item-icon prize-queue-item-icon-mystery">
                        <Dices size={16} />
                      </span>
                    ) : (
                      <img src={p.imageUrl} alt="" className="prize-queue-item-icon" />
                    )}
                    <span className="prize-queue-item-name">{itemLabel}</span>
                    <span className="prize-queue-item-controls">
                      <button
                        type="button"
                        className="icon-button icon-button-small"
                        onClick={() => handleMoveInQueue(index, -1)}
                        disabled={index === 0}
                        aria-label="Move earlier in queue"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button-small"
                        onClick={() => handleMoveInQueue(index, 1)}
                        disabled={index === prizeQueue.length - 1}
                        aria-label="Move later in queue"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button-small"
                        onClick={() => handleRemoveFromQueue(index)}
                        aria-label={`Remove ${itemLabel} from queue`}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {formMode && (
        <>
          <div className="modal-overlay modal-overlay-nested" onClick={closeForm} />
          <div className="modal-panel modal-panel-nested">
            <div className="modal-header">
              <h2>{isEditing ? 'Edit prize' : 'Add a prize'}</h2>
              <button
                className="icon-button icon-button-small"
                onClick={closeForm}
                aria-label="Close"
                disabled={formSaving}
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form modal-form-nested" onSubmit={submitForm}>
              <input
                type="text"
                placeholder="Prize name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="modal-text-input"
                autoFocus
              />
              <div className="modal-field-row">
                <label className="modal-field-label">
                  Quantity
                  <input
                    type="number"
                    min={isEditing ? 0 : 1}
                    step="1"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    className="modal-number-input"
                  />
                </label>
                <label className="modal-field-label">
                  Cost
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    className="modal-number-input"
                  />
                </label>
              </div>
              <p className="modal-field-hint">What this prize cost you — picks which win-fanfare tier plays.</p>
              {!isEditing && (
                <FilePicker
                  accept="image/*"
                  file={formFile}
                  onChange={setFormFile}
                  placeholder="Choose a prize image…"
                  icon={<ImageUp size={16} />}
                  resetToken={fileResetToken}
                />
              )}
              {formError && <p className="modal-form-error">{formError}</p>}
              <div className="modal-form-actions">
                <button type="submit" className="btn btn-secondary" disabled={formSaving}>
                  {formSubmitLabel}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={formSaving}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
