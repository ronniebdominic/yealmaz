import { memo } from 'react';
import { MdSmartToy, MdPerson } from 'react-icons/md';
import AIReply from './AIStructured';
import AIThinkingIndicator from './AIThinkingIndicator';
import AIErrorState from './AIErrorState';

// memo: a long conversation must not re-render (or re-parse) every earlier
// message on each keystroke or new arrival - props are primitives, so the
// shallow compare is enough.
const AIMessage = memo(function AIMessage({ id, role, text, pending, kind, detail, busy, onRetry }) {
  if (role === 'user') {
    return (
      <div className="ai-msg ai-msg-user">
        <div className="ai-bubble-user">{text}</div>
        <span className="ai-avatar ai-avatar-user" aria-hidden="true"><MdPerson size={15} /></span>
      </div>
    );
  }
  return (
    <div className="ai-msg ai-msg-ai">
      <span className="ai-avatar" aria-hidden="true"><MdSmartToy size={15} /></span>
      <div className={`ai-bubble-ai${role === 'error' ? ' is-error' : ''}`}>
        {pending ? <AIThinkingIndicator />
          : role === 'error' ? <AIErrorState kind={kind} detail={detail} busy={busy} onRetry={() => onRetry(id)} />
          : <AIReply text={text} />}
      </div>
    </div>
  );
});

export default AIMessage;
