// Ye-Almaz — Overtime (More → Overtime). Detected → Approval → Approved
// workflow. Phase 1 tracks hours + approval only — payrollStatus stays
// UNPAID until Phase 2 wires in Salary Structures.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdRefresh } from 'react-icons/md';
import { inputStyle } from '../../../utils/adminForms';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

export default function OvertimePanel() {
  const qc = useQueryClient();
  const [approvalStatus, setApprovalStatus] = useState('');
  const [detectDate, setDetectDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [detecting, setDetecting] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['hr', 'overtime', approvalStatus],
    queryFn: () => api.get('/overtime', { params: { approvalStatus: approvalStatus || undefined } }).then(r => r.data),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'overtime'] });

  const detect = async () => {
    setDetecting(true);
    try {
      const res = await api.post('/overtime/detect', { date: detectDate });
      toast.success(`Detected ${res.data.detected} overtime record(s) for ${detectDate}`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Detection failed'); }
    finally { setDetecting(false); }
  };

  const approve = async (id) => { try { await api.patch(`/overtime/${id}/approve`); refresh(); } catch { toast.error('Could not approve'); } };
  const reject = async (id) => { try { await api.patch(`/overtime/${id}/reject`); refresh(); } catch { toast.error('Could not reject'); } };

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="card-title">Overtime</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={detectDate} onChange={e => setDetectDate(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={detect} disabled={detecting} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MdRefresh size={14} /> {detecting ? 'Detecting…' : 'Run Detection'}
          </button>
        </div>
      </div>
      <div className="filters" style={{ padding: '0 16px', marginTop: 12 }}>
        {FILTERS.map(f => (
          <button key={f.value} className={`filter-chip ${approvalStatus === f.value ? 'active' : ''}`} onClick={() => setApprovalStatus(f.value)}>{f.label}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Employee</th><th>Date</th><th style={{ textAlign: 'center' }}>Regular</th><th style={{ textAlign: 'center' }}>Overtime</th><th>Source</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">No overtime records</td></tr>
            ) : records.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.user?.name}</td>
                <td>{format(new Date(r.date), 'dd MMM yyyy')}</td>
                <td style={{ textAlign: 'center' }}>{r.regularHours}h</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--amber)' }}>{r.overtimeHours}h</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.source === 'AUTO_DETECTED' ? 'Auto' : 'Manual'}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${r.approvalStatus === 'APPROVED' ? 'badge-verified' : r.approvalStatus === 'REJECTED' ? 'badge-rejected' : ''}`}>{r.approvalStatus}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.approvalStatus === 'PENDING' && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => approve(r.id)} style={{ marginRight: 6 }}>Approve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => reject(r.id)}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
