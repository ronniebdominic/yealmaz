// Ye-Almaz — Admin AI Assistant (text + voice)
//
// Talks to the exact same local-model agent loop as the Telegram bot
// (backend/src/services/telegramBotAgent.js, via routes/aiChat.js) — same
// tools, same grounding guardrails, same conversation-memory mechanism, a
// separate conversation key so this never mixes with anyone's Telegram
// history. The two channels can therefore never disagree on an answer.
//
// Voice is entirely a BROWSER feature (Web Speech API) — nothing audio
// related ever touches the backend. Speech-to-text fills the message box
// and auto-sends; text-to-speech reads replies aloud when enabled. Chrome
// and Edge support both; Firefox and Safari have partial/no support, so
// each capability is feature-detected independently and the affected
// controls disable themselves with an explanatory tooltip rather than
// silently failing.
import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import toast from 'react-hot-toast';
import {
  MdSmartToy, MdSend, MdMic, MdMicOff, MdVolumeUp, MdVolumeOff,
  MdRestartAlt, MdPerson, MdErrorOutline, MdInfoOutline,
} from 'react-icons/md';

// A response can genuinely take a while: the agent loop may run several
// tool-calling rounds against a local model on modest lab hardware. This
// must exceed that comfortably so a slow-but-working answer isn't cut off
// and mistaken for a hang.
const ASK_TIMEOUT_MS = 120_000;
const SLOW_HINT_MS = 15_000;

function useSpeech() {
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSttSupported(!!SR);
    setTtsSupported(!!window.speechSynthesis);
    if (SR) {
      const r = new SR();
      r.continuous = false;   // one utterance per press — talk, pause, it sends
      r.interimResults = false;
      r.maxAlternatives = 1;
      recognitionRef.current = r;
    }
  }, []);

  return { sttSupported, ttsSupported, recognition: recognitionRef.current };
}

function Message({ role, text, pending }) {
  const isUser = role === 'user';
  const isError = role === 'error';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginRight: 8,
          display: 'grid', placeItems: 'center',
          background: isError ? '#FFF1F2' : 'var(--accent-dim)',
          color: isError ? 'var(--red)' : 'var(--accent)',
        }}>
          {isError ? <MdErrorOutline size={16} /> : <MdSmartToy size={16} />}
        </div>
      )}
      <div style={{
        maxWidth: '72%', padding: '10px 14px', borderRadius: 14,
        borderTopLeftRadius: isUser ? 14 : 4, borderTopRightRadius: isUser ? 4 : 14,
        background: isUser ? 'var(--accent)' : isError ? '#FFF1F2' : 'var(--bg-2)',
        color: isUser ? '#fff' : isError ? 'var(--red)' : 'var(--text-1)',
        border: isUser ? 'none' : `1px solid ${isError ? 'rgba(229,62,62,0.25)' : 'var(--border)'}`,
        fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {pending ? <ThinkingDots /> : text}
      </div>
      {isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginLeft: 8,
          display: 'grid', placeItems: 'center', background: 'var(--bg-2)', color: 'var(--text-3)',
        }}>
          <MdPerson size={16} />
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
      <span className="thinking-dots"><i /><i /><i /></span>
      {elapsed >= Math.round(SLOW_HINT_MS / 1000) && (
        <span style={{ fontSize: 12 }}>Still thinking — local models can take a while ({elapsed}s)…</span>
      )}
    </span>
  );
}

