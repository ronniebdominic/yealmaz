/* eslint-disable react-hooks/set-state-in-effect */
// This is a deliberate rAF-driven display animation: the effect owns a
// tween and pushes frames via setState by design.
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

// Animates the numeric part of a value on mount / when it changes. Takes
// the already-formatted display string (e.g. "Br 4,425,500", "97%",
// "3.4") and counts its number up, re-applying the same prefix/suffix and
// decimal precision each frame. Non-numeric values ("—", "Loading") pass
// straight through. Purely visual: never blocks interaction, and shows
// the final value immediately under prefers-reduced-motion.
//
// Parsing note: the LAST run of digits (with optional grouping commas and
// one decimal point) is treated as "the number"; everything before it is
// the prefix, everything after is the suffix.
const NUM_RE = /^(.*?)(-?\d[\d,]*(?:\.\d+)?)([^\d]*)$/s;

export default function CountUp({ children, value, duration = 640 }) {
  const raw = value != null ? String(value) : String(children ?? '');
  const reduced = usePrefersReducedMotion();
  const m = raw.match(NUM_RE);
  const target = m ? parseFloat(m[2].replace(/,/g, '')) : null;

  // `anim` is null except while a tween is running — render falls back to
  // `raw`, so there is no synchronous setState to reach the steady state.
  const [anim, setAnim] = useState(null);
  const fromRef = useRef(target ?? 0);

  useEffect(() => {
    if (target == null || reduced) { fromRef.current = target ?? 0; setAnim(null); return; }
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) { setAnim(null); return; }

    const prefix = m[1];
    const suffix = m[3];
    const decimals = m[2].includes('.') ? m[2].split('.')[1].length : 0;
    const grouped = m[2].includes(',');
    const fmt = (n) => {
      const fixed = n.toFixed(decimals);
      const body = grouped
        ? Number(fixed).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : fixed;
      return `${prefix}${body}${suffix}`;
    };

    let rafId;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      if (t < 1) {
        setAnim(fmt(from + delta * eased));
        rafId = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setAnim(null);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, target, reduced, duration]);

  return <span className="countup">{anim ?? raw}</span>;
}
