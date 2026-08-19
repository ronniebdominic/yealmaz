// Ye-Almaz — Reception attendance kiosk
//
// A shared tablet at reception for staff who have no smartphone and so
// cannot use the geofenced self-service clock-in (janitors, kitchen, and
// anyone else without a device). Without this they have no way to record
// attendance at all, and would show as "Absent / No Record" every day.
//
// Runs UNAUTHENTICATED by design — there is no user session on this device.
// It is authorised by ATTENDANCE_KIOSK_SECRET, entered once during setup
// and kept in localStorage, plus each employee's own PIN. It deliberately
// does NOT use src/api.js: that client attaches the logged-in user's JWT
// and force-logs-out on any 401, both of which are wrong here.
//
// Every punch is photographed and the photo stored on this tablet only
// (see utils/kioskPhotos.js) — a PIN proves knowledge, not identity, and
// the photo is what lets HR resolve a disputed punch.
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { MdSearch, MdBackspace, MdLogin, MdLogout, MdCheckCircle, MdError, MdPhotoCamera, MdPhotoCameraBack } from 'react-icons/md';
import { savePhoto, prunePhotos, captureFrame } from '../utils/kioskPhotos';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SECRET_KEY = 'ya_kiosk_secret';
const IDLE_RESET_MS = 5000;

const kiosk = axios.create({ baseURL: API_URL });

function useKioskSecret() {
  const [secret, setSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '');
  const save = (s) => { localStorage.setItem(SECRET_KEY, s); setSecret(s); };
  const clear = () => { localStorage.removeItem(SECRET_KEY); setSecret(''); };
  return [secret, save, clear];
}

const headers = (secret) => ({ 'x-attendance-kiosk-secret': secret, 'x-attendance-kiosk-id': 'reception-kiosk' });

// ── Setup: one-time provisioning by a manager ──────────────
function Setup({ onSaved }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await kiosk.get('/attendance/kiosk/roster', { headers: headers(value.trim()) });
      onSaved(value.trim());
    } catch (err) {
      setError(err.response?.status === 401 ? 'That kiosk key was not accepted.' : 'Could not reach the server.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-1)', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ padding: 28, width: 'min(460px, 92vw)' }}>
        <h2 style={{ margin: '0 0 6px' }}>Kiosk setup</h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5 }}>
          Enter the kiosk key once to provision this tablet. It is stored on this device only.
          A manager should do this — staff never need it.
        </p>
        <input
          autoFocus type="password" value={value} onChange={e => setValue(e.target.value)}
          placeholder="Kiosk key"
          style={{ width: '100%', padding: '14px 16px', fontSize: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
        />
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <button className="btn btn-primary" disabled={busy || !value.trim()} style={{ width: '100%', marginTop: 16, padding: 14, fontSize: 16 }}>
          {busy ? 'Checking…' : 'Activate kiosk'}
        </button>
      </form>
    </div>
  );
}

