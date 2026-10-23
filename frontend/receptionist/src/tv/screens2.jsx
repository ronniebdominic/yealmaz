// Ye-Almaz TV — the five operations screens added after the first six: dispatch segment, live department status
// board, HR attendance lists, delivery performance and lab scan counts. Real snapshot data only.
import { useEffect, useState } from 'react';
import Pager from './Pager';
import { useTv, usePager, useCountUp, fmtTime, durationShort } from './hooks';
import { HR_ROWS, ROWS_PER_PAGE } from './screenRules';

const Empty = ({ children }) => <div className="tv-empty">{children}</div>;
const initial = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');

function Count({ value, className = '' }) {
  const { intensity } = useTv();
  const shown = useCountUp(value, { intensity });
  return <span className={className}>{shown ?? '—'}</span>;
}

// ── Dispatch: the six stages of an order's journey in one segment
const DSP_TONE = { pendingPickup: 'blue', pickupInProgress: 'blue', outForDelivery: 'teal', readyForDispatch: 'green', readyForDelivery: 'amber', deliveredToday: 'done' };
export function DispatchScreen({ snap }) {
  const d = snap.dispatch;
  const open = Math.max(1, d.openTotal);
  return (
    <div className="tv-dsp">
      <div className="tv-dsp-row">
        {d.tiles.map((t, i) => (
          <div className="tv-dsp-cell" key={t.key}>
            <div className={`tv-dsp-tile ${DSP_TONE[t.key]}`}>
              <div className="tv-dsp-step">{i + 1}</div>
              <div className="tv-dsp-label">{t.label}</div>
              <Count className="tv-dsp-count" value={t.count} />
              <div className="tv-dsp-hint">{t.hint}</div>
              <div className="tv-dsp-old">{t.oldestMs != null && t.count > 0 ? `oldest ${durationShort(t.oldestMs)}` : ' '}</div>
            </div>
          </div>
        ))}
      </div>
      <section className="tv-panel tv-dsp-share">
        <h3>Open cases in the dispatch flow <b>{d.openTotal}</b></h3>
        <div className="tv-stack">
          {d.tiles.slice(0, 5).map(t => t.count > 0 && (
            <span key={t.key} className={`tv-stack-seg ${DSP_TONE[t.key]}`} style={{ flexGrow: t.count }} title={`${t.label}: ${t.count}`}>
              {t.count / open >= 0.07 ? t.count : ''}
            </span>
          ))}
          {d.openTotal === 0 && <span className="tv-stack-empty">Nothing waiting in dispatch right now.</span>}
        </div>
        <div className="tv-stack-legend">
          {d.tiles.slice(0, 5).map(t => <span key={t.key}><i className={DSP_TONE[t.key]} />{t.label}</span>)}
        </div>
      </section>
    </div>
  );
}

