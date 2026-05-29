import { useState, useRef, useEffect } from 'react';

/**
 * SearchableSelect — a combobox that filters options by typing.
 *
 * Props:
 *   value        — currently selected value (string)
 *   onChange     — called with new value string
 *   options      — [{ value, label }]
 *   placeholder  — placeholder text when nothing selected
 *   style        — extra style for the wrapper
 */
export default function SearchableSelect({ value, onChange, options, placeholder = '— Select —', style }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef           = useRef(null);
  const inputRef          = useRef(null);

  const selected = options.find(o => o.value === value);
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pick(opt) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  function clear(e) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      {/* Trigger */}
      <div
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '7px 10px 7px 12px', fontSize: 13,
          color: selected ? 'var(--text-1)' : 'var(--text-3)',
          background: 'var(--surface)', cursor: 'pointer', userSelect: 'none',
          minWidth: 160,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 6, flexShrink: 0 }}>
          {value && (
            <span
              onClick={clear}
              style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1, cursor: 'pointer', padding: '1px 3px' }}
            >✕</span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>▼</span>
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 6,
                padding: '5px 8px', fontSize: 13, background: 'var(--bg)',
                color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-3)' }}>No results</div>
            ) : filtered.map(opt => (
              <div
                key={opt.value}
                onMouseDown={() => pick(opt)}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  color: opt.value === value ? 'var(--blue)' : 'var(--text-1)',
                  background: opt.value === value ? 'var(--blue-tint, rgba(59,130,246,0.08))' : 'transparent',
                }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = opt.value === value ? 'var(--blue-tint, rgba(59,130,246,0.08))' : 'transparent'; }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
