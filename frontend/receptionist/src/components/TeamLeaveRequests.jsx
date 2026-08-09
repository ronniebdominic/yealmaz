// First-stage leave approval — for a LEADER (or HR/Admin acting as a
// fallback approver), showing their direct reports' PENDING requests.
// Approving here moves a request to MANAGER_APPROVED, which is what makes
// it show up in the HR portal's Leave tab; rejecting here ends it — HR
// never sees a manager-rejected request.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function TeamLeaveRequests() {
  const qc = useQueryClient();
  const { data: requests = [] } = useQuery({
    queryKey: ['team-leave-requests'],
    queryFn: () => api.get('/attendance/leave/team').then(r => r.data),
  });

  const decide = async (id, decision) => {
    try {
      await api.patch(`/attendance/leave/${id}/manager-decide`, { decision });
      toast.success(decision === 'APPROVED' ? 'Approved — now with HR for final sign-off' : 'Request declined');
      qc.invalidateQueries({ queryKey: ['team-leave-requests'] });
    } catch (err) { toast.error(err.response?.data?.error || 'Could not decide on request'); }
  };

  if (requests.length === 0) {
    return <div className="empty-state">No pending requests from your team</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
        <tbody>
          {requests.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.user?.name}</td>
              <td>{r.leaveType?.name || '—'}</td>
              <td>{format(new Date(r.fromDate), 'dd MMM yyyy')}</td>
              <td>{format(new Date(r.toDate), 'dd MMM yyyy')}</td>
              <td style={{ color: 'var(--text-3)' }}>{r.reason || '—'}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => decide(r.id, 'APPROVED')} style={{ marginRight: 6 }}>Approve</button>
                <button className="btn btn-ghost btn-sm" onClick={() => decide(r.id, 'REJECTED')}>Decline</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
