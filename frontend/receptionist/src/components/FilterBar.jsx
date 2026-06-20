// Shared search + date-range filter bar.
// All props are controlled — parent owns the state.
export default function FilterBar({
  search = '', onSearch,
  dateFrom = '', onDateFrom,
  dateTo = '', onDateTo,
  placeholder = 'Clinic, case no., patient…',
  style,
}) {
  const hasFilter = search || dateFrom || dateTo;
  const clear = () => {
    onSearch?.('');
    onDateFrom?.('');
    onDateTo?.('');
  };

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', ...style }}>
      {/* Search */}
      <div className="search-input" style={{ flex: 2, minWidth: 200, margin: 0 }}>
        <span className="icon">🔍</span>
        <input
          placeholder={placeholder}
          value={search}
          onChange={e => onSearch?.(e.target.value)}
        />
      </div>

      {/* From */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>FROM</div>
        <input
          type="date"
          value={dateFrom}
          onChange={e => onDateFrom?.(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
        />
      </div>

      {/* To */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>TO</div>
        <input
          type="date"
          value={dateTo}
          onChange={e => onDateTo?.(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
        />
      </div>

      {/* Clear */}
      {hasFilter && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={clear}
          style={{ color: 'var(--red)', alignSelf: 'flex-end' }}
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
}
