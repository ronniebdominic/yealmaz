// Ye-Almaz TV — small shared hooks and formatters.
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export const TvContext = createContext(null);
export const useTv = () => useContext(TvContext); // { store, state, now, intensity }

export function useStoreState(store) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// One clock for the whole screen: a single 1 s interval, so 40 cards don't run 40 timers.
export function useTicker(offsetMs = 0) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  const offset = useRef(offsetMs);
  useEffect(() => { offset.current = offsetMs; }, [offsetMs]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// 'off' | 'low' | 'normal' — the admin's choice, lowered (never raised) by the viewer's reduced-motion setting.
export function effectiveIntensity(setting) {
  const s = setting || 'normal';
  if (prefersReduced()) return s === 'off' ? 'off' : 'low';
  return s;
}

// Smoothly counts from the previous value to the new one. The frame loop is cancelled on change and unmount.
export function useCountUp(target, { intensity = 'normal', ms = 900 } = {}) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (target == null || typeof target !== 'number') { setValue(target); return undefined; }
    if (intensity === 'off' || from.current === target) { from.current = target; setValue(target); return undefined; }
    const start = performance.now(), a = from.current, b = target;
    let raf = requestAnimationFrame(function step(t) {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(a + (b - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = b;
    });
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [target, intensity, ms]);
  return value;
}

// ── formatting (Africa/Addis_Ababa regardless of the TV's own clock/timezone)
const TZ = 'Africa/Addis_Ababa';
export const fmtTime = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms);
export const fmtDate = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
export function elapsed(sinceIso, nowMs) {
  if (!sinceIso) return '—';
  const s = Math.max(0, Math.floor((nowMs - new Date(sinceIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}
export function ago(sinceIso, nowMs) {
  if (!sinceIso) return '';
  const m = Math.floor((nowMs - new Date(sinceIso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}
export const durationShort = (ms) => {
  if (ms == null) return '—';
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`;
};

export const STATUS_META = {
  WORKING: { label: 'WORKING', cls: 'working' },
  AVAILABLE: { label: 'AVAILABLE', cls: 'available' },
  ON_BREAK: { label: 'ON BREAK', cls: 'break' },
  OFF_DUTY: { label: 'OFF DUTY', cls: 'off' },
  BLOCKED: { label: 'BLOCKED', cls: 'blocked' },
  WAITING_FOR_APPROVAL: { label: 'WAITING FOR APPROVAL', cls: 'approval' },
};

export const EVENT_LABEL = {
  STAGE_ENTERED: 'moved to', READY_FOR_DISPATCH: 'passed QC — ready for dispatch', CASE_ACCEPTED: 'accepted',
  STATUS_CHANGED: 'now', DELIVERED: 'delivered', ATTENDANCE_CHANGED: 'attendance updated',
};
export const prettyStage = (s) => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Rotates through pages while the screen is mounted; the interval dies with the screen.
export function usePager(pages, totalSeconds) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return undefined;
    const id = setInterval(() => setPage(p => (p + 1) % pages), (totalSeconds * 1000) / pages);
    return () => clearInterval(id);
  }, [pages, totalSeconds]);
  return Math.min(page, pages - 1);
}
