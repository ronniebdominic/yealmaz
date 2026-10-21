// Ye-Almaz TV — the six screens. Every number comes from the backend snapshot; nothing here invents data.
import { useEffect, useMemo, useState } from 'react';
import { useTv, useCountUp, elapsed, ago, durationShort, STATUS_META, EVENT_LABEL, prettyStage } from './hooks';

import { PERF_PER_PAGE } from './screenRules';

// Rotates through pages while the screen is mounted; the interval dies with the screen.
function usePager(pages, totalSeconds) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return undefined;
    const id = setInterval(() => setPage(p => (p + 1) % pages), (totalSeconds * 1000) / pages);
    return () => clearInterval(id);
  }, [pages, totalSeconds]);
  return Math.min(page, pages - 1);
}

const Pager = ({ page, pages }) => pages > 1 ? (
  <div className="tv-pager" aria-label={`Page ${page + 1} of ${pages}`}>
    {Array.from({ length: pages }, (_, i) => <span key={i} className={i === page ? 'on' : ''} />)}
  </div>
) : null;

const Kpi = ({ label, value, sub, tone = '' }) => {
  const { intensity } = useTv();
  const shown = useCountUp(value, { intensity });
  return (
    <div className={`tv-kpi ${tone}`}>
      <div className="tv-kpi-label">{label}</div>
      <div className="tv-kpi-value">{shown ?? '—'}</div>
      {sub ? <div className="tv-kpi-sub">{sub}</div> : null}
    </div>
  );
};

const Empty = ({ children }) => <div className="tv-empty">{children}</div>;

// ── 1. Command Center ────────────────────────────────────
export function CommandScreen({ snap }) {
  const { state } = useTv();
  const k = snap.kpis;
  const depts = [...snap.pipeline.departments].filter(d => d.inDepartment > 0).sort((a, b) => b.inDepartment - a.inDepartment).slice(0, 7);
  const max = Math.max(1, ...depts.map(d => d.inDepartment));
  return (
    <div className="tv-grid-command">
      <div className="tv-kpis">
        <Kpi label="Active cases in lab" value={k.inLaboratory} />
        <Kpi label="Completed today" value={k.completedToday} tone="good" sub="passed QC" />
        <Kpi label="Employees working" value={k.employeesWorking} tone="teal" sub={`of ${k.employeesOnDuty} on duty`} />
        <Kpi label="Awaiting processing" value={k.awaitingProcessing} tone="blue" />
        <Kpi label="Delayed" value={k.delayed} tone={k.delayed ? 'warn' : ''} sub={k.approachingDeadline ? `${k.approachingDeadline} near deadline` : undefined} />
        <Kpi label="Received today" value={k.receivedToday} />
      </div>
      <section className="tv-panel">
        <h3>Department workload</h3>
        {depts.length === 0 ? <Empty>No cases in the laboratory departments right now.</Empty> : depts.map(d => (
          <div className="tv-bar-row" key={d.code}>
            <span className="tv-bar-name">{d.label}</span>
            <span className="tv-bar-track"><span className={`tv-bar-fill ${d.bottleneck ? 'warn' : ''}`} style={{ width: `${(d.inDepartment / max) * 100}%` }} /></span>
            <span className="tv-bar-num">{d.inDepartment}</span>
          </div>
        ))}
      </section>
      <section className="tv-panel">
        <h3>Production activity</h3>
        {state.feed.filter(e => e.type !== 'ATTENDANCE_CHANGED').length === 0
          ? <Empty>Waiting for the next movement on the lab floor.</Empty>
          : state.feed.filter(e => e.type !== 'ATTENDANCE_CHANGED').slice(0, 6).map(e => (
            <div className="tv-feed-row" key={e.seq}>
              <b>{e.caseNumber || 'Case'}</b> {EVENT_LABEL[e.type] || ''} {e.type === 'STAGE_ENTERED' || e.type === 'STATUS_CHANGED' ? prettyStage(e.stage) : ''}
              {e.actor ? <span className="tv-dim"> · {e.actor}</span> : null}
            </div>
          ))}
      </section>
    </div>
  );
}

