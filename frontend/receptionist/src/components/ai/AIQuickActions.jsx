import { memo } from 'react';
import { MdAssignment, MdLocalShipping, MdInsights, MdSearch } from 'react-icons/md';

// `prompt` is sent through the normal chat pipeline. "Find a Case" needs an id
// or patient name the user has to type, so it hands focus to the composer with
// a starter instead of sending anything.
const QUICK_ACTIONS = [
  { key: 'today',    icon: MdAssignment,    title: "Today's Cases", sub: 'Live summary',
    prompt: "Give me a summary of today's cases." },
  { key: 'delivery', icon: MdLocalShipping, title: 'Deliveries',    sub: 'Pending & completed',
    prompt: "Show me today's delivery status including pending and completed deliveries." },
  { key: 'perf',     icon: MdInsights,      title: 'Performance',   sub: 'Trends & insights',
    prompt: "Give me a summary of the lab's recent performance." },
  { key: 'find',     icon: MdSearch,        title: 'Find a Case',   sub: 'Search by ID / patient',
    starter: 'Find case ' },
];

const AIQuickActions = memo(function AIQuickActions({ onPrompt, onStarter, disabled }) {
  return (
    <div className="ai-quick" role="group" aria-label="Quick actions">
      {QUICK_ACTIONS.map(a => (
        <button
          key={a.key}
          type="button"
          className="ai-quick-card"
          disabled={disabled}
          onClick={() => (a.prompt ? onPrompt(a.prompt) : onStarter(a.starter))}
        >
          <span className="ai-quick-ic" aria-hidden="true"><a.icon size={18} /></span>
          <span className="ai-quick-t">{a.title}</span>
          <span className="ai-quick-s">{a.sub}</span>
        </button>
      ))}
    </div>
  );
});

export default AIQuickActions;
