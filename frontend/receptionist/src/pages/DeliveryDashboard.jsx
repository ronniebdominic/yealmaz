import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Confirm action modal ──────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');

  const CFG = {
    impression_collected: {
      title: '✓ Impression Collected',
      desc: 'Confirm you have collected the dental impression from the clinic and are bringing it to the lab.',
      btn: '✓ Confirm — Impression Collected',
      cls: 'btn btn-primary',
      needsReason: false,
    },
    impression_not_collected: {
      title: '✕ Could Not Collect',
      desc: 'The impression could not be collected. This case will return to the pickup queue for reassignment.',
      btn: '✕ Could Not Collect',
      cls: 'btn btn-ghost',
      needsReason: true,
      placeholder: 'Reason (e.g. clinic closed, patient not ready)…',
    },
    picked_up_from_lab: {
      title: '✓ Picked Up from Lab',
      desc: 'Confirm you have picked up this case from the lab and are heading to the clinic for delivery.',
      btn: '✓ Confirm — Picked Up from Lab',
      cls: 'btn btn-primary',
      needsReason: false,
    },
    not_picked_up_from_lab: {
      title: '✕ Cannot Pick Up',
      desc: 'You cannot collect this case from the lab. It will be returned to Dispatch for reassignment.',
      btn: '✕ Return to Dispatch',
      cls: 'btn btn-ghost',
      needsReason: true,
      placeholder: 'Reason (e.g. not ready, wrong package)…',
    },
    delivered: {
      title: '✅ Confirm Delivery',
      desc: 'Confirm this case has been successfully delivered to the clinic.',
      btn: '✅ Mark as Delivered',
      cls: 'btn btn-success',
      needsReason: false,
    },
    not_delivered: {
      title: '↩ Could Not Deliver',
      desc: 'Delivery was unsuccessful. The case will be returned to Dispatch for reassignment.',
      btn: '↩ Return to Dispatch',
      cls: 'btn btn-ghost',
      needsReason: true,
      placeholder: 'Reason (e.g. clinic closed, wrong address)…',
    },
  };

  const cfg = CFG[action] || { title: 'Confirm', desc: '', btn: 'Confirm', cls: 'btn btn-primary', needsReason: false };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{cfg.title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>{cfg.desc}</p>

          {/* Case summary */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
              🏥 {caseData.clinic?.name}
            </div>
            {caseData.clinic?.address && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
                📍 {caseData.clinic.address}
              </div>
            )}
            {caseData.clinic?.phone && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
                📞 <a href={`tel:${caseData.clinic.phone}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {caseData.clinic.phone}
                </a>
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
              <span className="case-number" style={{ marginRight: 8 }}>{caseData.caseNumber || 'No scan # yet'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{caseData.patientName}</span>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{caseData.workType}</div>
            </div>
          </div>

          {cfg.needsReason && (
            <textarea
              rows={2}
              placeholder={cfg.placeholder}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }}
            />
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              className={cfg.cls}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onConfirm(reason)}
              disabled={loading || (cfg.needsReason && !reason.trim())}
            >
              {loading ? 'Processing…' : cfg.btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────
function JobCard({ c, section, onAction }) {
  const borderColor = section === 'impression' ? '#EA580C'
    : section === 'lab-pickup' ? 'var(--accent)'
    : 'var(--green)';

  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date();

  return (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}` }}>
      {/* Clinic info — primary focus for delivery staff */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>
          🏥 {c.clinic?.name}
        </div>
        {c.clinic?.address ? (
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span>📍</span>
            <span>{c.clinic.address}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>📍 No address on file</div>
        )}
        {c.clinic?.phone ? (
          <div style={{ fontSize: 14, marginBottom: 4 }}>
            📞 <a href={`tel:${c.clinic.phone}`} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
              {c.clinic.phone}
            </a>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>📞 No contact on file</div>
        )}
      </div>

      {/* Case details — secondary */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {c.caseNumber
            ? <span className="case-number">{c.caseNumber}</span>
            : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--amber-dim)', color: 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>No Scan # Yet</span>
          }
          {c.deliveryType === 'EXPRESS' && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)' }}>⚡ Express</span>
          )}
        </div>
        <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{c.patientName}</div>
        <div style={{ color: 'var(--text-2)' }}>{c.workType}{c.units != null ? ` · ${c.units} units` : ''}</div>
        {c.dueDate && (
          <div style={{ marginTop: 4, fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text-3)', fontWeight: isOverdue ? 700 : 400 }}>
            📅 Due: {format(new Date(c.dueDate), 'dd MMM yyyy')}{isOverdue ? ' — OVERDUE' : ''}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {section === 'impression' && (
          <>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onAction(c, 'impression_collected')}
            >
              ✓ Impression Collected
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)' }}
              onClick={() => onAction(c, 'impression_not_collected')}
            >
              ✕ Not Collected
            </button>
          </>
        )}

        {section === 'lab-pickup' && (
          <>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onAction(c, 'picked_up_from_lab')}
            >
              ✓ Picked Up from Lab
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)' }}
              onClick={() => onAction(c, 'not_picked_up_from_lab')}
            >
              ↩ Return to Dispatch
            </button>
          </>
        )}

        {section === 'delivery' && (
          <>
            <button
              className="btn btn-success btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onAction(c, 'delivered')}
            >
              ✅ Mark as Delivered
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)' }}
              onClick={() => onAction(c, 'not_delivered')}
            >
              ↩ Not Delivered
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────
function Section({ title, icon, color, cases, section, onAction, emptyText, emptyNote }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">{icon} {title}</div>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700 }}>
          {cases.length} job{cases.length !== 1 ? 's' : ''}
        </span>
      </div>
      {cases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-title">{emptyText}</div>
          {emptyNote && <p>{emptyNote}</p>}
        </div>
      ) : (
        <div>{cases.map(c => <JobCard key={c.id} c={c} section={section} onAction={onAction} />)}</div>
      )}
    </div>
  );
}

