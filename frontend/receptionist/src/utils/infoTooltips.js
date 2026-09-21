// Ye-Almaz — viewport-safe info tooltips.
//
// The KPI "ⓘ" tooltips used to be CSS-only: an absolutely positioned bubble
// centred on its icon at a fixed 240px. Icons sit at the right edge of their
// tile, so most of the bubble landed outside the card — where the card's
// overflow:hidden clipped it — and outside the screen (86px off the edge at
// 390px wide, 58px at 1440px), cutting the text off mid-sentence.
//
// CSS alone can't fix that: the tile has backdrop-filter, which makes it the
// containing block for position:fixed descendants too, so a "fixed" tooltip
// inside it is still clipped and offset. So this renders ONE tooltip element
// on <body>, fills it from the icon's own .info-tooltip text, and positions it
// from the icon's viewport rect, clamped to stay fully on screen and flipped
// below the icon when there is no room above.
//
// Markup is unchanged (.info-icon-wrap > .info-tooltip); the original CSS
// bubble is hidden and this takes over. Works for hover, keyboard focus and
// touch (the icons have tabIndex=0, so a tap focuses them).
export function installInfoTooltips() {
  if (typeof document === 'undefined') return;
  const MARGIN = 8, GAP = 8, MAX_W = 260;
  let tip = null;
  let current = null;

  const ensure = () => {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'info-tooltip-floating';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    return tip;
  };

  const place = (wrap) => {
    const t = ensure();
    const r = wrap.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    t.style.maxWidth = `${Math.min(MAX_W, vw - MARGIN * 2)}px`;
    t.style.left = '0px';
    t.style.top = '0px';
    const tr = t.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - tr.width / 2, vw - MARGIN - tr.width));
    const preferBelow = !!wrap.closest('.tooltip-below');
    const fitsAbove = r.top - GAP - tr.height >= MARGIN;
    let top = (!preferBelow && fitsAbove) ? r.top - GAP - tr.height : r.bottom + GAP;
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - tr.height));
    t.style.left = `${Math.round(left)}px`;
    t.style.top = `${Math.round(top)}px`;
  };

  const show = (wrap) => {
    const src = wrap.querySelector('.info-tooltip');
    if (!src) return;
    current = wrap;
    const t = ensure();
    t.textContent = src.textContent;
    place(wrap);
    t.dataset.open = 'true';
  };
  const hide = () => {
    current = null;
    if (tip) tip.dataset.open = 'false';
  };

  const onOver = (e) => {
    const wrap = e.target.closest?.('.info-icon-wrap');
    if (wrap) { if (wrap !== current) show(wrap); } else if (current) hide();
  };
  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('focusin', onOver, true);
  document.addEventListener('focusout', hide, true);
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) hide(); }, true);
  // Anything that moves the icon under a fixed tooltip would leave it stranded.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}
