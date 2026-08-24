// Ye-Almaz — Admin Trash (deleted case recovery)
//
// Deleting a case removes it from the live tables and stores a full
// snapshot in `deleted_cases` (see the DeletedCase model for why an archive
// is used rather than a deletedAt flag). This screen is where those come
// back from — or are destroyed for good.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdDelete, MdRestoreFromTrash, MdSearch, MdWarning, MdDeleteForever } from 'react-icons/md';

function ConfirmPurge({ row, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const purge = async () => {
    setBusy(true);
    try {
      await api.delete(`/cases/trash/${row.id}`);
      toast.success(`${row.caseNumber || 'Case'} permanently deleted`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete');
    } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--red)' }}>
            <MdWarning size={18} /> Delete permanently
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
            <strong>{row.caseNumber || row.id}</strong>
            {row.patientName ? ` — ${row.patientName}` : ''} will be destroyed completely.
            Its stages, comments, delivery records and payment cannot be recovered afterwards.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
            If you only wanted it out of the way, leaving it in the trash is enough — it is
            already excluded from every report, dashboard and revenue figure.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              onClick={purge} disabled={busy}
              style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminTrash() {
  const [search, setSearch] = useState('');
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const qc = useQueryClient();

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'trash', search],
    queryFn: () => api.get('/cases/trash', { params: { search: search || undefined } }).then(r => r.data),
    staleTime: 10_000,
  });

  const restore = async (row) => {
    setRestoring(row.id);
    try {
      const { data } = await api.post(`/cases/trash/${row.id}/restore`);
      toast.success(data.message || 'Case restored');
      // Reward points are deliberately not re-credited on restore, so say so
      // rather than letting the clinic's balance quietly stay short.
      if (data.pointsNotRestored > 0) {
        toast(`${data.pointsNotRestored} reward point(s) were reversed when this case was deleted and were not re-credited.`,
          { icon: 'ℹ️', duration: 7000 });
      }
      refetch();
      qc.invalidateQueries({ queryKey: ['cases'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not restore');
    } finally { setRestoring(null); }
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MdDelete className="mi" size={18} /> Trash
        </div>
      </div>

      <div className="content">
        <div className="card" style={{ padding: 12, marginBottom: 14, borderLeft: '3px solid var(--blue, #1565C0)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Deleted cases are kept here with their full history and can be restored.
            While in the trash they are excluded from every dashboard, report and revenue
            figure, exactly as if they were gone.
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: 14, maxWidth: 380 }}>
          <MdSearch size={19} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search case number, patient or clinic"
            style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
          />
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case</th><th>Patient</th><th>Clinic</th><th>Work Type</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Status when deleted</th><th>Deleted</th><th>By</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="empty-state">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="empty-state">
                    {search ? 'Nothing in the trash matches that' : 'The trash is empty'}
                  </td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="case-number">{r.caseNumber || '—'}</span></td>
                    <td><span className="patient-name">{r.patientName || '—'}</span></td>
                    <td style={{ fontSize: 13 }}>{r.clinicName || '—'}</td>
                    <td style={{ fontSize: 13 }}>{r.workType || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.totalAmount != null ? `Br ${r.totalAmount.toLocaleString('en-US')}` : '—'}
                    </td>
                    <td><span className="badge">{r.status || '—'}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {format(new Date(r.deletedAt), 'dd MMM yyyy, h:mm a')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.deletedByName || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-primary btn-sm" disabled={restoring === r.id}
                          onClick={() => restore(r)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <MdRestoreFromTrash size={15} /> {restoring === r.id ? 'Restoring…' : 'Restore'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm" onClick={() => setPurgeTarget(r)}
                          title="Delete permanently"
                          style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <MdDeleteForever size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {purgeTarget && (
        <ConfirmPurge
          row={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onDone={() => { setPurgeTarget(null); refetch(); }}
        />
      )}
    </AdminLayout>
  );
}
