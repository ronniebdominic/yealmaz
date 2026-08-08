// Ye-Almaz — Leave tab: top cards + Requests / Balance / Types / History
// sections, built on the Phase 1 LeaveType + LeaveLedgerEntry ledger
// (balance is always sum(days), never a single stored number).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { MdAdd, MdEventAvailable, MdPending, MdCheckCircle, MdUpcoming } from 'react-icons/md';
import LeaveTypesPanel from '../components/LeaveTypesPanel';

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={16} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const SECTIONS = ['Requests', 'Balance', 'Types'];

export default function LeaveTab({ employees, onOpenLeaveModal }) {
  const [section, setSection] = useState('Requests');
  const [employeeId, setEmployeeId] = useState('');

  const { data: leaveRecords = [] } = useQuery({
    queryKey: ['hr', 'leave-records'],
    queryFn: () => api.get('/attendance/leave').then(r => r.data),
  });

  const now = new Date();
  const pending = leaveRecords.filter(r => r.status === 'APPROVED' && isAfter(new Date(r.toDate), now) && isBefore(new Date(r.fromDate), addDays(now, 1))).length;
  const approvedThisMonth = leaveRecords.filter(r => r.status === 'APPROVED' && new Date(r.fromDate).getMonth() === now.getMonth() && new Date(r.fromDate).getFullYear() === now.getFullYear()).length;
  const upcoming = leaveRecords.filter(r => r.status === 'APPROVED' && isAfter(new Date(r.fromDate), now)).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="filters">
          {SECTIONS.map(s => (
            <button key={s} className={`filter-chip ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>{s}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={onOpenLeaveModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdAdd size={15} /> Log Leave
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <StatCard icon={MdEventAvailable} label="Approved (Active Now)" value={pending} />
        <StatCard icon={MdCheckCircle} label="Approved This Month" value={approvedThisMonth} />
        <StatCard icon={MdUpcoming} label="Upcoming Leave" value={upcoming} />
        <StatCard icon={MdPending} label="Total Records" value={leaveRecords.length} />
      </div>

      {section === 'Requests' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Portion</th><th>Reason</th><th style={{ textAlign: 'center' }}>Status</th></tr>
              </thead>
              <tbody>
                {leaveRecords.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">No leave logged yet</td></tr>
                ) : leaveRecords.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.user?.name}</td>
                    <td>{r.leaveType?.name || '—'}</td>
                    <td>{format(new Date(r.fromDate), 'dd MMM yyyy')}</td>
                    <td>{format(new Date(r.toDate), 'dd MMM yyyy')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.dayPortion === 'FULL' ? 'Full Day' : r.dayPortion === 'HALF_AM' ? 'Half (AM)' : 'Half (PM)'}</td>
                    <td style={{ color: 'var(--text-3)' }}>{r.reason || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${r.status === 'APPROVED' ? 'badge-verified' : 'badge-rejected'}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'Balance' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Leave Balance</div>
            <select className="btn btn-ghost btn-sm" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <LeaveBalanceTable employeeId={employeeId} />
        </div>
      )}

      {section === 'Types' && <LeaveTypesPanel />}
    </div>
  );
}

function LeaveBalanceTable({ employeeId }) {
  const { data: balances = [], isLoading } = useQuery({
    queryKey: ['hr', 'leave-balances', employeeId],
    queryFn: () => api.get('/leave/balances', { params: { userId: employeeId } }).then(r => r.data),
    enabled: !!employeeId,
  });

  if (!employeeId) return <div className="empty-state">Select an employee to see their leave balance</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Leave Type</th><th style={{ textAlign: 'center' }}>Available (days)</th><th style={{ textAlign: 'center' }}>Paid</th></tr></thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={3} className="empty-state">Loading…</td></tr>
          ) : balances.map(b => (
            <tr key={b.leaveTypeId}>
              <td style={{ fontWeight: 600 }}>{b.name}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: b.available <= 0 ? 'var(--red)' : 'var(--green)' }}>{b.available}</td>
              <td style={{ textAlign: 'center' }}>{b.isPaid ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
