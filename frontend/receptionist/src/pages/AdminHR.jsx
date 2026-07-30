import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { printPayslip } from '../utils/printPayslip';
import { MdGroups, MdPrint } from 'react-icons/md';

const TABS = ['Employees', 'Attendance', 'Leave', 'Payroll Runs'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AdminHR() {
  const [tab, setTab] = useState('Employees');
  const [activeRunId, setActiveRunId] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['admin', 'hr', 'employees'],
    queryFn: () => api.get('/employees').then(r => r.data),
    enabled: tab === 'Employees',
  });
  const { data: attendance = { events: [] } } = useQuery({
    queryKey: ['admin', 'hr', 'attendance'],
    queryFn: () => api.get('/attendance').then(r => r.data),
    enabled: tab === 'Attendance',
  });
  const { data: leaveRecords = [] } = useQuery({
    queryKey: ['admin', 'hr', 'leave'],
    queryFn: () => api.get('/attendance/leave').then(r => r.data),
    enabled: tab === 'Leave',
  });
  const { data: runs = [] } = useQuery({
    queryKey: ['admin', 'hr', 'payroll', 'runs'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
    enabled: tab === 'Payroll Runs',
  });
  const { data: activeRun } = useQuery({
    queryKey: ['admin', 'hr', 'payroll', 'run', activeRunId],
    queryFn: () => api.get(`/payroll/runs/${activeRunId}`).then(r => r.data),
    enabled: !!activeRunId,
  });

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdGroups className="mi" size={18} /> HR & Payroll</div>
      </div>
      <div className="content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>{t}</button>
          ))}
        </div>

        {tab === 'Employees' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Role</th><th>Employee Code</th><th>Position</th>
                    <th style={{ textAlign: 'center' }}>Base Salary</th><th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">No employees yet</td></tr>
                  ) : employees.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.name}</td>
                      <td>{e.role}</td>
                      <td>{e.employeeProfile?.employeeCode || '—'}</td>
                      <td>{e.employeeProfile?.position || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{e.employeeProfile?.baseSalary != null ? `Br ${e.employeeProfile.baseSalary.toLocaleString('en-US')}` : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${e.employeeProfile?.employmentStatus === 'ACTIVE' || !e.employeeProfile ? 'badge-verified' : ''}`}>{e.employeeProfile?.employmentStatus || 'ACTIVE'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'Attendance' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Employee</th><th style={{ textAlign: 'center' }}>Type</th><th>Time</th><th style={{ textAlign: 'center' }}>Source</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {attendance.events.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">No attendance events yet</td></tr>
                  ) : attendance.events.map(ev => (
                    <tr key={ev.id}>
                      <td style={{ fontWeight: 600 }}>{ev.user?.name}</td>
                      <td style={{ textAlign: 'center' }}>{ev.type === 'CLOCK_IN' ? 'Clock In' : 'Clock Out'}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{format(new Date(ev.timestamp), 'dd MMM yyyy, h:mm a')}</td>
                      <td style={{ textAlign: 'center' }}>{ev.source}</td>
                      <td style={{ fontSize: 12, color: ev.note ? 'var(--red)' : 'var(--text-3)' }}>{ev.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'Leave' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Employee</th><th>From</th><th>To</th><th>Reason</th><th style={{ textAlign: 'center' }}>Status</th></tr>
                </thead>
                <tbody>
                  {leaveRecords.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">No leave logged yet</td></tr>
                  ) : leaveRecords.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.user?.name}</td>
                      <td>{format(new Date(r.fromDate), 'dd MMM yyyy')}</td>
                      <td>{format(new Date(r.toDate), 'dd MMM yyyy')}</td>
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

        {tab === 'Payroll Runs' && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Period</th><th style={{ textAlign: 'center' }}>Employees</th><th style={{ textAlign: 'center' }}>Status</th><th>Created By</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No payroll runs yet</td></tr>
                    ) : runs.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{MONTH_NAMES[r.periodMonth - 1]} {r.periodYear}</td>
                        <td style={{ textAlign: 'center' }}>{r._count?.entries ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${r.status === 'FINALIZED' ? 'badge-verified' : ''}`}>{r.status}</span>
                        </td>
                        <td>{r.createdBy?.name}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setActiveRunId(r.id)}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {activeRun && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">{MONTH_NAMES[activeRun.periodMonth - 1]} {activeRun.periodYear} — Entries</div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Employee</th><th style={{ textAlign: 'center' }}>Base Salary</th><th style={{ textAlign: 'center' }}>Net Pay</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                    </thead>
                    <tbody>
                      {activeRun.entries.map(entry => (
                        <tr key={entry.id}>
                          <td style={{ fontWeight: 600 }}>{entry.user?.name}</td>
                          <td style={{ textAlign: 'center' }}>Br {entry.baseSalarySnapshot.toLocaleString('en-US')}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>Br {entry.netPay.toLocaleString('en-US')}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => printPayslip(entry, activeRun)}><MdPrint size={13} /> Payslip</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
