// Presents an assistant reply. The backend returns plain text only (its system
// prompt forbids markdown), so structure is recovered from the text itself:
//   - three or more consecutive "Label: number" lines  -> a metric grid
//   - other "-" / "*" lines                            -> a result list
//   - everything else                                  -> paragraphs
// Nothing is invented: every card shows a label and value that were in the
// reply. If a reply has no such lines it renders as ordinary paragraphs.
import { memo, useMemo } from 'react';
import { parseReply } from './parseReply';

export const AIStatCard = memo(function AIStatCard({ label, value }) {
  return (
    <div className="ai-stat">
      <div className="ai-stat-value">{value}</div>
      <div className="ai-stat-label">{label}</div>
    </div>
  );
});

export const AIMetricGrid = memo(function AIMetricGrid({ items }) {
  return (
    <div className="ai-metric-grid" role="list" data-count={items.length}>
      {items.map((it, i) => (
        <div role="listitem" key={`${it.label}-${i}`} style={{ display: 'contents' }}>
          <AIStatCard label={it.label} value={it.value} />
        </div>
      ))}
    </div>
  );
});

export const AIResultList = memo(function AIResultList({ items }) {
  return (
    <ul className="ai-result-list">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
});

const AIReply = memo(function AIReply({ text }) {
  const blocks = useMemo(() => parseReply(text), [text]);
  return (
    <div className="ai-reply">
      {blocks.map((b, i) => {
        if (b.type === 'metrics') return <AIMetricGrid key={i} items={b.items} />;
        if (b.type === 'list') return <AIResultList key={i} items={b.items} />;
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
});

export default AIReply;
