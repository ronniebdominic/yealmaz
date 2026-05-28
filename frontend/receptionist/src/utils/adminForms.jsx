// Shared utilities for Admin form modals (Clinics & Users)

// ── Password Generator ────────────────────────────────────
export function generatePassword(length = 12) {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;
  const pass = [
    upper [Math.floor(Math.random() * upper.length)],
    lower [Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
  ];
  for (let i = pass.length; i < length; i++)
    pass.push(all[Math.floor(Math.random() * all.length)]);
  return pass.sort(() => Math.random() - 0.5).join('');
}

// ── Shared Styles ─────────────────────────────────────────
export const inputStyle = {
  width: '100%', padding: '9px 12px',
  border: '1.5px solid var(--border)', borderRadius: 8,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)',
  fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box',
};

export const labelStyle = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-2)',
  display: 'block', marginBottom: 5,
};

// ── Field Wrapper ─────────────────────────────────────────
export function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label}
        {hint && (
          <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Password Field ────────────────────────────────────────
// Reusable inline password input with show/hide + regenerate buttons.
// Props:
//   value        — current password string
//   onChange     — (newValue: string) => void
//   showPass     — boolean controlled externally
//   onToggleShow — () => void
//   onRegenerate — () => void  (optional — omit to hide the ↺ button)
//   autoFocus    — boolean (default false)
export function PasswordInput({ value, onChange, showPass, onToggleShow, onRegenerate, autoFocus = false }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        style={{
          ...inputStyle,
          paddingRight: onRegenerate ? 80 : 44,
          fontFamily: showPass ? 'DM Mono, monospace' : 'inherit',
        }}
        type={showPass ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <div style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', gap: 4,
      }}>
        <button
          type="button"
          onClick={onToggleShow}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)' }}
        >
          {showPass ? '🙈' : '👁'}
        </button>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--blue)', fontWeight: 700 }}
          >
            ↺ New
          </button>
        )}
      </div>
    </div>
  );
}
