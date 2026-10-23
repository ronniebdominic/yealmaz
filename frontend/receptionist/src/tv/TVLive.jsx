// Ye-Almaz — /tv/live : the laboratory television. Read-only, full-screen, always on.
//
// Layout is a fixed 1920×1080 stage scaled to fit, so 1080p and 4K look identical and nothing scrolls.
// One store (tvClient) feeds every screen; screens mount only while visible, so the rotation never opens
// a second subscription and every timer a screen starts is cleaned up when it leaves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './tv.css';
import { createTvStore } from './tvClient';
import { TvContext, useStoreState, useTicker, effectiveIntensity, fmtTime, fmtDate, prettyStage } from './hooks';
import { SCREEN_META } from './registry';
import { screenSeconds } from './screenRules';

const TRANSITION_BY_TARGET = { command: 'logo', dispatch: 'slide', statusboard: 'zoom', labscans: 'stagger', hr: 'fade', delivery: 'slide', employees: 'slide', performance: 'stagger', pipeline: 'zoom', critical: 'blur', achievements: 'fade' };
const REQUIRES = { dispatch: 'dispatch', statusboard: 'statusBoard', hr: 'hr', delivery: 'delivery', labscans: 'labScans' };
const INTRO_MS = 2800;
const INTERSTITIAL_MS = 3200;

function Logo({ className = '' }) {
  return <img className={`tv-logo ${className}`} src="/logo.png" alt="Ye-Almaz" draggable="false" />;
}

function Pairing({ store, error }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [localMsg, setMsg] = useState('');
  const msg = localMsg || error;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { await store.pair(code.trim()); } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="tv-pairing">
      <Logo className="big" />
      <h1>YE-ALMAZ</h1>
      <p>LIVE PRODUCTION COMMAND CENTER</p>
      <form onSubmit={submit}>
        <label htmlFor="tv-code">Enter the pairing code from Admin → TV Display</label>
        <input id="tv-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoFocus autoComplete="off" />
        <button disabled={busy || code.trim().length < 6}>{busy ? 'Pairing…' : 'Pair this display'}</button>
        {msg ? <div className="tv-pair-error" role="alert">{msg}</div> : null}
      </form>
    </div>
  );
}

