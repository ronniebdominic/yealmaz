import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { MdMic, MdMicOff, MdSend } from 'react-icons/md';

const MAX_HEIGHT = 140;   // px - the box grows to here, then scrolls

// Enter sends, Shift+Enter is a newline. The box is disabled while a request is
// in flight (and focus returns to it afterwards) so a reply can't be doubled up.
// Voice keeps its original behaviour: one utterance per press, auto-sent.
const AIComposer = memo(forwardRef(function AIComposer(
  { value, onChange, onSend, sending, listening, sttSupported, onToggleListening }, ref,
) {
  const taRef = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), []);

  // Auto-grow: reset to auto first so it can also shrink after a send.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const wasSending = useRef(false);
  useEffect(() => {
    if (wasSending.current && !sending) taRef.current?.focus();
    wasSending.current = sending;
  }, [sending]);

  const canSend = !!value.trim() && !sending;

  return (
    <div className="ai-composer">
      {listening && (
        <div className="ai-listening" role="status">
          <span className="ai-eq" aria-hidden="true"><i /><i /><i /><i /></span>
          Listening… speak your question
        </div>
      )}
      <div className={`ai-input-row${listening ? ' is-listening' : ''}`}>
        <textarea
          ref={taRef}
          className="ai-input"
          value={value}
          rows={1}
          disabled={sending}
          aria-label="Message the AI assistant"
          placeholder={listening ? 'Listening…' : 'Ask about your lab…'}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) onSend(); }
          }}
        />
        <button
          type="button"
          className={`ai-icon-btn${listening ? ' is-on' : ''}`}
          disabled={!sttSupported || sending}
          onClick={onToggleListening}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Speak your question'}
          title={sttSupported ? (listening ? 'Stop listening' : 'Speak your question') : 'Voice input is not supported in this browser'}
        >
          {listening ? <MdMicOff size={19} /> : <MdMic size={19} />}
        </button>
        <button
          type="button"
          className="ai-send"
          disabled={!canSend}
          onClick={onSend}
          aria-label={sending ? 'Sending…' : 'Send message'}
          title="Send (Enter)"
        >
          {sending ? <span className="ai-spin" aria-hidden="true" /> : <MdSend size={18} />}
        </button>
      </div>
      <div className="ai-foot">Powered by Ye-Almaz AI</div>
    </div>
  );
}));

export default AIComposer;
