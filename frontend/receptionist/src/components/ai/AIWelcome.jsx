import { memo } from 'react';
import { MdSmartToy } from 'react-icons/md';
import AIQuickActions from './AIQuickActions';
import AISuggestedPrompts from './AISuggestedPrompts';

// Shown while there is no conversation. The name is the signed-in user's own.
const AIWelcome = memo(function AIWelcome({ name, onPrompt, onStarter, disabled, sttSupported }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return (
    <div className="ai-welcome">
      <div className="ai-welcome-hero">
        <span className="ai-hero-ic" aria-hidden="true"><MdSmartToy size={22} /></span>
        <h2>{first ? `Hi ${first} \u{1F44B}` : 'Hi there \u{1F44B}'}</h2>
        <p className="ai-hero-q">How can I help you today?</p>
        <p className="ai-hero-sub">
          Ask about cases, deliveries, revenue, clinics, technicians, payments, or anything happening in the lab.
        </p>
      </div>
      <AIQuickActions onPrompt={onPrompt} onStarter={onStarter} disabled={disabled} />
      <AISuggestedPrompts onPrompt={onPrompt} disabled={disabled} />
      {!sttSupported && (
        <p className="ai-note">Voice input isn’t supported in this browser — try Chrome or Edge.</p>
      )}
    </div>
  );
});

export default AIWelcome;
