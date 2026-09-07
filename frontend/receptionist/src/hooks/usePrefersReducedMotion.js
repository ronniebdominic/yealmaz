import { useEffect, useState } from 'react';

// True when the OS "reduce motion" setting is on. Used to make JS-driven
// motion (count-ups, chart entrance durations) fall straight to the end
// state, matching the CSS prefers-reduced-motion rules in index.css.
export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  return reduced;
}