// ── Status board: scans per department today, reconciled to the day's totals
export function StatusBoardScreen({ snap }) {
  const sb = snap.statusBoard;
  const max = Math.max(1, ...sb.departments.map(x => x.scannedToday));
  const half = Math.ceil(sb.departments.length / 2);
  const cols = [sb.departments.slice(0, half), sb.departments.slice(half)];
  return (
    <div className="tv-sbd">
      <div className="tv-sbd-kpis">
        <div className="tv-kpi"><div className="tv-kpi-label">Scans today</div><div className="tv-kpi-value"><Count value={sb.totalScansToday} /></div><div className="tv-kpi-sub">sum of the departments below</div></div>
        <div className="tv-kpi blue"><div className="tv-kpi-label">Cases in operation today</div><div className="tv-kpi-value"><Count value={sb.casesInOperationToday} /></div><div className="tv-kpi-sub">distinct cases scanned</div></div>
        <div className="tv-kpi teal"><div className="tv-kpi-label">In departments now</div><div className="tv-kpi-value"><Count value={sb.inDepartmentsNow} /></div><div className="tv-kpi-sub">each case counted once</div></div>
      </div>
      <div className="tv-sbd-cols">
        {cols.map((list, ci) => (
          <section className="tv-panel tv-sbd-col" key={ci}>
            {list.map(d => (
              <div className="tv-sbd-row" key={d.code}>
                <span className="tv-bar-name">{d.label}</span>
                <span className="tv-bar-track"><span className="tv-bar-fill" style={{ width: `${(d.scannedToday / max) * 100}%` }} /></span>
                <span className="tv-sbd-num"><b>{d.scannedToday}</b><small>scanned</small></span>
                <span className="tv-sbd-now"><b>{d.inDepartmentNow}</b><small>now</small></span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

// ── HR: today's attendance lists
const HR_COLS = [
  { key: 'present', title: 'Present', tone: 'green' },
  { key: 'late', title: 'Late', tone: 'amber' },
  { key: 'absent', title: 'Absent', tone: 'red' },
  { key: 'onLeave', title: 'On leave', tone: 'purple' },
];
export function HrScreen({ snap, seconds }) {
  const hr = snap.hr;
  const pages = Math.max(1, ...HR_COLS.map(c => Math.ceil(hr[c.key].length / HR_ROWS)));
  const page = usePager(pages, seconds);
  return (
    <div className="tv-hr">
      <div className="tv-hr-cols">
        {HR_COLS.map(c => {
          const list = hr[c.key];
          const slice = list.slice(page * HR_ROWS, page * HR_ROWS + HR_ROWS);
          return (
            <section key={c.key} className={`tv-hr-col ${c.tone}`}>
              <h3><span className="tv-hr-title">{c.title}{c.key === 'present' ? <small>incl. late</small> : null}</span><span><Count value={list.length} /></span></h3>
              {list.length === 0 ? <div className="tv-hr-none">{c.key === 'absent' && hr.notYetIn > 0 ? `${hr.notYetIn} not in yet (shift not started)` : 'No one'}</div> : slice.map(p => (
                <div className="tv-hr-row" key={p.id}>
                  <span className="tv-avatar">{initial(p.name)}</span>
                  <span className="tv-hr-who"><b>{p.name}</b><small>{[p.title, p.department && p.department !== p.title ? p.department : ''].filter(Boolean).join(' · ') || ' '}</small></span>
                  <span className="tv-hr-meta">
                    {c.key === 'present' && p.clockIn ? fmtTime(new Date(p.clockIn)).slice(0, 5) : null}
                    {c.key === 'late' ? `+${p.lateMinutes} min` : null}
                    {c.key === 'onLeave' && p.half ? 'half day' : null}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <Pager page={page} pages={pages} />
    </div>
  );
}

// ── Delivery performance today
export function DeliveryScreen({ snap, seconds }) {
  const del = snap.delivery;
  const pages = Math.max(1, Math.ceil(del.drivers.length / ROWS_PER_PAGE));
  const page = usePager(pages, seconds);
  const slice = del.drivers.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const max = Math.max(1, ...del.drivers.map(d => d.completedToday));
  const [armed, setArmed] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setArmed(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="tv-del">
      <div className="tv-del-kpis">
        <div className="tv-kpi"><div className="tv-kpi-label">Pick-ups today</div><div className="tv-kpi-value"><Count value={del.totals.pickupsToday} /></div></div>
        <div className="tv-kpi good"><div className="tv-kpi-label">Deliveries today</div><div className="tv-kpi-value"><Count value={del.totals.deliveriesToday} /></div></div>
        <div className="tv-kpi teal"><div className="tv-kpi-label">On the road now</div><div className="tv-kpi-value"><Count value={del.totals.activeNow} /></div></div>
      </div>
      {del.drivers.length === 0 ? <Empty>No delivery drivers to show.</Empty> : (
        <div className="tv-list">
          {slice.map(d => (
            <div className="tv-list-row" key={d.id}>
              <span className="tv-avatar big">{initial(d.name)}</span>
              <span className="tv-list-who"><b>{d.name}</b><small>{d.lastActiveAt ? `last activity ${fmtTime(new Date(d.lastActiveAt)).slice(0, 5)}` : 'no activity yet today'}</small></span>
              <span className="tv-bar-track tall"><span className="tv-bar-fill" style={{ width: armed ? `${(d.completedToday / max) * 100}%` : '0%' }} /></span>
              <span className="tv-list-metric"><label>Pick-ups</label><b>{d.pickupsToday}</b></span>
              <span className="tv-list-metric"><label>Deliveries</label><b>{d.deliveriesToday}</b></span>
              <span className="tv-list-metric"><label>Picking up</label><b>{d.pickingUpNow}</b></span>
              <span className="tv-list-metric"><label>Out now</label><b>{d.outNow}</b></span>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} pages={pages} />
    </div>
  );
}

// ── Lab performance by scan count, in relation to the cases in process
export function LabScansScreen({ snap, seconds }) {
  const ls = snap.labScans;
  const pages = Math.max(1, Math.ceil(ls.rows.length / ROWS_PER_PAGE));
  const page = usePager(pages, seconds);
  const slice = ls.rows.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const max = Math.max(1, ...ls.rows.map(r => r.scansToday));
  const [armed, setArmed] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setArmed(true)); return () => cancelAnimationFrame(id); }, []);
  const pct = (v) => (v == null ? <span className="tv-na">—</span> : `${v.toFixed(1)}%`);
  return (
    <div className="tv-del">
      <div className="tv-del-kpis">
        <div className="tv-kpi"><div className="tv-kpi-label">Scans today</div><div className="tv-kpi-value"><Count value={ls.totalScans} /></div></div>
        <div className="tv-kpi blue"><div className="tv-kpi-label">Cases in process</div><div className="tv-kpi-value"><Count value={ls.casesInProcess} /></div></div>
        <div className="tv-kpi-note">Counts of scans only. “vs in process” = a technician’s scans today ÷ cases in process. The scoring formula can be refined later.</div>
      </div>
      {ls.rows.length === 0 ? <Empty>No lab technicians to show.</Empty> : (
        <div className="tv-list">
          {slice.map(r => (
            <div className="tv-list-row lab" key={r.id}>
              <span className="tv-avatar big">{initial(r.name)}</span>
              <span className="tv-list-who"><b>{r.name}</b><small>{r.department || 'no scans yet'}</small></span>
              <span className="tv-bar-track tall"><span className="tv-bar-fill" style={{ width: armed ? `${(r.scansToday / max) * 100}%` : '0%' }} /></span>
              <span className="tv-list-metric"><label>Scans</label><b>{r.scansToday}</b></span>
              <span className="tv-list-metric"><label>Share of today</label><b>{pct(r.shareOfScansPct)}</b></span>
              <span className="tv-list-metric"><label>vs in process</label><b>{pct(r.vsInProcessPct)}</b></span>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} pages={pages} />
    </div>
  );
}
