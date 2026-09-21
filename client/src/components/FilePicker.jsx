// A single styled control for picking a file — visually one form field, not
// a native "Choose file" button sitting next to an unrelated-looking submit
// button. `resetToken` lets the parent force a fresh (empty) input after a
// selection is handled, since a file input's own value can't be set
// programmatically.
export default function FilePicker({ accept, file, onChange, placeholder, icon, resetToken, disabled }) {
  return (
    <label className={`file-picker ${disabled ? 'disabled' : ''}`}>
      <input
        key={resetToken}
        type="file"
        accept={accept}
        className="visually-hidden"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files[0] || null)}
      />
      <span className="file-picker-box">
        {icon}
        <span className="file-picker-text">{file ? file.name : placeholder}</span>
      </span>
    </label>
  );
}