// ── Main Delivery Dashboard ───────────────────────────────
export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // { case, action }
  const [processing, setProcessing] = useState(false);
  const [tab, setTab]         = useState('all'); // 'all' | section tabs

  const loadCases = useCallback(async () => {
    try {
      const res = await api.get('/delivery/assigned');
      setCases(res.data.cases ?? res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
    const t = setInterval(loadCases, 20_000);
    return () => clearInterval(t);
  }, [loadCases]);

  // Socket: real-time assignment notifications
  useEffect(() => {
    if (!user?.id) return;
    import('../api').then(mod => {
      const socket = mod.socket;
      if (!socket) return;
      socket.emit('join_delivery', user.id);
      socket.on('case_assigned', () => loadCases());
      return () => socket.off('case_assigned');
    }).catch(() => {});
  }, [user?.id, loadCases]);

  const handleAction = async (reason = '') => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { case: c, action } = modal;

      if (action === 'impression_collected') {
        await api.post(`/delivery/${c.id}/collect-impression`);
        toast.success('✓ Impression collected — heading to lab');

      } else if (action === 'impression_not_collected') {
        await api.patch(`/cases/${c.id}/status`, {
          status: 'PENDING_PICKUP',
          notes: reason || 'Could not collect impression — returned to queue',
        });
        toast.success('↩ Case returned to pickup queue');

      } else if (action === 'picked_up_from_lab') {
        await api.post(`/delivery/${c.id}/pickup`);
        toast.success('✓ Picked up from lab — heading to clinic');

      } else if (action === 'not_picked_up_from_lab') {
        await api.post(`/delivery/${c.id}/return-to-dispatch`, {
          reason: reason || 'Could not pick up from lab — returned to dispatch',
        });
        toast.success('↩ Case returned to Dispatch');

      } else if (action === 'delivered') {
        await api.post(`/delivery/${c.id}/deliver`);
        toast.success('✅ Delivery confirmed!');

      } else if (action === 'not_delivered') {
        await api.post(`/delivery/${c.id}/return-to-dispatch`, {
          reason: reason || 'Could not deliver — returned to dispatch',
        });
        toast.success('↩ Case returned to Dispatch');
      }

      setModal(null);
      loadCases();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  // Split cases into their sections
  const impressionPickups = cases.filter(c => c.status === 'PICKUP_ASSIGNED');
  const labPickups        = cases.filter(c => c.status === 'READY_TO_DISPATCH');
  const outForDelivery    = cases.filter(c => c.status === 'OUT_FOR_DELIVERY');
  const totalJobs = impressionPickups.length + labPickups.length + outForDelivery.length;

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'DV';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>🚚 My Job Orders</div>
          {totalJobs > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--accent)', color: '#fff' }}>
              {totalJobs}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
            <div className="live-dot" /> Live
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
            {initials}
          </div>
          <button onClick={logout}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
            ⏻
          </button>
        </div>
      </div>

      <div className="content" style={{ flex: 1 }}>
        {/* Summary row */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#FFF7ED' }}>🛵</div>
            <div className="stat-label">Impression Pickups</div>
            <div className="stat-value" style={{ color: '#EA580C' }}>{impressionPickups.length}</div>
            <div className="stat-sub">Collect from clinic</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>📦</div>
            <div className="stat-label">Ready at Lab</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{labPickups.length}</div>
            <div className="stat-sub">Collect from lab</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>🚚</div>
            <div className="stat-label">Out for Delivery</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{outForDelivery.length}</div>
            <div className="stat-sub">Deliver to clinic</div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 15 }}>
            Loading your jobs…
          </div>
        ) : totalJobs === 0 ? (
          <div className="empty-state" style={{ paddingTop: 60 }}>
            <div className="empty-icon">✅</div>
            <div className="empty-title">All clear!</div>
            <p>No jobs assigned to you right now. Dispatch will notify you when a new job is ready.</p>
          </div>
        ) : (
          <>
            {/* Section 1: Lab Pickups (shown first — these need to leave the lab) */}
            {labPickups.length > 0 && (
              <Section
                title="Collect from Lab" icon="📦" color="var(--accent)"
                cases={labPickups} section="lab-pickup" onAction={(c, action) => setModal({ case: c, action })}
                emptyText="Nothing to collect from lab"
              />
            )}

            {/* Section 2: Out for Delivery */}
            {outForDelivery.length > 0 && (
              <Section
                title="Out for Delivery — Deliver to Clinic" icon="🚚" color="var(--green)"
                cases={outForDelivery} section="delivery" onAction={(c, action) => setModal({ case: c, action })}
                emptyText="No deliveries in progress"
              />
            )}

            {/* Section 3: Impression Pickups */}
            {impressionPickups.length > 0 && (
              <Section
                title="Impression Pickup — Collect from Clinic" icon="🛵" color="#EA580C"
                cases={impressionPickups} section="impression" onAction={(c, action) => setModal({ case: c, action })}
                emptyText="No impression pickups"
                emptyNote="Impression collection jobs appear here when dispatch assigns them."
              />
            )}
          </>
        )}
      </div>

      {/* Confirm modal */}
      {modal && (
        <ConfirmModal
          caseData={modal.case}
          action={modal.action}
          onConfirm={handleAction}
          onClose={() => setModal(null)}
          loading={processing}
        />
      )}
    </div>
  );
}
