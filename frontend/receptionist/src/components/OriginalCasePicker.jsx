import { useState, useEffect } from 'react';
import api from '../api';
import { MdAssignment } from 'react-icons/md';

// Debounced search-as-you-type picker for linking a remake/redo to the
// original case it's branching from (by scan number or patient name).
// Shared by AcceptForm (Dashboard.jsx) and NewCase.jsx's WorkItemForm —
// wherever a remake/redo needs to reference the case it replaces. The link
// is required whenever "remake/redo" is checked: the Operation Manager's
// eventual Redo-vs-Remake decision charges 50% of THIS linked case's
// totalAmount, so without a link there's nothing to calculate from.
export default function OriginalCasePicker({ selected, onSelect, onClear }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/cases', { params: { search: query.trim(), limit: 8 } })
        .then(res => setResults(res.data.cases ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <MdAssignment size={14} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="case-number">{selected.caseNumber || 'No scan #'}</span>{' '}
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{selected.patientName}{selected.workType ? ` · ${selected.workType}` : ''}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} style={{ color: 'var(--red)' }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={{ width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit' }}
        placeholder="Search scan number or patient name…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {searching ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>No matching cases</div>
          ) : results.map(rc => (
            <div key={rc.id}
              onMouseDown={() => { onSelect(rc); setQuery(''); setOpen(false); }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="case-number">{rc.caseNumber || 'No scan #'}</span>{' '}
              <strong>{rc.patientName}</strong>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {rc.clinic?.name}{rc.workType ? ` · ${rc.workType}` : ''}{rc.units ? ` · ${rc.units}u` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
