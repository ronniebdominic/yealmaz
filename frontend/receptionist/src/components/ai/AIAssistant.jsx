// The AI Assistant surface: header, welcome / conversation, composer. Purely
// presentational - state and the API live in hooks/useAIChat, so the floating
// panel and the /admin/ai-chat page share one implementation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import AIAssistantHeader from './AIAssistantHeader';
import AIWelcome from './AIWelcome';
import AIConversation from './AIConversation';
import AIComposer from './AIComposer';
import './ai.css';

export default function AIAssistant({ chat, focusSignal, onMinimize, onClose }) {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const composerRef = useRef(null);
  const { messages, sending, listening, autoSpeak, sttSupported, ttsSupported, send, retry, toggleListening, toggleAutoSpeak, reset } = chat;

  // Focus the box each time the panel opens.
  useEffect(() => { if (focusSignal) composerRef.current?.focus(); }, [focusSignal]);

  const submit = useCallback(() => { if (send(input)) setInput(''); }, [send, input]);
  const askPrompt = useCallback((q) => { send(q); }, [send]);
  const startTyping = useCallback((starter) => { setInput(starter); requestAnimationFrame(() => composerRef.current?.focus()); }, []);

  const last = messages[messages.length - 1];
  const lastErrorKind = last?.role === 'error' ? last.kind : null;

  return (
    <div className="ai-shell">
      <AIAssistantHeader
        lastErrorKind={lastErrorKind}
        canClear={messages.length > 0}
        onClear={reset}
        ttsSupported={ttsSupported}
        autoSpeak={autoSpeak}
        onToggleSpeak={toggleAutoSpeak}
        onMinimize={onMinimize}
        onClose={onClose}
      />
      <div className="ai-body">
        {messages.length === 0 ? (
          <AIWelcome
            name={user?.name}
            onPrompt={askPrompt}
            onStarter={startTyping}
            disabled={sending}
            sttSupported={sttSupported}
          />
        ) : (
          <AIConversation messages={messages} sending={sending} onRetry={retry} />
        )}
      </div>
      <AIComposer
        ref={composerRef}
        value={input}
        onChange={setInput}
        onSend={submit}
        sending={sending}
        listening={listening}
        sttSupported={sttSupported}
        onToggleListening={toggleListening}
      />
    </div>
  );
}
