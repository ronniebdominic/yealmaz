// Ye-Almaz — Lab Performance (per-technician scan activity)
import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import toast from 'react-hot-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MdBadge, MdBiotech, MdInventory2, MdSchedule, MdCampaign, MdExpandLess, MdExpandMore, MdSend } from 'react-icons/md';
import { todayLocal, toLocalDateString } from '../utils/date';

// Same lookup used on the Users page for a lab tech's department SCOPE
// (User.departments — what they're assigned to), distinct from the
// department BREAKDOWN the backend returns (what they've actually scanned,
// already labeled server-side from CaseStage.scannedBy's short-code).
const DEPARTMENTS = [
  { code: 'PLASTER',      label: 'Plaster Department'   },
  { code: 'MARGIN',       label: 'Margin Department'    },
  { code: 'SCANNING',     label: 'Scanning'             },
  { code: 'DESIGNING',    label: 'Designing'            },
  { code: 'MILLING',      label: 'Milling / Sintering'  },
  { code: 'RESIN_PRINT',  label: 'Resin 3D Printing'    },
  { code: 'METAL_PRINT',  label: 'Metal 3D Printing'    },
  { code: 'METAL_FINISH', label: 'Metal Finishing'      },
  { code: 'OPAQUE',       label: 'Opaque Application'   },
  { code: 'CERAMIC',      label: 'Ceramic Layering'     },
  { code: 'ZIRCONIA',     label: 'Zirconia Fitting'     },
  { code: 'GLAZING',      label: 'Glazing'              },
  { code: 'THERMO',       label: 'Thermo Press'         },
  { code: 'TRIMMING',     label: 'Trimming'             },
  { code: 'QC',           label: 'Quality Control'      },
];
const DEPT_LABEL = Object.fromEntries(DEPARTMENTS.map(d => [d.code, d.label]));

const LAB_PURPLE = '#7C3AED';
const LAB_PURPLE_DIM = 'rgba(124,58,237,0.1)';

const Stat = ({ label, value, info }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.25, minHeight: '2.5em', marginBottom: 3 }}>
      <span>{label}</span>
      {info && (
        <span className="info-icon-wrap" tabIndex={0} style={{ flexShrink: 0, marginTop: 1 }}>
          <MdSchedule size={11} style={{ opacity: 0.55 }} />
          <span className="info-tooltip">{info}</span>
        </span>
      )}
    </div>
    <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 'auto' }}>{value}</div>
  </div>
);

// Compact daily-activity sparkline — buckets the selected range into at
// most ~24 bars (summed) so a year-long range still reads as a shape
// rather than 365 hairline bars. Each bar carries a native title tooltip
// (exact dates + count) since this is a small, card-embedded chart, not a
// primary analytics view.
function ActivitySparkline({ dailyCounts, from, to }) {
  const start = new Date(from);
  const end = new Date(to);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const bucketCount = Math.min(totalDays, 24);
  const bucketSize = Math.ceil(totalDays / bucketCount);

  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const bStart = new Date(start); bStart.setDate(bStart.getDate() + i * bucketSize);
    const bEnd = new Date(start); bEnd.setDate(bEnd.getDate() + Math.min((i + 1) * bucketSize, totalDays) - 1);
    if (bStart > end) break;
    let sum = 0;
    for (let d = new Date(bStart); d <= bEnd && d <= end; d.setDate(d.getDate() + 1)) {
      sum += dailyCounts[toLocalDateString(d)] || 0;
    }
    buckets.push({ from: bStart, to: bEnd, count: sum });
  }
  const max = Math.max(1, ...buckets.map(b => b.count));
  const fmt = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34 }}>
      {buckets.map((b, i) => (
        <div
          key={i}
          title={`${fmt(b.from)}${b.to > b.from ? ` – ${fmt(b.to)}` : ''}: ${b.count} scan${b.count !== 1 ? 's' : ''}`}
          style={{
            flex: 1, minWidth: 3, borderRadius: '2px 2px 0 0',
            height: `${Math.max((b.count / max) * 100, b.count > 0 ? 10 : 3)}%`,
            background: i === buckets.length - 1 ? LAB_PURPLE : `${LAB_PURPLE}55`,
          }}
        />
      ))}
    </div>
  );
}