export default function TVLive() {
  const preview = useMemo(() => new URLSearchParams(window.location.search).has('preview'), []);
  const store = useMemo(() => createTvStore({ preview }), [preview]);
  const state = useStoreState(store);
  const now = useTicker(state.offsetMs);
  const intensity = effectiveIntensity(state.config?.animationIntensity);

  useEffect(() => { store.start(); return () => store.stop(); }, [store]);

  const cfg = state.config;
  const snap = state.snapshot;
  const screens = useMemo(() => {
    const on = (cfg?.screens || []).filter(s => s.enabled && SCREEN_META[s.id]);
    return on.length ? on : [{ id: 'command', enabled: true, seconds: 30 }];
  }, [cfg]);

  // ── rotation
  const [currentRaw, setCurrent] = useState(screens[0].id);
  const current = screens.some(s => s.id === currentRaw) ? currentRaw : screens[0].id; // a disabled screen falls back to the first
  const [leaving, setLeaving] = useState(null); // the screen on its way out during a transition
  const [paused, setPaused] = useState(false);
  const [interstitial, setInterstitial] = useState(false);
  const [intro, setIntro] = useState(true);
  const cycles = useRef(0);
  const transitionTimer = useRef(null);
  const pending = useRef(null);
  const currentRef = useRef(current);
  const goToRef = useRef(null);
  useEffect(() => { currentRef.current = current; }, [current]);

  useEffect(() => { const t = setTimeout(() => setIntro(false), INTRO_MS); return () => clearTimeout(t); }, []);

  const transitionMs = intensity === 'off' ? 0 : (cfg?.transitionMs ?? 800);
  const goTo = useCallback((id) => {
    if (id === currentRef.current) return;
    if (transitionTimer.current) { pending.current = id; return; } // one transition at a time
    if (transitionMs === 0) { setCurrent(id); return; }
    setLeaving(currentRef.current);
    setCurrent(id);
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null; setLeaving(null);
      if (pending.current) { const p = pending.current; pending.current = null; goToRef.current(p); }
    }, transitionMs);
  }, [transitionMs]);
  useEffect(() => { goToRef.current = goTo; }, [goTo]);
  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  const index = Math.max(0, screens.findIndex(s => s.id === current));
  const screenCfg = screens[index];
  const seconds = snap && cfg ? screenSeconds(screenCfg, snap, cfg) : screenCfg.seconds;
  const autoRotate = cfg ? cfg.autoRotate : true;

  useEffect(() => {
    if (!autoRotate || paused || intro || interstitial || screens.length < 2 || !snap) return undefined;
    const t = setTimeout(() => {
      const next = (index + 1) % screens.length;
      if (next === 0) {
        cycles.current += 1;
        if (cfg?.interstitialEvery > 0 && cycles.current % cfg.interstitialEvery === 0) { setInterstitial(true); return; }
      }
      goTo(screens[next].id);
    }, seconds * 1000);
    return () => clearTimeout(t);
  }, [autoRotate, paused, intro, interstitial, screens, index, seconds, snap, cfg, goTo]);

  useEffect(() => {
    if (!interstitial) return undefined;
    const t = setTimeout(() => { setInterstitial(false); goTo(screens[0].id); }, INTERSTITIAL_MS);
    return () => clearTimeout(t);
  }, [interstitial, screens, goTo]);

  // Optional priority mode: a newly critical case brings the Critical screen up once (it then rotates on).
  const lastAlert = useRef(0);
  useEffect(() => {
    if (cfg?.alerts?.priorityMode && state.criticalAlertAt && state.criticalAlertAt !== lastAlert.current) {
      lastAlert.current = state.criticalAlertAt;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to an external alert from the live store
      if (screens.some(s => s.id === 'critical')) goTo('critical');
    }
  }, [state.criticalAlertAt, cfg, screens, goTo]);

  // ── keyboard + controls
  const [controlsAt, setControlsAt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') goTo(screens[(index + 1) % screens.length].id);
      else if (e.key === 'ArrowLeft') goTo(screens[(index - 1 + screens.length) % screens.length].id);
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (/^[1-9]$/.test(e.key) && screens[+e.key - 1]) goTo(screens[+e.key - 1].id);
      setControlsAt(Date.now());
    };
    const onMove = () => setControlsAt(Date.now());
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMove); };
  }, [screens, index, goTo, toggleFullscreen]);
  const showControls = now - controlsAt < 4000 + 1000 && controlsAt > 0;

  // ── fit the 1920×1080 stage to the window; drift a few pixels to spare the panel from burn-in
  const [scale, setScale] = useState(1);
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    const d = setInterval(() => setDrift({ x: Math.round(Math.random() * 8 - 4), y: Math.round(Math.random() * 8 - 4) }), 60000);
    return () => { window.removeEventListener('resize', fit); clearInterval(d); };
  }, []);

  const ctx = useMemo(() => ({ store, state, now, intensity }), [store, state, now, intensity]);

  if (state.phase === 'pairing') return <div className="tv-root"><Pairing store={store} error={state.error} /></div>;

  const renderScreen = (id) => {
    const meta = SCREEN_META[id];
    if (!meta || !snap || !cfg) return <div className="tv-loading">Connecting to production data…</div>;
    // a newer TV talking to an older backend (during a deploy) shows a waiting message instead of crashing
    if (REQUIRES[id] && !snap[REQUIRES[id]]) return <div className="tv-loading">Waiting for the server to provide this screen…</div>;
    const sc = screens.find(s => s.id === id) || { id, seconds: 30 };
    const { Component } = meta;
    return <Component snap={snap} cfg={cfg} seconds={screenSeconds(sc, snap, cfg)} />;
  };
  const kind = intensity === 'low' ? 'fade' : TRANSITION_BY_TARGET[current] || 'fade';
  const live = state.conn === 'live';
  const celebrate = state.celebration && now - state.celebration.at < 2600 && intensity === 'normal';

  return (
    <TvContext.Provider value={ctx}>
      <div className={`tv-root int-${intensity}`}>
        <div className="tv-stage" style={{ transform: `translate(calc(-50% + ${drift.x}px), calc(-50% + ${drift.y}px)) scale(${scale})` }}>
          <header className="tv-header">
            <div className="tv-brand">
              <Logo className="head" />
              <div><div className="tv-brand-name">YE-ALMAZ</div><div className="tv-brand-sub">{cfg?.title || 'Live Production Command Center'}</div></div>
            </div>
            <div className="tv-screen-title">{SCREEN_META[current]?.title}</div>
            <div className="tv-clock">
              <div className={`tv-conn ${live ? 'live' : 'down'}`}><i /> {live ? 'LIVE' : state.conn === 'connecting' ? 'CONNECTING' : 'OFFLINE'}</div>
              <div className="tv-time">{fmtTime(now)}</div>
              <div className="tv-date">{fmtDate(now)}</div>
            </div>
          </header>

          {!live && state.phase === 'ready' && <div className="tv-stale" role="alert">RECONNECTING — DATA MAY BE OUTDATED</div>}

          <main className="tv-main">
            {leaving && <div className={`tv-screen leaving out-${kind}`} style={{ '--tms': `${transitionMs}ms` }} key={`out-${leaving}`}>{renderScreen(leaving)}</div>}
            <div className={`tv-screen ${leaving ? `entering in-${kind}` : ''}`} style={{ '--tms': `${transitionMs}ms` }} key={`in-${current}`}>{renderScreen(current)}</div>
            {leaving && kind === 'logo' && <div className="tv-logo-flash" style={{ '--tms': `${transitionMs}ms` }}><Logo className="flash" /></div>}
          </main>

          <footer className="tv-footer">
            <nav className={`tv-tabs ${showControls ? 'show' : ''}`}>
              {screens.map((s, i) => <button key={s.id} className={s.id === current ? 'on' : ''} onClick={() => goTo(s.id)}>{i + 1}</button>)}
              <button onClick={() => setPaused(p => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
              <button onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
            </nav>
            <div className="tv-progress"><span key={`${current}-${paused}-${seconds}`} className={paused || !autoRotate ? 'still' : ''} style={{ animationDuration: `${seconds}s` }} /></div>
            <div className="tv-feed-line">{state.feed[0] && state.feed[0].type !== 'ATTENDANCE_CHANGED' ? `${state.feed[0].caseNumber || ''} ${state.feed[0].type === 'STAGE_ENTERED' ? '→ ' + prettyStage(state.feed[0].stage) : ''}` : ''}</div>
          </footer>

          {celebrate && <div className="tv-celebrate" key={state.celebration.at}><b>✓ {state.celebration.caseNumber || 'Case'}</b> completed{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}

          {(intro || interstitial) && (
            <div className={`tv-intro ${intro ? 'first' : 'inter'}`} role="presentation">
              <Logo className="intro" />
              <h1>YE-ALMAZ</h1>
              <p>{(cfg?.title || 'Live Production Command Center').toUpperCase()}</p>
              {interstitial && cfg?.interstitialSlogan ? <em>{cfg.interstitialSlogan}</em> : null}
            </div>
          )}
        </div>
      </div>
    </TvContext.Provider>
  );
}
