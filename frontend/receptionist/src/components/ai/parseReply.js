// Recovers structure from the assistant's plain-text replies (see AIStructured.jsx).
// "37", "1,234", "97%", "Br 141,950,516.00", "-3.5", "2 of 5"
const VALUE_RE = /^(?:Br\s?)?[-+]?\d[\d,]*(?:\.\d+)?\s?(?:%|Br|ETB|days?|hrs?|hours?|min|mins|cases?|units?)?(?:\s+of\s+[\d,]+)?$/i;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/;

function splitLabelValue(line) {
  const m = /^(.{1,48}?)\s*[:—]\s+(.{1,28})$/.exec(line);
  if (m && VALUE_RE.test(m[2].trim())) return { label: m[1].trim(), value: m[2].trim() };
  return null;
}

export function parseReply(text) {
  const blocks = [];
  let para = [];
  let run = [];   // consecutive bullet/metric lines

  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushRun = () => {
    if (!run.length) return;
    const metrics = run.filter(r => r.metric);
    if (run.length >= 3 && metrics.length === run.length) blocks.push({ type: 'metrics', items: metrics.map(r => r.metric) });
    else blocks.push({ type: 'list', items: run.map(r => r.text) });
    run = [];
  };

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushPara(); flushRun(); continue; }
    const bullet = BULLET_RE.exec(line);
    const body = bullet ? bullet[1] : line;
    const metric = splitLabelValue(body);
    if (bullet || metric) {
      flushPara();
      run.push({ text: body, metric });
    } else {
      flushRun();
      para.push(line);
    }
  }
  flushPara();
  flushRun();
  return blocks;
}
