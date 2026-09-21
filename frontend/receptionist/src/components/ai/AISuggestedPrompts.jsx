import { memo } from 'react';
import { MdArrowForward } from 'react-icons/md';

const SUGGESTED = [
  "Show today's new cases",
  'What cases are ready to dispatch?',
  'What is the revenue this month?',
];

const AISuggestedPrompts = memo(function AISuggestedPrompts({ onPrompt, disabled }) {
  return (
    <>
      <div className="ai-or" aria-hidden="true"><span>Or just ask me anything…</span></div>
      <ul className="ai-suggest" aria-label="Suggested questions">
        {SUGGESTED.map(q => (
          <li key={q}>
            <button type="button" className="ai-suggest-btn" disabled={disabled} onClick={() => onPrompt(q)}>
              <span>{q}</span>
              <MdArrowForward size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
});

export default AISuggestedPrompts;
