import { useEffect, useState } from 'react';

// Width of an element's own box, kept current as it resizes.
//
// For components whose layout depends on the space THEY have rather than the
// viewport: a chart in a 300px-wide card on a 1000px-wide screen needs the
// compact layout as much as one on a phone, and a viewport media query can't
// tell the difference. Returns [ref, width]; width is 0 until first measured.
//
// `ref` is a CALLBACK ref backed by state, on purpose. An effect with a
// useRef would run once at mount and never again — but the element often
// isn't there yet (a card that only renders after its data loads), so the
// width would stay 0 forever. Storing the node in state re-runs the effect
// whenever the element actually appears, changes, or goes away.
export function useElementWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    // observe() reports the element's initial size to the callback too, so no
    // separate synchronous measurement (which would set state inside the effect).
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}
