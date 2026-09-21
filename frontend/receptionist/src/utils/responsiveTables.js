// Ye-Almaz — label table cells for the phone card layout.
//
// Below 540px every table collapses into stacked cards and its <thead> is
// hidden (see "Phone tables" in index.css). That left values like "—" with
// nothing saying which field they were. This copies each column's header
// text onto the cells beneath it as `data-label`, which the stylesheet
// shows as a small caption above the value.
//
// Done once, globally, rather than editing ~70 tables: a MutationObserver
// labels any table as it appears or its rows change. The attribute is inert
// on wider screens (nothing reads it), so it costs nothing there. Cells
// that already carry a data-label, spanning cells, and columns with an
// empty header (action columns) are left unlabelled.
function labelTable(table) {
  const heads = [...table.querySelectorAll(':scope > thead th')].map(th => th.textContent.trim());
  if (!heads.length) return;
  for (const tr of table.querySelectorAll(':scope > tbody > tr')) {
    let col = 0;
    for (const td of tr.children) {
      if (td.tagName !== 'TD') continue;
      const span = td.colSpan || 1;
      if (!td.hasAttribute('data-label')) td.setAttribute('data-label', span === 1 ? (heads[col] || '') : '');
      col += span;
    }
  }
}

export function installResponsiveTables() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const pending = new Set();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    for (const t of pending) if (t.isConnected) labelTable(t);
    pending.clear();
  };
  const queue = (table) => {
    if (!table) return;
    pending.add(table);
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  };
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      queue(t?.closest?.('table'));
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'TABLE') queue(n);
        else n.querySelectorAll?.('table').forEach(queue);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('table').forEach(queue);
}
