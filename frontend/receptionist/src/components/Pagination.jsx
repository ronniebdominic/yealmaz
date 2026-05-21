export default function Pagination({ page, totalPages, total, pageSize, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px', borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Showing {from}–{to} of {total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onPrev} disabled={page === 1}>
          ← Prev
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
          Page {page} / {totalPages}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onNext} disabled={page === totalPages}>
          Next →
        </button>
      </div>
    </div>
  );
}
