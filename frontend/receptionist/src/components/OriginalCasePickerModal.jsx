import { useState, useEffect } from 'react';
import api from '../api';
import { MdAssignment, MdSearch } from 'react-icons/md';

// Full popup version of OriginalCasePicker's search — pops up the moment
// "Remake / Redo" is checked on New Case, instead of leaving a search field
// further down the form for the receptionist to notice. Selecting a result
// here does not close anything itself; the caller's onSelect handles both
// closing the modal and auto-filling the rest of the form from the picked
// case (see WorkItemForm.handleSelectOriginal in NewCase.jsx).
export default function OriginalCasePickerModal({ open, onClose, onSelect }) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/cases', { params: { search: query.trim(), limit: 15 } })
        .then(res => setResults(res.data.cases ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MdAssignment className="mi" size={16} /> Search Original Case
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              By patient name or scan number — its details fill in the rest of this item.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div style={{ position: 'relative' }}>
            <MdSearch size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
            <input
              autoFocus
              style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}
              placeholder="Search patient name or scan number…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
            {searching ? (
              <div style={{ padding: '14px 4px', fontSize: 12.5, color: 'var(--text-3)' }}>Searching…</div>
            ) : !query.trim() ? (
              <div style={{ padding: '14px 4px', fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
                Start typing to search past cases.
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: '14px 4px', fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
                No matching cases found.
              </div>
            ) : results.map(rc => (
              <div
                key={rc.id}
                onClick={() => onSelect(rc)}
                style={{ padding: '10px 6px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span className="case-number">{rc.caseNumber || 'No scan #'}</span>{' '}
                <strong>{rc.patientName}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {rc.clinic?.name}{rc.workType ? ` · ${rc.workType}` : ''}{rc.units ? ` · ${rc.units}u` : ''}{rc.shade ? ` · Shade ${rc.shade}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