// ── 2. Employee Wall ─────────────────────────────────────
function EmployeeCard({ e, now, hot }) {
  const meta = STATUS_META[e.status] || STATUS_META.AVAILABLE;
  const c = e.currentCase;
  return (
    <article className={`tv-emp ${meta.cls} ${hot ? 'hot' : ''}`}>
      <header>
        <h4>{e.name}</h4>
        <span className={`tv-pill ${meta.cls}`}>{meta.label}</span>
      </header>
      <div className="tv-emp-sub">
        <span className="tv-avatar">{e.initials}</span>
        <span>{e.department || 'Department not set'}</span>
      </div>
      {c ? (
        <div className="tv-emp-case">
          <div className="tv-case-id">{c.caseNumber || 'Case'}</div>
          <div className="tv-case-stage">{c.stageLabel}{c.workType ? ` · ${c.workType}` : ''}</div>
          <div className="tv-case-time">{elapsed(c.since, now)}<small> at this stage</small></div>
        </div>
      ) : (
        <div className="tv-emp-case none">{e.status === 'OFF_DUTY' ? 'Not clocked in' : e.status === 'ON_BREAK' ? 'On break' : 'No active case'}</div>
      )}
      <footer>
        <span>Done today <b>{e.completedToday}</b></span>
        <span>{e.otherAssigned > 0 ? <>+{e.otherAssigned} assigned</> : <span className="tv-dim">no queue</span>}</span>
      </footer>
    </article>
  );
}

