// Ye-Almaz — Incentives (More → Incentives). Configurable rules; auto-
// compute only for metrics this system can measure reliably (production
// scans, cases, attendance %) — everything else needs a manual actual
// value rather than a fabricated number.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd, MdRefresh } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const METRIC_LABELS = {
  PRODUCTION_UNITS: 'Production (scans)', CASES: 'Cases', PRODUCTIVITY: 'Productivity',
  ATTENDANCE: 'Attendance %', QUALITY: 'Quality', QC_PASS_RATE: 'QC Pass Rate',
  REMAKE_RATE: 'Remake Rate', REVENUE: 'Revenue', CUSTOM: 'Custom',
};
const AUTO_METRICS = ['PRODUCTION_UNITS', 'CASES', 'ATTENDANCE'];
const REWARD_LABELS = { FIXED: 'Fixed amount if target met', PER_UNIT_OVER_TARGET: 'Rate × amount over target', PERCENTAGE: '% of base salary if target met' };

function RuleForm({ onCreated }) {
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('CASES');
  const [targetValue, setTargetValue] = useState('');
  const [rewardType, setRewardType] = useState('FIXED');
  const [rewardAmount, setRewardAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !targetValue || !rewardAmount) { toast.error('Name, target and reward amount are required'); return; }
    setSaving(true);
    try {
      await api.post('/incentives/rules', { name, metric, targetValue, rewardType, rewardAmount });
      toast.success('Rule created');
      setName(''); setTargetValue(''); setRewardAmount('');
      onCreated();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create rule'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '0 12px' }}>
      <div style={{ gridColumn: '1 / -1' }}><Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Case Target" /></Field></div>
      <Field label="Metric">
        <select style={inputStyle} value={metric} onChange={e => setMetric(e.target.value)}>
          {Object.entries(METRIC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}{!AUTO_METRICS.includes(v) ? ' (manual)' : ''}</option>)}
        </select>
      </Field>
      <Field label="Target Value"><input type="number" style={inputStyle} value={targetValue} onChange={e => setTargetValue(e.target.value)} /></Field>
      <Field label="Reward Type">
        <select style={inputStyle} value={rewardType} onChange={e => setRewardType(e.target.value)}>
          {Object.entries(REWARD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Reward Amount" hint={rewardType === 'PERCENTAGE' ? '%' : rewardType === 'PER_UNIT_OVER_TARGET' ? 'Br/unit' : 'Br'}>
        <input type="number" style={inputStyle} value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} />
      </Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Create Rule'}</button>
      </div>
    </div>
  );
}

export default function IncentivesPanel() {
  const qc = useQueryClient();
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [computeMonth, setComputeMonth] = useState(new Date().getMonth() + 1);
  const [computeYear, setComputeYear] = useState(new Date().getFullYear());
  const [computing, setComputing] = useState(false);

  const { data: rules = [] } = useQuery({ queryKey: ['hr', 'incentive-rules'], queryFn: () => api.get('/incentives/rules').then(r => r.data) });
  const { data: awards = [] } = useQuery({ queryKey: ['hr', 'incentive-awards'], queryFn: () => api.get('/incentives/awards').then(r => r.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr', 'incentive-rules'] }); qc.invalidateQueries({ queryKey: ['hr', 'incentive-awards'] }); };

  const compute = async () => {
    setComputing(true);
    try {
      const res = await api.post('/incentives/compute', { periodMonth: computeMonth, periodYear: computeYear });
      toast.success(`${res.data.awarded} incentive(s) computed for ${computeMonth}/${computeYear}`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not compute'); }
    finally { setComputing(false); }
  };

  const approve = async (id) => { try { await api.patch(`/incentives/awards/${id}/approve`); refresh(); } catch { toast.error('Could not approve'); } };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Incentive Rules</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowRuleForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Rule</button>
        </div>
        {showRuleForm && <RuleForm onCreated={() => { setShowRuleForm(false); refresh(); }} />}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Metric</th><th style={{ textAlign: 'center' }}>Target</th><th>Reward</th></tr></thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">No rules yet</td></tr>
              ) : rules.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{METRIC_LABELS[r.metric]}</td>
                  <td style={{ textAlign: 'center' }}>{r.targetValue}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.rewardAmount} ({REWARD_LABELS[r.rewardType]})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title">Awards</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="number" style={{ ...inputStyle, width: 90 }} value={computeMonth} onChange={e => setComputeMonth(parseInt(e.target.value))} />
            <input type="number" style={{ ...inputStyle, width: 100 }} value={computeYear} onChange={e => setComputeYear(parseInt(e.target.value))} />
            <button className="btn btn-primary btn-sm" onClick={compute} disabled={computing} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MdRefresh size={14} /> {computing ? 'Computing…' : 'Auto-Compute'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Rule</th><th style={{ textAlign: 'center' }}>Actual</th><th style={{ textAlign: 'center' }}>Target</th><th style={{ textAlign: 'center' }}>Amount</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {awards.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">No awards yet</td></tr>
              ) : awards.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.user?.name}</td>
                  <td>{a.rule?.name}</td>
                  <td style={{ textAlign: 'center' }}>{a.actualValue}</td>
                  <td style={{ textAlign: 'center' }}>{a.targetValue}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>Br {a.awardedAmount.toLocaleString('en-US')}</td>
                  <td style={{ textAlign: 'center' }}><span className={`badge ${a.status !== 'PENDING' ? 'badge-verified' : ''}`}>{a.status}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {a.status === 'PENDING' && <button className="btn btn-ghost btn-sm" onClick={() => approve(a.id)}>Approve</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
