import { useEffect, useRef, useState } from 'react';
import { MdSmartToy, MdClose } from 'react-icons/md';
import AIChatPanel from './AIChatPanel';

// Floating entry point for the AI assistant — a fixed action button that
// opens a glass chat panel in place. Mounted once in AdminLayout so it's
// available on every admin screen without its own route or nav item.
// The panel hosts the exact same <AIChatPanel/> the /admin/ai-chat route
// renders, so behaviour (agent loop, voice, reset) is unchanged.
export default function FloatingAIAssistant() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const fabRef = useRef(null);

  // Esc to close; click outside the panel (and not on the FAB) to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || fabRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <>
      {open && (
        <div className="ai-panel" ref={panelRef} role="dialog" aria-label="AI Assistant">
          <div className="ai-panel-head">
            <MdSmartToy className="mi" size={17} style={{ color: 'var(--brand)' }} />
            AI Assistant
            <button className="ai-panel-close" onClick={() => setOpen(false)} aria-label="Close assistant">
              <MdClose size={17} />
            </button>
          </div>
          <div className="ai-panel-body">
            <AIChatPanel />
          </div>
        </div>
      )}

      <button
        ref={fabRef}
        className="ai-fab"
        data-open={open ? 'true' : 'false'}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="AI Assistant"
      >
        {!open && <span className="ai-fab-ping" aria-hidden="true" />}
        {open ? <MdClose className="mi" size={24} /> : <MdSmartToy className="mi" size={24} />}
      </button>
    </>
  );
}
