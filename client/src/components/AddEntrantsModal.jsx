import { useState } from 'react';
import { FileText, UserRoundPlus, X } from 'lucide-react';
import FilePicker from './FilePicker.jsx';

export default function AddEntrantsModal({ open, onClose, onAdd, onImport }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [entries, setEntries] = useState('1');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [csvFile, setCsvFile] = useState(null);
  const [csvResetToken, setCsvResetToken] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState(null);

  if (!open) return null;

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const count = Number.parseInt(entries, 10);
    if (!name.trim() || !email.trim()) {
      setAddError('Name and email are both required.');
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      setAddError('Entries must be a whole number of at least 1.');
      return;
    }
    setAddError('');
    setAdding(true);
    try {
      await onAdd({ name: name.trim(), email: email.trim(), entries: count });
      setName('');
      setEmail('');
      setEntries('1');
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  // Picking a CSV file *is* the import action — no separate submit button,
  // so this isn't "choose a file" plus a second, unrelated-looking button.
  const handleCsvSelected = async (selectedFile) => {
    if (!selectedFile) return;
    setCsvFile(selectedFile);
    setImportError('');
    setImportSummary(null);
    setImporting(true);
    try {
      const text = await selectedFile.text();
      const result = await onImport(text);
      setImportSummary(result);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
      setCsvFile(null);
      setCsvResetToken((t) => t + 1);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-header">
          <h2>Add Entrants</h2>
          <button className="icon-button icon-button-small" onClick={onClose} aria-label="Close add entrants">
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleAddSubmit}>
          <h3>Add one entrant</h3>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="modal-text-input"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="modal-text-input"
          />
          <label className="modal-field-label">
            Entries
            <input
              type="number"
              min="1"
              step="1"
              value={entries}
              onChange={(e) => setEntries(e.target.value)}
              className="modal-number-input"
            />
          </label>
          {addError && <p className="modal-form-error">{addError}</p>}
          <button type="submit" className="btn btn-secondary" disabled={adding}>
            {adding ? (
              'Adding…'
            ) : (
              <>
                <UserRoundPlus size={16} /> Add Entrant
              </>
            )}
          </button>
        </form>

        <div className="modal-form">
          <h3>Or import a CSV</h3>
          <p className="options-hint">Columns: name, email, entries (all required). A header row is optional.</p>
          <FilePicker
            accept=".csv,text/csv"
            file={csvFile}
            onChange={handleCsvSelected}
            placeholder={importing ? 'Importing…' : 'Choose a CSV file…'}
            icon={<FileText size={16} />}
            resetToken={csvResetToken}
            disabled={importing}
          />
          {importError && <p className="modal-form-error">{importError}</p>}
          {importSummary && (
            <p className="modal-form-summary">
              Added {importSummary.addedCount}
              {importSummary.skipped.length > 0 ? `, skipped ${importSummary.skipped.length}` : ''}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
