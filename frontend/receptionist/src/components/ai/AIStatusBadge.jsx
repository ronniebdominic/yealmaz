import { memo } from 'react';

// Status is always words + a dot, never colour alone.
const TONES = {
  online:      { label: 'Online',      cls: 'is-ok' },
  unavailable: { label: 'Unavailable', cls: 'is-warn' },
  offline:     { label: 'Offline',     cls: 'is-bad' },
};

const AIStatusBadge = memo(function AIStatusBadge({ status = 'online' }) {
  const t = TONES[status] || TONES.online;
  return (
    <span className={`ai-status ${t.cls}`}>
      <i aria-hidden="true" />
      {t.label}
    </span>
  );
});

export default AIStatusBadge;
