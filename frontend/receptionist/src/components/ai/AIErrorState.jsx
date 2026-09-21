import { memo } from 'react';
import { MdErrorOutline, MdRefresh } from 'react-icons/md';

// Plain-language copy per failure kind. `detail` is whatever the server said
// (already user-safe: it never carries keys or stack traces), kept behind a
// collapsed "Details" toggle for whoever is debugging.
const COPY = {
  rate:    { title: 'AI temporarily unavailable', body: 'The assistant is handling a lot of requests right now. Please try again in a minute.' },
  down:    { title: 'AI temporarily unavailable', body: "The assistant couldn't be reached just now. Please try again in a moment." },
  timeout: { title: 'That took too long',         body: "The assistant didn't answer in time. Please try again." },
  network: { title: "Can't connect",              body: 'Check your internet connection and try again.' },
  partial: { title: "Couldn't finish that answer", body: 'It gathered the data but ran out of time to summarise it. Try a narrower question.' },
  server:  { title: 'AI temporarily unavailable', body: "The assistant couldn't process this request right now." },
};

const AIErrorState = memo(function AIErrorState({ kind = 'server', detail, onRetry, busy }) {
  const c = COPY[kind] || COPY.server;
  const safeDetail = String(detail || '').slice(0, 300);
  return (
    <div className="ai-error" role="alert">
      <div className="ai-error-head">
        <MdErrorOutline size={18} aria-hidden="true" />
        <strong>{c.title}</strong>
      </div>
      <p>{c.body}</p>
      <div className="ai-error-actions">
        <button type="button" className="ai-btn ai-btn-soft" onClick={onRetry} disabled={busy}>
          <MdRefresh size={16} aria-hidden="true" /> Try again
        </button>
        {safeDetail && (
          <details className="ai-error-details">
            <summary>Details</summary>
            <pre>{safeDetail}</pre>
          </details>
        )}
      </div>
    </div>
  );
});

export default AIErrorState;
