// Ye-Almaz — Payroll Runs tab. Lifted from the old AdminHR.jsx (viewer) +
// HRDashboard.jsx (create/finalize/adjust) — same behavior, one
// implementation. Phase 2 will extend this (Salary Structures, Incentives,
// Advances) rather than rebuild it.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd, MdCheckCircle, MdPrint } from 'react-icons/md';
import { printPayslip } from '../../../utils/printPayslip';
import { inputStyle } from '../../../utils/adminForms';
import AdjustmentModal from '../components/AdjustmentModal';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollRunsTab({ canManage }) {
  const qc = useQueryClient();
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [activeRunId, setActiveRunId] = useState(null);
  const [adjustmentEntry, setAdjustmentEntry] = useState(null);

  const { data: runs = [] } = useQuery({
    queryKey: ['hr', 'payroll', 'runs'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
  });
  const { data: activeRun } = useQuery({
    queryKey: ['hr', 'payroll', 'run', activeRunId],
    queryFn: () => api.get(`/payroll/runs/${activeRunId}`).then(r => r.data),
    enabled: !!activeRunId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'payroll'] });

  const createRun = async () => {
    try {
      const res = await api.post('/payroll/runs', { periodMonth, periodYear });
      toast.success(`Payroll run created — ${res.data.employeeCount ?? ''} employees`.trim() + (res.data.missingSalaryCount ? ` (${res.data.missingSalaryCount} missing a salary)` : ''));
      setActiveRunId(res.data.run?.id || res.data.id);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create run'); }
  };

  const finalizeRun = async (runId) => {
    if (!window.confirm('Finalize this payroll run? No further adjustments can be added afterward.')) return;
    try {
      await api.patch(`/payroll/runs/${runId}/finalize`);
      toast.success('Payroll run finalized');
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not finalize run'); }
  };

  return (
    <div>
      {canManage && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>MONTH</div>
            <select value={periodMonth} onChange={e => setPeriodMonth(parseInt(e.target.value))} style={{ ...inputStyle, width: 160 }}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>YEAR</div>
            <input type="number" value={periodYear} onChange={e => setPeriodYear(parseInt(e.target.value))} style={{ ...inputStyle, width: 100 }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={createRun} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MdAdd size={15} /> Create Run
          </button>
        </div>
      )}

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
                  <td>{r.createdBy?.name || '—'}</td>
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
            {canManage && activeRun.status === 'DRAFT' && (
              <button className="btn btn-success btn-sm" onClick={() => finalizeRun(activeRun.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MdCheckCircle size={14} /> Finalize Run
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th style={{ textAlign: 'center' }}>Base Salary</th><th style={{ textAlign: 'center' }}>Adjustments</th><th style={{ textAlign: 'center' }}>Net Pay</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {activeRun.entries.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ fontWeight: 600 }}>{entry.user?.name}</td>
                    <td style={{ textAlign: 'center' }}>Br {entry.baseSalarySnapshot.toLocaleString('en-US')}</td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                      {entry.adjustments.length === 0 ? '—' : entry.adjustments.map(a => `${a.label} (${a.amount >= 0 ? '+' : ''}${a.amount})`).join(', ')}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>Br {entry.netPay.toLocaleString('en-US')}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canManage && activeRun.status === 'DRAFT' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setAdjustmentEntry(entry)} style={{ marginRight: 6 }}><MdAdd size={13} /> Adjust</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => printPayslip(entry, activeRun)}><MdPrint size={13} /> Payslip</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adjustmentEntry && (
        <AdjustmentModal entry={adjustmentEntry} onClose={() => setAdjustmentEntry(null)}
          onSaved={() => { setAdjustmentEntry(null); refresh(); }} />
      )}
    </div>
  );
}
