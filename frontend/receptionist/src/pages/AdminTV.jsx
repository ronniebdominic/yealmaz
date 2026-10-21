// Ye-Almaz — Admin → TV Display: pair/revoke televisions and configure what /tv/live shows.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MdTv } from 'react-icons/md';
import AdminLayout from '../components/AdminLayout';
import api from '../api';

const SCREEN_TITLES = {
  command: 'Live Command Center', employees: 'Live Employee Wall', performance: 'Performance Board',
  pipeline: 'Live Case Pipeline', critical: 'Critical Cases', achievements: 'Team Achievements',
};
const field = { border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: .5, display: 'block', marginBottom: 5 };
const num = (v) => (v === '' || v == null ? '' : v);

function Section({ title, hint, children }) {
  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: hint ? 4 : 14 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>{hint}</div>}
      {children}
    </div>
  );
}

// { DESIGNING: 8 } <-> editable rows; blank = no value
function MapEditor({ departments, value, onChange, unit, hint }) {
  return (
    <div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{hint}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10 }}>
        {departments.map(d => (
          <div key={d.code}>
            <label style={label}>{d.label.toUpperCase()}</label>
            <input type="number" min="0" step="any" placeholder={unit} style={{ ...field, width: '100%' }}
              value={num(value?.[d.code])}
              onChange={e => { const next = { ...(value || {}) }; if (e.target.value === '') delete next[d.code]; else next[d.code] = Number(e.target.value); onChange(next); }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminTV() {
  const qc = useQueryClient();
  const { data: cfgData, isError: cfgError, error: cfgErr, refetch: refetchCfg } = useQuery({ queryKey: ['tv', 'config'], queryFn: () => api.get('/tv/config').then(r => r.data.config), retry: 1 });
  const { data: displays = [] } = useQuery({ queryKey: ['tv', 'displays'], queryFn: () => api.get('/tv/displays').then(r => r.data), refetchInterval: 15000 });
  const { data: departments = [] } = useQuery({ queryKey: ['scan', 'departments'], queryFn: () => api.get('/scan/departments').then(r => r.data.filter(d => !['RECEPTION', 'PAYMENT', 'DISPATCH'].includes(d.code))) });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data) });
  const labTechs = users.filter(u => u.role === 'LAB_TECH' && u.isActive && !u.isSharedAccount);

  // edits live in a draft layered over the saved settings
  const [draft, setDraft] = useState(null);
  const cfg = draft ?? cfgData;
  const setCfg = (v) => setDraft(prev => (typeof v === 'function' ? v(prev ?? cfgData) : v));
  const [pairLabel, setPairLabel] = useState('');
  const [pairing, setPairing] = useState(null); // { code, expiresAt } — shown once

  const save = useMutation({
    mutationFn: () => api.put('/tv/config', cfg).then(r => r.data.config),
    onSuccess: (saved) => { setCfg(saved); qc.invalidateQueries({ queryKey: ['tv', 'config'] }); toast.success('TV settings saved — screens update live'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Could not save'),
  });
  const createPairing = async () => {
    if (!pairLabel.trim()) { toast.error('Name the display, e.g. "Lab wall TV"'); return; }
    try {
      const { data } = await api.post('/tv/displays', { label: pairLabel.trim() });
      setPairing(data); setPairLabel('');
      qc.invalidateQueries({ queryKey: ['tv', 'displays'] });
    } catch (e) { toast.error(e.response?.data?.error || 'Could not create a pairing code'); }
  };
  const revoke = async (d) => {
    if (!window.confirm(`Revoke "${d.label}"? That screen stops showing data immediately.`)) return;
    try { await api.delete(`/tv/displays/${d.id}`); qc.invalidateQueries({ queryKey: ['tv', 'displays'] }); toast.success('Display revoked'); }
    catch { toast.error('Could not revoke'); }
  };

  if (!cfg) {
    const status = cfgErr?.response?.status;
    return (
      <AdminLayout>
        <div className="content">
          {cfgError ? (
            <div className="card" style={{ padding: 24, maxWidth: 640 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>TV settings could not be loaded</div>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 14 }}>
                {status === 404
                  ? 'The server does not have the TV feature yet — the backend is probably still deploying. Try again in a few minutes.'
                  : 'The server returned an error. If this is the first time, make sure the TV database tables have been created (2026-10-22-tv-command-center.sql).'}
              </p>
              <button className="btn btn-primary" onClick={() => refetchCfg()}>Try again</button>
            </div>
          ) : <p style={{ color: 'var(--text-3)' }}>Loading TV settings…</p>}
        </div>
      </AdminLayout>
    );
  }
  const up = (patch) => setCfg(c => ({ ...c, ...patch }));
  const upPerf = (patch) => setCfg(c => ({ ...c, performance: { ...c.performance, ...patch } }));
  const upAlerts = (patch) => setCfg(c => ({ ...c, alerts: { ...c.alerts, ...patch } }));
  const moveScreen = (i, d) => setCfg(c => { const s = [...c.screens]; const j = i + d; if (j < 0 || j >= s.length) return c; [s[i], s[j]] = [s[j], s[i]]; return { ...c, screens: s }; });
  const setScreen = (i, patch) => setCfg(c => ({ ...c, screens: c.screens.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const toggleIn = (list, id) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdTv className="mi" size={18} /> TV Display</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a className="btn" href="/tv/live?preview=1" target="_blank" rel="noreferrer">Preview</a>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>
      <div className="content" style={{ maxWidth: 1100 }}>

        <Section title="Paired displays" hint="A TV signs in with a one-time code and then holds its own revocable, read-only access. It can see operational data only — no patient, clinic or money information.">
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input style={{ ...field, flex: 1, minWidth: 220 }} placeholder='Name, e.g. "Lab wall TV"' value={pairLabel} onChange={e => setPairLabel(e.target.value)} />
            <button className="btn btn-primary" onClick={createPairing}>Create pairing code</button>
          </div>
          {pairing && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>On the TV open <b>/tv/live</b> and enter this code (valid 10 minutes, shown once):</div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 4, color: 'var(--blue)' }}>{pairing.code}</div>
            </div>
          )}
          {displays.length === 0 ? <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No displays yet.</div> : displays.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <div><b>{d.label}</b> <span style={{ marginLeft: 8, fontSize: 12, color: d.status === 'PAIRED' ? 'var(--green, #2E7D32)' : 'var(--text-3)' }}>{d.status}</span>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.lastSeenAt ? `last seen ${new Date(d.lastSeenAt).toLocaleString()}` : 'not connected yet'}</div></div>
              {d.status !== 'REVOKED' && <button className="btn" onClick={() => revoke(d)}>Revoke</button>}
            </div>
          ))}
        </Section>

        <Section title="Screens and rotation" hint="Order, which screens appear, and how long each stays. Long lists are paged so nobody is left off a screen.">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14 }}>
            <input type="checkbox" checked={cfg.autoRotate} onChange={e => up({ autoRotate: e.target.checked })} /> Rotate automatically
          </label>
          {cfg.screens.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" checked={s.enabled} onChange={e => setScreen(i, { enabled: e.target.checked })} aria-label={`Show ${SCREEN_TITLES[s.id]}`} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{SCREEN_TITLES[s.id]}</div>
              <input type="number" min="5" max="300" style={{ ...field, width: 80 }} value={s.seconds} onChange={e => setScreen(i, { seconds: Number(e.target.value) })} /> <span style={{ fontSize: 12, color: 'var(--text-3)' }}>sec</span>
              <button className="btn" onClick={() => moveScreen(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button className="btn" onClick={() => moveScreen(i, 1)} disabled={i === cfg.screens.length - 1} aria-label="Move down">↓</button>
            </div>
          ))}
        </Section>

        <Section title="Look and branding">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
            <div><label style={label}>SCREEN TITLE</label><input style={{ ...field, width: '100%' }} value={cfg.title} onChange={e => up({ title: e.target.value })} /></div>
            <div><label style={label}>ANIMATION INTENSITY</label>
              <select style={{ ...field, width: '100%' }} value={cfg.animationIntensity} onChange={e => up({ animationIntensity: e.target.value })}>
                <option value="normal">Full</option><option value="low">Gentle (fades only)</option><option value="off">Off (static)</option>
              </select></div>
            <div><label style={label}>TRANSITION SPEED (ms, 0 = instant)</label><input type="number" min="0" max="3000" style={{ ...field, width: '100%' }} value={cfg.transitionMs} onChange={e => up({ transitionMs: Number(e.target.value) })} /></div>
            <div><label style={label}>LOGO INTERSTITIAL EVERY N ROTATIONS (0 = never)</label><input type="number" min="0" max="50" style={{ ...field, width: '100%' }} value={cfg.interstitialEvery} onChange={e => up({ interstitialEvery: Number(e.target.value) })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={label}>INTERSTITIAL SLOGAN (optional — shown only if filled in; needs management approval)</label><input style={{ ...field, width: '100%' }} value={cfg.interstitialSlogan} onChange={e => up({ interstitialSlogan: e.target.value })} placeholder="Precision in Every Case" /></div>
          </div>
        </Section>

        <Section title="Who and what is shown" hint="Leave all departments unticked to show every department.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 16 }}>
            {departments.map(d => (
              <label key={d.code} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={cfg.visibleDepartments.includes(d.code)} onChange={() => up({ visibleDepartments: toggleIn(cfg.visibleDepartments, d.code) })} /> {d.label}
              </label>
            ))}
          </div>
          <label style={label}>EMPLOYEES HIDDEN FROM THE TV</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 14 }}>
            {labTechs.map(u => (
              <label key={u.id} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={cfg.hiddenEmployeeIds.includes(u.id)} onChange={() => up({ hiddenEmployeeIds: toggleIn(cfg.hiddenEmployeeIds, u.id) })} /> {u.name}
              </label>
            ))}
            {labTechs.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No lab employees found.</span>}
          </div>
          <label style={label}>EMPLOYEE CARDS PER PAGE</label>
          <input type="number" min="4" max="40" style={{ ...field, width: 100 }} value={cfg.employeesPerPage} onChange={e => up({ employeesPerPage: Number(e.target.value) })} />
        </Section>

        <Section title="Performance model" hint="Rankings appear only for departments that have a daily target. Without targets or enough finished cases the TV shows “Not enough data” — it never makes up a score.">
          <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
            <div><label style={label}>REPORTING PERIOD (days)</label><input type="number" min="1" max="14" style={{ ...field, width: 110 }} value={cfg.performance.periodDays} onChange={e => upPerf({ periodDays: Number(e.target.value) })} /></div>
            <div><label style={label}>MIN. FINISHED CASES FOR RATES</label><input type="number" min="1" max="200" style={{ ...field, width: 110 }} value={cfg.performance.minSample} onChange={e => upPerf({ minSample: Number(e.target.value) })} /></div>
          </div>
          <label style={label}>DAILY TARGET (workload units per day)</label>
          <MapEditor departments={departments} value={cfg.performance.dailyTargets} onChange={v => upPerf({ dailyTargets: v })} unit="no target" />
          <div style={{ height: 16 }} />
          <label style={label}>STAGE WEIGHT (default 1 — heavier stages count for more)</label>
          <MapEditor departments={departments} value={cfg.performance.stageWeights} onChange={v => upPerf({ stageWeights: v })} unit="1" />
          <div style={{ height: 16 }} />
          <label style={label}>EXPECTED TIME AT THE BENCH (minutes, for on-time rate)</label>
          <MapEditor departments={departments} value={cfg.performance.handlingTargetMinutes} onChange={v => upPerf({ handlingTargetMinutes: v })} unit="no target" />
        </Section>

        <Section title="Alert thresholds">
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={label}>DEADLINE WARNING (hours)</label><input type="number" min="1" style={{ ...field, width: 120 }} value={cfg.alerts.dueSoonHours} onChange={e => upAlerts({ dueSoonHours: Number(e.target.value) })} /></div>
            <div><label style={label}>BOTTLENECK (cases waiting)</label><input type="number" min="1" style={{ ...field, width: 120 }} value={cfg.alerts.bottleneckWaiting} onChange={e => upAlerts({ bottleneckWaiting: Number(e.target.value) })} /></div>
            <div><label style={label}>STALE IN DEPARTMENT (hours)</label><input type="number" min="1" style={{ ...field, width: 120 }} value={cfg.alerts.staleStageHours} onChange={e => upAlerts({ staleStageHours: Number(e.target.value) })} /></div>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.alerts.priorityMode} onChange={e => upAlerts({ priorityMode: e.target.checked })} /> Show Critical Cases when something new becomes critical</label>
          </div>
        </Section>

        <Section title="Recognition" hint="Milestones are awarded automatically from real finished cases. Add your own recognition lines below — they appear on the Team Achievements screen.">
          <label style={label}>DAILY MILESTONES (completed cases, comma separated)</label>
          <input style={{ ...field, width: 260, marginBottom: 14 }} value={cfg.achievements.milestones.join(', ')}
            onChange={e => setCfg(c => ({ ...c, achievements: { ...c.achievements, milestones: e.target.value.split(',').map(x => Number(x.trim())).filter(Boolean) } }))} />
          <label style={label}>RECOGNITION LINES (one per line)</label>
          <textarea rows={3} style={{ ...field, width: '100%' }} value={cfg.achievements.recognitions.map(r => r.text).join('\n')}
            onChange={e => setCfg(c => ({ ...c, achievements: { ...c.achievements, recognitions: e.target.value.split('\n').filter(t => t.trim()).map(text => ({ text })) } }))} />
        </Section>
      </div>
    </AdminLayout>
  );
}