export function EmployeesScreen({ snap, cfg, seconds }) {
  const { now, state } = useTv();
  const per = cfg.employeesPerPage;
  const pages = Math.max(1, Math.ceil(snap.employees.length / per));
  const page = usePager(pages, seconds);
  const slice = snap.employees.slice(page * per, page * per + per);
  const waiting = snap.critical.unassigned.filter(c => c.awaitingAssignment);
  const cols = per <= 6 ? 3 : 4;
  const rows = Math.ceil(per / cols);
  return (
    <div className="tv-wall">
      {snap.employees.length === 0 ? <Empty>No lab employees to show.</Empty> : (
        <div className={`tv-emp-grid ${rows >= 3 ? 'dense' : ''}`} key={page} style={{ '--cols': cols, '--rows': rows }}>
          {slice.map((e, i) => <div className="tv-stagger" style={{ '--i': i }} key={e.id}><EmployeeCard e={e} now={now} hot={(state.highlightEmployees[e.id] || 0) > now} /></div>)}
        </div>
      )}
      <div className="tv-wall-foot">
        <Pager page={page} pages={pages} />
        {waiting.length > 0 && (
          <div className="tv-await">
            <b>AWAITING ASSIGNMENT</b>
            {waiting.slice(0, 5).map(c => <span key={c.caseNumber} className="tv-chip">{c.caseNumber} · {c.stageLabel}</span>)}
            {waiting.length > 5 ? <span className="tv-dim">+{waiting.length - 5} more</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 3. Performance Wall ──────────────────────────────────
const ROW_H = 92;
const NA = <span className="tv-na">Not enough data</span>;
const pct = (v) => (v == null ? NA : `${v}%`);

export function PerformanceScreen({ snap, seconds }) {
  const rows = useMemo(() => [
    ...snap.performance.ranked.map((p, i) => ({ ...p, rank: i + 1, ranked: true })),
    ...snap.performance.unranked.map(p => ({ ...p, rank: null, ranked: false })),
  ], [snap]);
  const pages = Math.max(1, Math.ceil(rows.length / PERF_PER_PAGE));
  const page = usePager(pages, seconds);
  const slice = rows.slice(page * PERF_PER_PAGE, page * PERF_PER_PAGE + PERF_PER_PAGE);
  const [armed, setArmed] = useState(false); // bars grow from 0 on first paint, then animate between values
  useEffect(() => { const id = requestAnimationFrame(() => setArmed(true)); return () => cancelAnimationFrame(id); }, []);
  const maxW = Math.max(1, ...rows.map(r => r.weightedPeriod));
  return (
    <div className="tv-perf">
      <div className="tv-perf-head">
        <span>Workload-adjusted completed work · last {snap.performance.periodDays} days</span>
        <span className="tv-dim">Ranked only where a department target is set. Quality, timeliness and workload are shown separately.</span>
      </div>
      {rows.length === 0 ? <Empty>No finished work in this period yet.</Empty> : (
        <div className="tv-perf-list" style={{ height: ROW_H * PERF_PER_PAGE }}>
          {slice.map((r, i) => {
            const w = r.ranked ? Math.min(150, r.metrics.targetPct) / 1.5 : (r.weightedPeriod / maxW) * 100;
            return (
              <div className={`tv-perf-row ${r.ranked ? '' : 'unranked'}`} key={r.id} style={{ transform: `translateY(${i * ROW_H}px)`, height: ROW_H - 10 }}>
                <div className="tv-rank">{r.ranked ? r.rank : '–'}</div>
                <div className="tv-perf-who"><b>{r.name}</b><small>{r.department || '—'}</small></div>
                <div className="tv-perf-bar">
                  <div className="tv-bar-track tall"><span className={`tv-bar-fill ${r.ranked ? '' : 'muted'}`} style={{ width: armed ? `${w}%` : '0%' }} /></div>
                  <small>{r.ranked ? `${r.metrics.targetPct}% of target` : 'No department target — not ranked'}</small>
                </div>
                <div className="tv-perf-metric"><label>Workload</label><b>{r.weightedPeriod}</b><small>{r.completedPeriod} cases</small></div>
                <div className="tv-perf-metric"><label>On time</label><b>{pct(r.metrics.onTimeRate)}</b></div>
                <div className="tv-perf-metric"><label>Quality</label><b>{pct(r.metrics.qualityRate)}</b></div>
                <div className="tv-perf-metric"><label>Trend</label><b>{r.metrics.improvementPct == null ? NA : `${r.metrics.improvementPct > 0 ? '+' : ''}${r.metrics.improvementPct}%`}</b></div>
              </div>
            );
          })}
        </div>
      )}
      <Pager page={page} pages={pages} />
    </div>
  );
}

// ── 4. Production Pipeline ───────────────────────────────
export function PipelineScreen({ snap }) {
  const { state, now } = useTv();
  const recent = state.feed.filter(e => e.stage && now - new Date(e.at).getTime() < 10000).map(e => e.stage);
  const nodes = [
    { key: 'intake', label: 'Reception & intake', count: snap.pipeline.intake, plain: true },
    ...snap.pipeline.departments.filter(d => d.inDepartment > 0 || d.employeesOnDuty > 0),
    { key: 'dispatch', label: 'Dispatch', count: snap.pipeline.dispatch, plain: true },
  ];
  return (
    <div className="tv-pipeline">
      {nodes.map((n) => (
        <div className="tv-flow" key={n.key || n.code}>
          <div className={`tv-node ${n.bottleneck ? 'warn' : ''} ${n.stage && recent.includes(n.stage) ? 'pulse' : ''}`}>
            <div className="tv-node-name">{n.label}</div>
            <div className="tv-node-count">{n.plain ? n.count : n.inDepartment}</div>
            {!n.plain && (
              <div className="tv-node-meta">
                <span>{n.active} active · {n.waiting} waiting</span>
                <span>{n.employeesOnDuty} on duty</span>
                <span>{n.oldestWaitingMs != null ? `oldest ${durationShort(n.oldestWaitingMs)}` : '—'}</span>
                {n.delayed > 0 ? <span className="tv-warn">{n.delayed} delayed</span> : null}
              </div>
            )}
            {n.bottleneck ? <div className="tv-badge">BOTTLENECK</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 5. Critical Cases ────────────────────────────────────
const CRIT_COLUMNS = [
  { key: 'overdue', title: 'Overdue', tone: 'red' },
  { key: 'dueSoon', title: 'Approaching deadline', tone: 'amber' },
  { key: 'unassigned', title: 'Awaiting assignment', tone: 'amber' },
  { key: 'needsApproval', title: 'Needs approval', tone: 'purple' },
  { key: 'redoRemake', title: 'Redo / remake', tone: 'amber' },
  { key: 'blocked', title: 'Blocked / on hold', tone: 'red' },
];
export function CriticalScreen({ snap }) {
  const { now } = useTv();
  const total = CRIT_COLUMNS.reduce((s, c) => s + snap.critical[c.key].length, 0);
  return (
    <div className="tv-crit">
      {total === 0 && <div className="tv-allclear">Nothing needs attention right now.</div>}
      <div className="tv-crit-grid">
        {CRIT_COLUMNS.map(col => {
          const list = snap.critical[col.key];
          return (
            <section key={col.key} className={`tv-crit-col ${col.tone} ${list.length ? '' : 'quiet'}`}>
              <h3>{col.title}<span>{list.length}</span></h3>
              {list.slice(0, 5).map(c => (
                <div className="tv-crit-row" key={c.caseNumber + col.key}>
                  <b>{c.caseNumber || 'Case'}</b>
                  <span className="tv-crit-stage">{c.stageLabel}</span>
                  <span className="tv-dim">{c.owner || (c.awaitingAssignment ? 'AWAITING ASSIGNMENT' : '')}{c.owner || c.awaitingAssignment ? ' · ' : ''}{ago(c.since, now)}</span>
                </div>
              ))}
              {list.length > 5 ? <div className="tv-dim tv-more">+{list.length - 5} more</div> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ── 6. Team Achievements ─────────────────────────────────
export function AchievementsScreen({ snap }) {
  const { intensity } = useTv();
  const a = snap.achievements;
  const total = useCountUp(a.completedToday, { intensity });
  const hasMilestone = a.milestones.length > 0;
  return (
    <div className="tv-ach">
      {hasMilestone && intensity === 'normal' && <div className="tv-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
      <section className="tv-ach-hero">
        <div className="tv-kpi-label">Cases completed today</div>
        <div className="tv-ach-number">{total}</div>
        {a.topDepartment ? <div className="tv-ach-sub">Top department: <b>{a.topDepartment.label}</b> · {a.topDepartment.completed} finished</div> : <div className="tv-ach-sub tv-dim">No department has finished work yet today.</div>}
      </section>
      <div className="tv-ach-cols">
        <section className="tv-panel">
          <h3>Best quality</h3>
          {a.bestQuality ? <div className="tv-spot"><b>{a.bestQuality.name}</b><span>{a.bestQuality.department}</span><em>{a.bestQuality.qualityRate}% without remake · {a.bestQuality.sampleCases} cases</em></div> : <Empty>Not enough data yet.</Empty>}
        </section>
        <section className="tv-panel">
          <h3>Milestones today</h3>
          {a.milestones.length ? a.milestones.map(m => <div className="tv-spot" key={m.name}><b>{m.name}</b><span>{m.department}</span><em>{m.completedToday} cases finished — {m.milestone}+ milestone</em></div>) : <Empty>No milestone reached yet.</Empty>}
        </section>
        <section className="tv-panel">
          <h3>Improving this week</h3>
          {a.improvers.length ? a.improvers.map(m => <div className="tv-spot" key={m.name}><b>{m.name}</b><span>{m.department}</span><em>+{m.improvementPct}% vs previous period</em></div>) : <Empty>Not enough data yet.</Empty>}
        </section>
        {a.recognitions.length > 0 && (
          <section className="tv-panel">
            <h3>Recognition</h3>
            {a.recognitions.map((r, i) => <div className="tv-spot" key={i}><b>{r.text}</b></div>)}
          </section>
        )}
      </div>
    </div>
  );
}
