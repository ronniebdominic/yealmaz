// Self-service "Request Leave" — same embed pattern as AttendanceClock.jsx
// (drop into any dashboard header). Submits a PENDING LeaveRecord via
// POST /api/attendance/leave/request; HR decides via PATCH
// /api/attendance/leave/:id/decide (see hr/tabs/LeaveTab.jsx's Requests
// section for the approval side).
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdEventBusy, MdClose } from 'react-icons/md';

function RequestModal({ onClose, onSubmitted }) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dayPortion, setDayPortion] = useState('FULL');
  const [reason, setReason] = useState('');
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/leave/types').then(r => setLeaveTypes(r.data)).catch(() => {});
  }, []);

  const submit = async () => {
    if (!fromDate || !toDate) { toast.error('From and to dates are required'); return; }
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setSaving(true);
    try {
      await api.post('/attendance/leave/request', { fromDate, toDate, reason, leaveTypeId: leaveTypeId || undefined, dayPortion });
      toast.success('Leave request submitted — awaiting HR approval');
      onSubmitted();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not submit request'); }
    finally { setSaving(false); }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border, #D1D5DB)', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ background: 'var(--blue, #1A56A0)', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Request Leave
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leaveTypes.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>TYPE</div>
              <select value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)} style={inputStyle}>
                <option value="">— None —</option>
                {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>FROM</div>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>TO</div>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['FULL', 'Full Day'], ['HALF_AM', 'Half — AM'], ['HALF_PM', 'Half — PM']].map(([v, l]) => (
              <button key={v} type="button"
                onClick={() => setDayPortion(v)}
                style={{ flex: 1, padding: '7px 8px', fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                  border: dayPortion === v ? '1.5px solid var(--blue, #1A56A0)' : '1px solid #E5E7EB',
                  background: dayPortion === v ? 'rgba(26,86,160,0.08)' : '#fff', color: dayPortion === v ? 'var(--blue, #1A56A0)' : '#6B7280' }}>
                {l}
              </button>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>REASON</div>
            <input value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={submit} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--blue, #1A56A0)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LeaveRequestButton() {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadMine = useCallback(async () => {
    try {
      const res = await api.get('/attendance/leave/mine');
      setPendingCount(res.data.filter(r => r.status === 'PENDING').length);
    } catch (e) { /* self-service — quietly no-op if the role can't call this */ }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  return (
    <>
      <button onClick={() => setOpen(true)} title="Request Leave"
        style={{ background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)', color: '#D97706', borderRadius: 7,
          padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <MdEventBusy size={14} /> Request Leave{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
      </button>
      {open && <RequestModal onClose={() => setOpen(false)} onSubmitted={() => { setOpen(false); loadMine(); }} />}
    </>
  );
}
