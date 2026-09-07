/* eslint-disable react-hooks/set-state-in-effect */
// Deliberate mount animation: the effect flips the fill width from 0 to
// the target on the next frame so the CSS width transition plays.
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

// Thin progress/ratio bar that grows from 0 to `value`% on mount and
// eases to any later value change. Data-viz timing (~520ms) from the
// --t-data token. Under prefers-reduced-motion it snaps to the value.
// Presentational only.
export default function ProgressBar({
  value = 0, color = 'var(--brand)', track = 'var(--surface-3)',
  height = 8, rounded = true, style,
}) {
  const reduced = usePrefersReducedMotion();
  const target = Math.max(0, Math.min(100, Number(value) || 0));
  const [w, setW] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) { setW(target); return; }
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target, reduced]);

  return (
    <div
      className="progress"
      style={{ height, borderRadius: rounded ? 'var(--radius-pill)' : 4, background: track, ...style }}
      role="progressbar"
      aria-valuenow={Math.round(target)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress__fill" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}