function TechCard({ tech, from, to }) {
  const deptScope = tech.departments?.length
    ? tech.departments.map(d => DEPT_LABEL[d] || d).join(', ')
    : 'Flexible — all departments';

  return (
    <div className="glass-card" style={{ padding: '16px 18px', opacity: tech.isActive ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: LAB_PURPLE, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {tech.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tech.name}{!tech.isActive && <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-3)' }}> · Inactive</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deptScope}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>
        <Stat label="Scans" value={tech.totalScans.toLocaleString('en-US')} info="Every department scan they performed in the selected range." />
        <Stat label="Cases" value={tech.uniqueCases.toLocaleString('en-US')} info="Distinct cases they touched — a case they scanned twice still counts once here." />
        <Stat label="Active Days" value={tech.activeDays} info="Calendar days with at least one scan in the selected range." />
        <Stat label="Avg / Day" value={tech.avgPerActiveDay} info="Total scans divided by active days — not by every day in the range, so time off doesn't drag it down." />
        <Stat label="Lab Share" value={tech.shareOfTotalPercent != null ? `${tech.shareOfTotalPercent}%` : '—'} info="Their scans as a share of every matched scan across the whole lab in the selected range." />
      </div>

      {tech.totalScans > 0 && (
        <>
          <ActivitySparkline dailyCounts={tech.dailyCounts} from={from} to={to} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
            {tech.departmentBreakdown.slice(0, 4).map(d => (
              <span key={d.code} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: LAB_PURPLE_DIM, color: LAB_PURPLE }}>
                {d.label} · {d.count}
              </span>
            ))}
            {tech.departmentBreakdown.length > 4 && (
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', padding: '2px 4px' }}>+{tech.departmentBreakdown.length - 4} more</span>
            )}
          </div>
        </>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        {tech.lastActiveAt
          ? `Last active ${new Date(tech.lastActiveAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : 'No scans in this range'}
      </div>
    </div>
  );
}

// ── Send Notification to Lab Techs ────────────────────────
// Admin's broadcast composer — targets every active lab tech, or one
// specific tech, via POST /notifications/broadcast. Lands as a real,
// listable, badge-counted notification on the recipient's Notifications
// tab (LabDashboard), pushed live over sockets and web-push.
function BroadcastPanel({ techs }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('ALL');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const send = useMutation({
    mutationFn: () => api.post('/notifications/broadcast', {
      title, message,
      target: target === 'ALL' ? 'ALL_LAB_TECHS' : { userId: target },
    }),
    onSuccess: (res) => {
      toast.success(`Sent to ${res.data.sentTo} lab tech${res.data.sentTo !== 1 ? 's' : ''}`);
      setTitle(''); setMessage('');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Could not send notification'),
  });

  const inputSt = { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit' };

  return (
    <div className="glass-card" style={{ marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px',
        background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-1)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MdCampaign size={17} color="#D97706" /> Send Notification to Lab Techs</span>
        {open ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, letterSpacing: 0.4 }}>SEND TO</div>
            <select value={target} onChange={e => setTarget(e.target.value)} style={inputSt}>
              <option value="ALL">All Active Lab Techs</option>
              {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, letterSpacing: 0.4 }}>TITLE</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Leave request approved" style={inputSt} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, letterSpacing: 0.4 }}>MESSAGE</div>
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Write the notification message…" style={{ ...inputSt, resize: 'vertical' }} />
          </div>
          <button
            onClick={() => send.mutate()}
            disabled={send.isPending || !title.trim() || !message.trim()}
            style={{
              alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
              borderRadius: 8, border: 'none', background: '#D97706', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: send.isPending ? 'not-allowed' : 'pointer', opacity: (!title.trim() || !message.trim()) ? 0.6 : 1,
            }}>
            <MdSend size={14} /> {send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminLabPerformance() {
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate] = useState(todayLocal());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'lab-performance', fromDate, toDate],
    queryFn: () => api.get('/dashboard/lab-performance', { params: { from: fromDate, to: toDate } }).then(r => r.data),
    staleTime: 60_000,
  });

  const techs = data?.techs ?? [];
  const inputStyle = { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)' };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdBadge className="mi" size={18} /> Lab Performance</div>
      </div>
      <div className="content">
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, maxWidth: 640 }}>
          Individual scan activity for every Lab Technician account — every time someone scans a case's QR code
          at their department, it's logged here. This reflects volume and activity only; a single case passes
          through many technicians before delivery, so no metric here attributes overall turnaround to one person.
        </p>

        <BroadcastPanel techs={techs} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>FROM</div>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>TO</div>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>
        ) : isError ? (
          <div style={{ textAlign: 'center', color: 'var(--red)', padding: 60 }}>Could not load lab performance.</div>
        ) : techs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon mi"><MdBiotech size={32} /></div>
            <div className="empty-title">No lab technician accounts yet</div>
            <p>Add one from Admin → Users to see their activity here.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {techs.map(t => <TechCard key={t.id} tech={t} from={fromDate} to={toDate} />)}
            </div>
            {data.unattributedScans > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
                <MdInventory2 size={13} />
                {data.unattributedScans.toLocaleString('en-US')} scan{data.unattributedScans !== 1 ? 's' : ''} in this period couldn't be matched to a current lab tech account (renamed or removed employee).
              </p>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
