import { useEffect, useRef, useState } from 'react';
import { MdSmartToy, MdClose } from 'react-icons/md';
import AIAssistant from './ai/AIAssistant';
import useAIChat from '../hooks/useAIChat';

// Floating entry point for the AI assistant: a fixed button that opens a panel
// on the right. Mounted once in AdminLayout so it's available on every admin
// screen without its own route or nav item.
//
// The conversation state lives HERE, above the panel, and the panel stays
// mounted while closed (just hidden) - closing or minimising never throws the
// thread away. States: closed -> open (welcome) -> conversation; "minimised"
// collapses the panel to its header bar on desktop and to the button on phones.
export default function FloatingAIAssistant() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const fabRef = useRef(null);
  const chat = useAIChat();

  // Tell the stylesheet a fixed button is on screen so the scroll area can
  // keep room beneath its content (see .has-ai-fab in index.css).
  useEffect(() => {
    document.documentElement.classList.add('has-ai-fab');
    return () => document.documentElement.classList.remove('has-ai-fab');
  }, []);

  const close = () => { setOpen(false); setMinimized(false); fabRef.current?.focus(); };
  const toggle = () => {
    if (open && !minimized) { close(); return; }
    setOpen(true); setMinimized(false); setFocusSignal(n => n + 1);
  };

  // Esc closes. (Clicking elsewhere no longer does: the assistant is a docked
  // copilot you keep beside the dashboard, not a popover.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div
        className={`ai-panel${minimized ? ' ai-panel--min' : ''}`}
        role="dialog"
        aria-labelledby="ai-assistant-title"
        aria-modal="false"
        hidden={!open}
      >
        <AIAssistant
          chat={chat}
          focusSignal={open && !minimized ? focusSignal : 0}
          onMinimize={() => setMinimized(m => !m)}
          onClose={close}
        />
      </div>

      <button
        ref={fabRef}
        className="ai-fab"
        data-open={open && !minimized ? 'true' : 'false'}
        onClick={toggle}
        aria-label={open && !minimized ? 'Close AI Assistant' : 'Open AI Assistant'}
        aria-expanded={open && !minimized}
        title="AI Assistant"
      >
        {!(open && !minimized) && <span className="ai-fab-ping" aria-hidden="true" />}
        {open && !minimized ? <MdClose className="mi" size={24} /> : <MdSmartToy className="mi" size={24} />}
      </button>
    </>
  );
}
