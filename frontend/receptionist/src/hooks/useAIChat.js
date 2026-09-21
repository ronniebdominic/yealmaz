// State + API + voice for the admin AI Assistant. UI-free on purpose: the
// floating panel and the full-page route both render the same conversation
// from this one hook, and the floating panel keeps it mounted while closed so
// minimising never loses the thread.
//
// Backend contract (routes/aiChat.js, unchanged): POST /ai-chat/ask {text} ->
// {reply: string}; POST /ai-chat/reset clears the server-side history. There is
// no streaming, so "thinking" is shown honestly for the whole round-trip.
//
// Voice is entirely a browser feature (Web Speech API): speech-to-text fills
// and auto-sends, text-to-speech reads replies when enabled. Each capability is
// feature-detected on its own.
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

// A response can take a while (several tool rounds); this must comfortably
// exceed that so a slow-but-working answer isn't cut off and read as a hang.
const ASK_TIMEOUT_MS = 120_000;

// The agent reports its own failures as ordinary reply text (HTTP 200), so they
// have to be recognised here to be shown as errors rather than as answers.
// Kinds: rate = provider usage cap, down = model unreachable, partial = ran out
// of rounds before it could summarise.
export function classifyReply(text) {
  const t = String(text || '');
  if (/rate-limited/i.test(t)) return 'rate';
  if (/couldn.?t reach the AI model/i.test(t)) return 'down';
  if (/gathered some data but/i.test(t)) return 'partial';
  return null;
}

function useSpeech() {
  // Feature detection is synchronous, so read it once up front instead of
  // setting state from an effect.
  const [support] = useState(() => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    return { SR: SR || null, stt: !!SR, tts: typeof window !== 'undefined' && !!window.speechSynthesis };
  });
  const recognitionRef = useRef(null);
  useEffect(() => {
    if (!support.SR) return;
    const r = new support.SR();
    r.continuous = false;   // one utterance per press - talk, pause, it sends
    r.interimResults = false;
    r.maxAlternatives = 1;
    recognitionRef.current = r;
  }, [support]);
  return { sttSupported: support.stt, ttsSupported: support.tts, recognitionRef };
}

export default function useAIChat() {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const { sttSupported, ttsSupported, recognitionRef } = useSpeech();
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const sendingRef = useRef(false);   // guards duplicate submits between renders
  const autoSpeakRef = useRef(false);
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis || !autoSpeakRef.current) return;
    window.speechSynthesis.cancel(); // don't overlap a reply with a stale one still playing
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  }, []);

  // One round-trip, writing its outcome into the message `targetId`.
  const ask = useCallback(async (question, targetId) => {
    sendingRef.current = true;
    setSending(true);
    try {
      const { data } = await api.post('/ai-chat/ask', { text: question }, { timeout: ASK_TIMEOUT_MS });
      const kind = classifyReply(data.reply);
      setMessages(m => m.map(msg => msg.id === targetId
        ? (kind
          ? { id: targetId, role: 'error', kind, question, detail: data.reply }
          : { id: targetId, role: 'assistant', text: data.reply })
        : msg));
      if (!kind) speak(data.reply);
    } catch (err) {
      const kind = err.code === 'ECONNABORTED' ? 'timeout' : (err.response ? 'server' : 'network');
      const status = err.response?.status;
      const detail = err.response?.data?.error || err.message || '';
      setMessages(m => m.map(msg => msg.id === targetId
        ? { id: targetId, role: 'error', kind, question, detail: status ? `${status} - ${detail}` : detail }
        : msg));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [speak]);

  const send = useCallback((text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sendingRef.current) return false;
    const pendingId = nextId();
    setMessages(m => [...m, { id: nextId(), role: 'user', text: trimmed }, { id: pendingId, role: 'assistant', pending: true }]);
    ask(trimmed, pendingId);
    return true;
  }, [ask]);

  // Re-ask a failed question in place. The backend only records an exchange in
  // its history when it succeeds, so retrying can't duplicate anything.
  const retry = useCallback((errorId) => {
    if (sendingRef.current) return;
    const failed = messagesRef.current.find(m => m.id === errorId);
    if (!failed) return;
    setMessages(cur => cur.map(m => m.id === errorId ? { id: errorId, role: 'assistant', pending: true } : m));
    ask(failed.question, errorId);
  }, [ask]);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) { recognition.stop(); return; }
    recognition.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) send(transcript);
    };
    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        toast.error('Microphone access was denied - allow it in your browser to use voice input.');
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
        toast.error(`Voice input error: ${e.error}`);
      }
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if already running (rapid double-click) - harmless
    }
  }, [listening, recognitionRef, send]);

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak(v => { if (v) window.speechSynthesis?.cancel(); return !v; });
  }, []);

  const reset = useCallback(async () => {
    try {
      await api.post('/ai-chat/reset');
      setMessages([]);
      window.speechSynthesis?.cancel();
      toast.success('Conversation cleared');
    } catch {
      toast.error('Could not reset the conversation');
    }
  }, []);

  return { messages, sending, listening, autoSpeak, sttSupported, ttsSupported, send, retry, toggleListening, toggleAutoSpeak, reset };
}