export default function AdminAIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const { sttSupported, ttsSupported, recognition } = useSpeech();
  const listRef = useRef(null);
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const speak = (text) => {
    if (!ttsSupported || !autoSpeak) return;
    window.speechSynthesis.cancel(); // don't overlap a reply with a stale one still playing
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  };

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    setMessages(m => [...m, { id: nextId(), role: 'user', text: trimmed }]);
    const pendingId = nextId();
    setMessages(m => [...m, { id: pendingId, role: 'assistant', pending: true }]);
    setSending(true);

    try {
      const { data } = await api.post('/ai-chat/ask', { text: trimmed }, { timeout: ASK_TIMEOUT_MS });
      setMessages(m => m.map(msg => msg.id === pendingId ? { ...msg, pending: false, text: data.reply } : msg));
      speak(data.reply);
    } catch (err) {
      const errText = err.code === 'ECONNABORTED'
        ? 'That took too long and timed out. The lab machine may be busy or offline — try again in a moment.'
        : (err.response?.data?.error || 'Something went wrong reaching the assistant.');
      setMessages(m => m.map(msg => msg.id === pendingId ? { id: pendingId, role: 'error', text: errText } : msg));
    } finally {
      setSending(false);
    }
  };

  const toggleListening = () => {
    if (!recognition) return;
    if (listening) { recognition.stop(); return; }

    recognition.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) send(transcript);
    };
    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        toast.error('Microphone access was denied — allow it in your browser to use voice input.');
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
        toast.error(`Voice input error: ${e.error}`);
      }
    };
    recognition.onend = () => setListening(false);

    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if already running (rapid double-click) — harmless
    }
  };

  const reset = async () => {
    try {
      await api.post('/ai-chat/reset');
      setMessages([]);
      window.speechSynthesis?.cancel();
      toast.success('Conversation cleared');
    } catch {
      toast.error('Could not reset the conversation');
    }
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MdSmartToy className="mi" size={18} /> AI Assistant
        </div>
      </div>

      <div className="content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <div className="card" style={{ padding: 12, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            <MdInfoOutline size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Read-only, same local model and data as the Telegram bot — it can look up cases, payments, performance
              and business insights, but never changes anything. It has no access to payroll or HR-record data.
              {!sttSupported && ' Voice input isn’t supported in this browser — try Chrome or Edge.'}
            </div>
          </div>
        </div>

        <div ref={listRef} className="card" style={{ flex: 1, overflowY: 'auto', padding: 16, marginBottom: 12 }}>
          {messages.length === 0 ? (
            <div className="empty-state" style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <MdSmartToy size={32} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
                <div>Ask about cases, payments, clinic balances, lab performance, or business insights.</div>
              </div>
            </div>
          ) : messages.map(m => <Message key={m.id} {...m} />)}
        </div>

        <div className="card" style={{ padding: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={listening ? 'Listening…' : 'Ask a question, or press the mic to speak…'}
              rows={1}
              disabled={sending}
              style={{
                flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 10, minHeight: 40, maxHeight: 120,
                border: `1px solid ${listening ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg-2)', color: 'var(--text-1)',
                fontFamily: 'inherit', fontSize: 14,
              }}
            />
            <button
              className="btn btn-ghost btn-sm" title={sttSupported ? (listening ? 'Stop listening' : 'Speak your question') : 'Voice input not supported in this browser'}
              disabled={!sttSupported || sending}
              onClick={toggleListening}
              style={{ padding: 10, color: listening ? 'var(--red)' : undefined, animation: listening ? 'pulse-mic 1.2s ease-in-out infinite' : undefined }}
            >
              {listening ? <MdMicOff size={18} /> : <MdMic size={18} />}
            </button>
            <button
              className="btn btn-ghost btn-sm" title={ttsSupported ? (autoSpeak ? 'Voice replies on — click to mute' : 'Voice replies off — click to enable') : 'Text-to-speech not supported in this browser'}
              disabled={!ttsSupported}
              onClick={() => { setAutoSpeak(v => !v); if (autoSpeak) window.speechSynthesis?.cancel(); }}
              style={{ padding: 10, color: autoSpeak ? 'var(--accent)' : undefined }}
            >
              {autoSpeak ? <MdVolumeUp size={18} /> : <MdVolumeOff size={18} />}
            </button>
            <button className="btn btn-primary btn-sm" disabled={!input.trim() || sending} onClick={() => send(input)} style={{ padding: '10px 14px' }}>
              <MdSend size={16} />
            </button>
            <button className="btn btn-ghost btn-sm" title="Clear conversation" onClick={reset} style={{ padding: 10 }}>
              <MdRestartAlt size={18} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .thinking-dots { display: inline-flex; gap: 3px; }
        .thinking-dots i {
          width: 6px; height: 6px; border-radius: 50%; background: var(--text-3);
          display: inline-block; animation: thinking-bounce 1.1s infinite ease-in-out;
        }
        .thinking-dots i:nth-child(2) { animation-delay: 0.15s; }
        .thinking-dots i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes thinking-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
        @keyframes pulse-mic { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </AdminLayout>
  );
}
