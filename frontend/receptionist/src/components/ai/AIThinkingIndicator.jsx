import { memo, useEffect, useState } from 'react';

// No streaming exists, so this is shown for the whole round-trip. It says so in
// words (and to screen readers via role=status) instead of animating fake text.
const SLOW_AFTER_S = 15;

const AIThinkingIndicator = memo(function AIThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="ai-thinking" role="status" aria-live="polite">
      <span className="ai-dots" aria-hidden="true"><i /><i /><i /></span>
      <span>{elapsed >= SLOW_AFTER_S ? `Still working on it (${elapsed}s)…` : 'AI is thinking…'}</span>
    </span>
  );
});

export default AIThinkingIndicator;
