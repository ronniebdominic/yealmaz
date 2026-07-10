import React from 'react';

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export default function Odontogram({ selected, onToggle, onClear }) {
  const toothStyle = (num, isUpper) => {
    const active = selected.includes(num);
    return {
      width: 34, height: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1.5px solid ${active ? '#1A56A0' : '#E2E8F0'}`,
      borderRadius: isUpper ? '5px 5px 0 0' : '0 0 5px 5px',
      background: active ? '#1A56A0' : '#fff',
      cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      color: active ? '#fff' : '#94A3B8',
      margin: '0 1px',
      transition: 'background .1s, border-color .1s',
      fontFamily: 'DM Mono, monospace',
      flexShrink: 0,
      outline: 'none',
    };
  };

  const midlineStyle = {
    width: 10, alignSelf: 'stretch',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };

  const renderRow = (teeth, isUpper) => (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {teeth.map((num) => {
        const isMidline = (isUpper && num === 21) || (!isUpper && num === 31);
        return (
          <React.Fragment key={num}>
            {isMidline && (
              <div style={midlineStyle}>
                <div style={{ width: 1.5, background: '#CBD5E0', alignSelf: 'stretch' }} />
              </div>
            )}
            <button type="button" onClick={() => onToggle(num)} title={`Tooth ${num}`}
              style={toothStyle(num, isUpper)}>
              {num}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.5 }}>← R (Patient Right)</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.5 }}>(Patient Left) L →</span>
      </div>
      {renderRow(UPPER_TEETH, true)}
      <div style={{
        height: 22, margin: '3px 0',
        background: '#F0F4F9', border: '1px solid #E2E8F0', borderRadius: 2,
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.8 }}>UPPER</span>
        <div style={{ flex: 1, height: 1, background: '#CBD5E0' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.8 }}>LOWER</span>
      </div>
      {renderRow(LOWER_TEETH, false)}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        {selected.length > 0 ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Selected: <strong style={{ color: 'var(--blue)' }}>{selected.join(', ')}</strong>
            </span>
            <button type="button" onClick={onClear}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--red)', fontWeight: 600, padding: 0 }}>
              Clear all
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
            No teeth selected — click to mark affected teeth
          </span>
        )}
      </div>
    </div>
  );
}
