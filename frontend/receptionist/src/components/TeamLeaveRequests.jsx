// First-stage leave approval — for a LEADER (or HR/Admin acting as a
// fallback approver), showing their direct reports' PENDING requests.
// Approving here moves a request to MANAGER_APPROVED, which is what makes
// it show up in the HR portal's Leave tab; rejecting here ends it — HR
// never sees a manager-rejected request.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdGroups } from 'react-icons/md';

// hideEmpty: for surfaces where "manager" isn't the account's primary
// identity (e.g. a LAB_TECH designated as a manager without a LEADER
// login) — renders nothing at all (not even an empty-state box) when
// there's nothing pending, and wraps itself in its own card+header when
// there is, since the host page has no dedicated section for it either
// way. Surfaces that DO have a dedicated "Team Leave Requests" section
// (LeaderDashboard) leave hideEmpty off and supply their own card/header.
export default function TeamLeaveRequests({ hideEmpty = false }) {
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
    return hideEmpty ? null : <div className="empty-state">No pending requests from your team</div>;
  }

  const table = (
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

  if (!hideEmpty) return table;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdGroups size={16} /> Team Leave Requests</div>
      </div>
      {table}
    </div>
  );
}
