import { useCallback, useEffect, useRef, useState } from 'react';
import { MdArrowDownward } from 'react-icons/md';
import AIMessage from './AIMessage';

const NEAR_BOTTOM_PX = 80;

// Only this element scrolls. It follows new content ONLY while the reader is
// at (or near) the bottom: scrolling up to reread something switches following
// off, and it comes back when they return to the bottom or send a message.
export default function AIConversation({ messages, sending, onRetry }) {
  const ref = useRef(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);   // scrolled up, with content below
  const lastCount = useRef(0);

  const toBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stick.current = near;
    setAway(a => (a === !near ? a : !near));
  }, []);

  useEffect(() => {
    // A message the user just sent always brings the view down.
    const last = messages[messages.length - 2];
    if (messages.length > lastCount.current && last?.role === 'user') stick.current = true;
    lastCount.current = messages.length;
    if (stick.current) toBottom();
  }, [messages, toBottom]);

  return (
    <div className="ai-convo-wrap">
      <div
        ref={ref}
        className="ai-convo"
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
      >
        {messages.map(m => (
          <AIMessage key={m.id} {...m} busy={m.role === 'error' ? sending : undefined} onRetry={onRetry} />
        ))}
      </div>
      {away && (
        <button type="button" className="ai-jump" onClick={() => { stick.current = true; setAway(false); toBottom(); }}>
          <MdArrowDownward size={14} aria-hidden="true" /> Latest
        </button>
      )}
    </div>
  );
}
