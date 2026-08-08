// Ye-Almaz — Payroll Runs tab. Phase 1 gave this a single DRAFT→FINALIZED
// state; Phase 2 adds the full DRAFT→PROCESSING→REVIEW→APPROVED→PAID→
// FINALIZED ("Closed") workflow, a totals summary, and distinguishes
// auto-generated adjustments (salary structure/overtime/advances/
// expenses/incentives, pulled in automatically at run creation) from
// HR's manual ones.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd, MdArrowForward, MdPrint, MdAutoAwesome } from 'react-icons/md';
import { printPayslip } from '../../../utils/printPayslip';
import { inputStyle } from '../../../utils/adminForms';
import AdjustmentModal from '../components/AdjustmentModal';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORKFLOW = ['DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PAID', 'FINALIZED'];
const STATUS_LABELS = { DRAFT: 'Draft', PROCESSING: 'Processing', REVIEW: 'Review', APPROVED: 'Approved', PAID: 'Paid', FINALIZED: 'Closed' };
const ADJUSTABLE_STATUSES = ['DRAFT', 'PROCESSING', 'REVIEW'];

function StatusBadge({ status }) {
  const isTerminal = status === 'FINALIZED' || status === 'PAID';
  return <span className={`badge ${isTerminal ? 'badge-verified' : ''}`}>{STATUS_LABELS[status] || status}</span>;
}

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

  const advanceRun = async (run) => {
    const idx = WORKFLOW.indexOf(run.status);
    const next = WORKFLOW[idx + 1];
    if (next === 'FINALIZED' && !window.confirm('Close this payroll run? Once closed it cannot be reopened or adjusted.')) return;
    try {
      await api.patch(`/payroll/runs/${run.id}/advance`);
      toast.success(`Run moved to ${STATUS_LABELS[next]}`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not advance run'); }
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
                  <td style={{ textAlign: 'center' }}><StatusBadge status={r.status} /></td>
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
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="card-title">{MONTH_NAMES[activeRun.periodMonth - 1]} {activeRun.periodYear} — Entries</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Workflow: {WORKFLOW.map(s => STATUS_LABELS[s]).join(' → ')} — currently <strong>{STATUS_LABELS[activeRun.status]}</strong>
              </div>
            </div>
            {canManage && WORKFLOW.indexOf(activeRun.status) < WORKFLOW.length - 1 && (
              <button className="btn btn-success btn-sm" onClick={() => advanceRun(activeRun)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MdArrowForward size={14} /> Advance to {STATUS_LABELS[WORKFLOW[WORKFLOW.indexOf(activeRun.status) + 1]]}
              </button>
            )}
          </div>

          {activeRun.totals && (
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', padding: 16, marginBottom: 0 }}>
              <div className="stat-card"><div className="stat-value">Br {activeRun.totals.grossEarnings.toLocaleString('en-US')}</div><div className="stat-label">Gross Earnings</div></div>
              <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>Br {Math.abs(activeRun.totals.deductions).toLocaleString('en-US')}</div><div className="stat-label">Deductions</div></div>
              <div className="stat-card"><div className="stat-value" style={{ color: 'var(--blue)' }}>Br {activeRun.totals.netPay.toLocaleString('en-US')}</div><div className="stat-label">Total Net Pay</div></div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th style={{ textAlign: 'center' }}>Base Salary</th><th>Adjustments</th><th style={{ textAlign: 'center' }}>Net Pay</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {activeRun.entries.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ fontWeight: 600 }}>{entry.user?.name}</td>
                    <td style={{ textAlign: 'center' }}>Br {entry.baseSalarySnapshot.toLocaleString('en-US')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {entry.adjustments.length === 0 ? '—' : entry.adjustments.map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {a.autoGenerated && <MdAutoAwesome size={11} title="Auto-generated" style={{ opacity: 0.6 }} />}
                          {a.label} ({a.amount >= 0 ? '+' : ''}{a.amount})
                        </div>
                      ))}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>Br {entry.netPay.toLocaleString('en-US')}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canManage && ADJUSTABLE_STATUSES.includes(activeRun.status) && (
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