// ── Big numeric PIN pad ────────────────────────────────────
function PinPad({ value, onChange, onSubmit, disabled }) {
  const press = (d) => { if (value.length < 6) onChange(value + d); };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 12, margin: '0 0 20px', minHeight: 26,
      }}>
        {Array.from({ length: Math.max(4, value.length) }).map((_, i) => (
          <span key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < value.length ? 'var(--accent, #6366f1)' : 'var(--border)',
            transition: 'background .12s',
          }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {keys.map(k => (
          <button
            key={k} type="button" disabled={disabled}
            onClick={() => k === 'clear' ? onChange('') : k === 'back' ? onChange(value.slice(0, -1)) : press(k)}
            style={{
              padding: '22px 0', fontSize: k.length === 1 ? 26 : 15, fontWeight: 600,
              borderRadius: 12, border: '1px solid var(--border)',
              background: k.length === 1 ? 'var(--bg-2)' : 'transparent',
              color: 'var(--text-1)', cursor: 'pointer',
            }}
          >
            {k === 'back' ? <MdBackspace size={20} /> : k === 'clear' ? 'Clear' : k}
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary" onClick={onSubmit} disabled={disabled || value.length < 4}
        style={{ width: '100%', marginTop: 14, padding: 16, fontSize: 17 }}
      >
        Confirm
      </button>
    </div>
  );
}

export default function AttendanceKiosk() {
  const [secret, saveSecret, clearSecret] = useKioskSecret();
  const [staff, setStaff] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [suggested, setSuggested] = useState('CLOCK_IN');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, name, type, photo }
  const [cameraOk, setCameraOk] = useState(null); // null = unknown, false = unavailable
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Camera runs continuously while the kiosk is up so a capture is instant
  // at the moment of the punch. Failure is non-fatal: attendance matters
  // more than the photo, so a denied or missing camera degrades to
  // punch-without-photo rather than blocking anyone from clocking in.
  useEffect(() => {
    if (!secret) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraOk(true);
      })
      .catch(() => { if (!cancelled) setCameraOk(false); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [secret]);

  const loadRoster = async () => {
    try {
      const { data } = await kiosk.get('/attendance/kiosk/roster', { headers: headers(secret) });
      setStaff(data.staff || []);
    } catch (err) {
      if (err.response?.status === 401) clearSecret();
    }
  };
  useEffect(() => { if (secret) loadRoster(); /* eslint-disable-next-line */ }, [secret]);

  const reset = () => { setSelected(null); setPin(''); setResult(null); setQuery(''); };

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(reset, IDLE_RESET_MS);
    return () => clearTimeout(t);
  }, [result]);

  const pick = async (person) => {
    setSelected(person); setPin(''); setResult(null);
    try {
      const { data } = await kiosk.get(`/attendance/kiosk/status/${person.employeeCode}`, { headers: headers(secret) });
      setSuggested(data.suggested || 'CLOCK_IN');
    } catch { setSuggested('CLOCK_IN'); }
  };

  const submit = async (type) => {
    if (!selected || pin.length < 4) return;
    setBusy(true);
    // Captured BEFORE the request so the frame is the person standing
    // there as they confirm, not whoever has wandered up a second later.
    const blob = cameraOk && videoRef.current ? await captureFrame(videoRef.current) : null;
    try {
      const { data } = await kiosk.post('/attendance/kiosk/clock',
        { employeeCode: selected.employeeCode, pin, type },
        { headers: headers(secret) });

      if (blob && data.eventId) {
        try {
          await savePhoto({
            eventId: data.eventId, employeeCode: data.employeeCode, name: data.name,
            type: data.type, timestamp: data.timestamp, blob,
          });
          prunePhotos().catch(() => {});
        } catch { /* storage full or blocked — the punch itself still counted */ }
      }

      setResult({
        ok: true, name: data.name, type: data.type,
        message: data.type === 'CLOCK_IN' ? 'Clocked in' : 'Clocked out',
        photo: blob ? URL.createObjectURL(blob) : null,
      });
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.error || 'Could not record that. Please try again.' });
      setPin('');
    } finally { setBusy(false); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(s => s.name.toLowerCase().includes(q) || (s.employeeCode || '').toLowerCase().includes(q));
  }, [staff, query]);

  if (!secret) return <Setup onSaved={saveSecret} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-1)', padding: 'clamp(12px, 3vw, 28px)' }}>
      {/* Hidden capture source. Kept mounted so the stream is warm. */}
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 28px)' }}>Attendance</h1>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: cameraOk === false ? 'var(--amber)' : 'var(--text-3)' }}>
          {cameraOk === false ? <MdPhotoCameraBack size={16} /> : <MdPhotoCamera size={16} />}
          {cameraOk === false ? 'Camera unavailable — punches still recorded' : 'Photo on'}
        </div>
      </div>

      {/* ── Result ── */}
      {result && (
        <div className="card" style={{ padding: 24, textAlign: 'center', borderLeft: `4px solid ${result.ok ? 'var(--green)' : 'var(--red)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            {result.ok ? <MdCheckCircle size={54} style={{ color: 'var(--green)' }} /> : <MdError size={54} style={{ color: 'var(--red)' }} />}
          </div>
          {result.ok && <div style={{ fontSize: 26, fontWeight: 700 }}>{result.name}</div>}
          <div style={{ fontSize: 19, marginTop: 6 }}>{result.message}</div>
          {result.ok && <div style={{ color: 'var(--text-3)', marginTop: 4 }}>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>}
          {result.photo && <img src={result.photo} alt="" style={{ marginTop: 14, width: 108, borderRadius: 10, opacity: 0.9 }} />}
          <button className="btn btn-ghost" onClick={reset} style={{ marginTop: 16 }}>Done</button>
        </div>
      )}

      {/* ── PIN entry ── */}
      {!result && selected && (
        <div className="card" style={{ padding: 'clamp(16px, 3vw, 26px)', maxWidth: 420, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{selected.name}</div>
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{selected.position || selected.employeeCode}</div>
          </div>
          <PinPad value={pin} onChange={setPin} disabled={busy} onSubmit={() => submit(suggested)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1, padding: 12 }} disabled={busy || pin.length < 4}
              onClick={() => submit(suggested === 'CLOCK_IN' ? 'CLOCK_OUT' : 'CLOCK_IN')}>
              {suggested === 'CLOCK_IN' ? <><MdLogout size={16} /> Clock out instead</> : <><MdLogin size={16} /> Clock in instead</>}
            </button>
          </div>
          <button className="btn btn-ghost" onClick={reset} style={{ width: '100%', marginTop: 8 }}>Cancel</button>
        </div>
      )}

      {/* ── Picker ── */}
      {!result && !selected && (
        <>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <MdSearch size={20} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your name"
              style={{ width: '100%', padding: '14px 14px 14px 44px', fontSize: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {filtered.map(s => (
              <button
                key={s.employeeCode} onClick={() => s.hasPin && pick(s)} disabled={!s.hasPin}
                title={s.hasPin ? '' : 'No PIN set — ask HR'}
                style={{
                  padding: '18px 14px', borderRadius: 12, textAlign: 'left', cursor: s.hasPin ? 'pointer' : 'not-allowed',
                  border: '1px solid var(--border)', background: 'var(--bg-2)', opacity: s.hasPin ? 1 : 0.4, color: 'var(--text-1)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {s.hasPin ? (s.position || s.employeeCode) : 'No PIN set'}
                </div>
              </button>
            ))}
            {!filtered.length && <div className="empty-state" style={{ gridColumn: '1 / -1' }}>No one matches that name</div>}
          </div>
        </>
      )}
    </div>
  );
}
