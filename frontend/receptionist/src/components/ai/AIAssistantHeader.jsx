import { memo, useEffect, useState } from 'react';
import { MdSmartToy, MdClose, MdRemove, MdRestartAlt, MdVolumeUp, MdVolumeOff } from 'react-icons/md';
import AIStatusBadge from './AIStatusBadge';

// Only what can actually be known: no connection -> offline; the last request
// failing to reach the model/server -> unavailable; otherwise online. There is
// no health endpoint, so this is never a guess dressed up as a live probe.
function useStatus(lastErrorKind) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (!online) return 'offline';
  return ['down', 'network', 'server'].includes(lastErrorKind) ? 'unavailable' : 'online';
}

const AIAssistantHeader = memo(function AIAssistantHeader({
  lastErrorKind, canClear, onClear, ttsSupported, autoSpeak, onToggleSpeak, onMinimize, onClose,
}) {
  const status = useStatus(lastErrorKind);
  return (
    <header className="ai-head">
      <span className="ai-head-ic" aria-hidden="true"><MdSmartToy size={20} /></span>
      <div className="ai-head-t">
        <div className="ai-head-row">
          <h2 id="ai-assistant-title">AI Assistant</h2>
          <AIStatusBadge status={status} />
        </div>
        <div className="ai-head-sub">Your lab operations copilot</div>
      </div>
      <div className="ai-head-actions">
        {ttsSupported && (
          <button type="button" className={`ai-icon-btn sm${autoSpeak ? ' is-on' : ''}`} onClick={onToggleSpeak}
            aria-pressed={autoSpeak}
            aria-label={autoSpeak ? 'Turn off spoken replies' : 'Turn on spoken replies'}
            title={autoSpeak ? 'Spoken replies on' : 'Spoken replies off'}>
            {autoSpeak ? <MdVolumeUp size={17} /> : <MdVolumeOff size={17} />}
          </button>
        )}
        {canClear && (
          <button type="button" className="ai-icon-btn sm" onClick={onClear} aria-label="Clear conversation" title="Clear conversation">
            <MdRestartAlt size={17} />
          </button>
        )}
        {onMinimize && (
          <button type="button" className="ai-icon-btn sm" onClick={onMinimize} aria-label="Minimize assistant" title="Minimize">
            <MdRemove size={18} />
          </button>
        )}
        {onClose && (
          <button type="button" className="ai-icon-btn sm" onClick={onClose} aria-label="Close assistant" title="Close (Esc)">
            <MdClose size={18} />
          </button>
        )}
      </div>
    </header>
  );
});

export default AIAssistantHeader;
