import { useEffect, useRef, useState } from 'react';
import '../styles/login-dental.css';

// one printed dental arch (a horseshoe of tan resin with a ridge of teeth)
const Arch = ({ x, y, s = 1, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 16 C0 -6 30 -6 30 16" fill="none" stroke="#d8a574" strokeWidth="7" strokeLinecap="round" />
      <path d="M0 16 C0 -6 30 -6 30 16" fill="none" stroke="#f3d3b0" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="2 3.4" />
  </g>
);

// Login illustration: a dental-lab bench (after the reference photo) — a technician in a white coat and blue glove
// holds a resin-printed aligner plate, an orange-hooded 3D printer is building another, a monitor shows the scan.
// Same inputs as the previous scene, so it reacts to the form:
//   email focused / typing  → she looks up at the monitor, the screen shows typing
//   password focused        → the printer hood closes (privacy) and she looks away
//   signing in              → the printer works faster, its light turns blue
//   success                 → the plate lifts, the screen shows a tick
export default function LoginDentalScene({
  activeField = null,
  formStatus = 'idle',
  email = '',
  isTyping = false,
  typingField = null,
}) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const stageRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width * 0.8), dy = e.clientY - (r.top + r.height * 0.35);
      const d = Math.min(Math.hypot(dx, dy) / 420, 1), a = Math.atan2(dy, dx);
      setMouse({ x: Math.cos(a) * d * 3, y: Math.sin(a) * d * 2.2 });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const passwordFocus = activeField === 'password' || typingField === 'password';
  const emailFocus = !passwordFocus && (activeField === 'email' || typingField === 'email');
  const typingEmail = emailFocus && isTyping;
  const loading = formStatus === 'loading';
  const success = formStatus === 'success' && !activeField;

  // where she looks, and how her head sits
  let gaze = { x: -1.2 + mouse.x * 0.6, y: mouse.y * 0.6 };
  let tilt = 0;
  if (success) { gaze = { x: -2.5, y: 0 }; tilt = -2; }
  else if (loading) { gaze = { x: -3.2, y: 1.4 }; tilt = -1; }
  else if (passwordFocus) { gaze = { x: 3.2, y: 1.6 }; tilt = 5; }
  else if (typingEmail) { gaze = { x: -4, y: -3 }; tilt = -6; }
  else if (emailFocus) { gaze = { x: -3, y: -2.2 }; tilt = -3; }

  const state = success ? 'success' : loading ? 'loading' : passwordFocus ? 'password' : typingEmail ? 'typing' : emailFocus ? 'email' : 'idle';

  const bubble = passwordFocus ? "🙈 Shhh — the hood is closed, we won't peek!"
    : typingEmail ? (email ? '💌 Got it — looking you up…' : '📧 Typing your email…')
    : emailFocus ? "👋 Welcome to Ye-Almaz! What's your email?"
    : success ? '🎉 Welcome back — plate ready!' : '';

  return (
    <div className={`robot-stage dl-stage dl-${state}`} ref={stageRef} title="Ye-Almaz dental lab">
      <div className={`robot-bubble ${bubble ? 'visible' : ''}`}>{bubble}</div>

      <svg viewBox="0 0 700 470" className="robot-svg dl-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A dental technician with a resin-printed aligner plate beside a 3D printer">
        <defs>
          <linearGradient id="dlBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f8fafc" /><stop offset="1" stopColor="#cfd8e3" /></linearGradient>
          <linearGradient id="dlHood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fb923c" stopOpacity="0.85" /><stop offset="1" stopColor="#ea580c" stopOpacity="0.95" /></linearGradient>
          <linearGradient id="dlScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0f2fe" /><stop offset="1" stopColor="#bae6fd" /></linearGradient>
          <radialGradient id="dlGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#fdba74" stopOpacity="0.9" /><stop offset="1" stopColor="#fdba74" stopOpacity="0" /></radialGradient>
        </defs>

        {/* floor shadows */}
        <ellipse cx="170" cy="418" rx="135" ry="12" fill="#0f172a" opacity="0.07" />
        <ellipse cx="585" cy="466" rx="120" ry="8" fill="#0f172a" opacity="0.06" />

        {/* wall bench + monitor */}
        <rect x="330" y="186" width="250" height="10" rx="4" fill="#cbd5e1" />
        <g transform="translate(352 66)">
          <rect x="52" y="86" width="16" height="34" fill="#94a3b8" />
          <rect width="120" height="88" rx="8" fill="#1e293b" />
          <rect x="6" y="6" width="108" height="72" rx="4" fill="url(#dlScreen)" />
          <g className="dl-scan-art" fill="none" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round">
            <path d="M26 56 C26 24 60 24 60 56" /><path d="M64 56 C64 30 94 30 94 56" />
            <path d="M34 54 C34 36 52 36 52 54" opacity="0.6" /><path d="M72 54 C72 40 86 40 86 54" opacity="0.6" />
          </g>
          <rect className="dl-scanline" x="6" y="6" width="108" height="3" fill="#0ea5e9" opacity="0.55" />
          <g className="dl-typing-lines" fill="#64748b">
            <rect x="16" y="14" width="64" height="5" rx="2.5" className="dl-line l1" />
            <rect x="16" y="24" width="48" height="5" rx="2.5" className="dl-line l2" />
            <rect x="16" y="34" width="72" height="5" rx="2.5" className="dl-line l3" />
            <rect x="92" y="34" width="3" height="5" className="dl-caret" fill="#0f172a" />
          </g>
          <g className="dl-tick"><circle cx="60" cy="42" r="20" fill="#22c55e" /><path d="M50 42 l8 8 l14 -16" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></g>
          <ellipse cx="60" cy="122" rx="30" ry="4" fill="#94a3b8" />
        </g>

        {/* 3D printer */}
        <g className="dl-printer">
          <rect x="50" y="272" width="240" height="128" rx="16" fill="url(#dlBody)" stroke="#cbd5e1" />
          <rect x="62" y="262" width="216" height="14" rx="6" fill="#e2e8f0" />
          <path d="M50 272 L50 160 Q50 132 78 132 L262 132 Q290 132 290 160 L290 272 Z" fill="url(#dlHood)" stroke="#c2410c" strokeOpacity="0.35" />
          <rect x="66" y="150" width="208" height="112" rx="10" fill="#7c2d12" opacity="0.22" />
          <ellipse className="dl-hood-glow" cx="170" cy="215" rx="95" ry="48" fill="url(#dlGlow)" />
          <rect x="236" y="150" width="9" height="108" rx="3" fill="#cbd5e1" />
          <g className="dl-plate">
            <rect x="96" y="194" width="146" height="10" rx="3" fill="#334155" />
            <rect x="236" y="190" width="14" height="18" rx="3" fill="#64748b" />
            {[0, 1, 2, 3, 4].map(i => (
              <path key={i} d={`M${106 + i * 27} 244 C${106 + i * 27} 214 ${130 + i * 27} 214 ${130 + i * 27} 244`} fill="none" stroke="#d8a574" strokeWidth="6" strokeLinecap="round" transform={`translate(0 -34)`} />
            ))}
          </g>
          <rect x="76" y="248" width="188" height="12" rx="4" fill="#fdba74" opacity="0.55" />
          <rect x="76" y="258" width="188" height="6" rx="3" fill="#94a3b8" opacity="0.55" />
          {/* privacy door */}
          <g className="dl-door">
            <rect x="62" y="142" width="216" height="124" rx="12" fill="#ea580c" />
            <rect x="62" y="142" width="216" height="124" rx="12" fill="none" stroke="#9a3412" strokeOpacity="0.4" strokeWidth="2" />
            <g transform="translate(170 204)"><rect x="-13" y="-4" width="26" height="22" rx="5" fill="#fff" /><path d="M-8 -4 v-6 a8 8 0 0 1 16 0 v6" fill="none" stroke="#fff" strokeWidth="4" /><circle cx="0" cy="7" r="3" fill="#ea580c" /></g>
          </g>
          {/* front panel */}
          <rect x="66" y="314" width="132" height="56" rx="9" fill="#0f172a" />
          <rect x="76" y="324" width="60" height="5" rx="2.5" fill="#334155" /><rect x="76" y="333" width="40" height="5" rx="2.5" fill="#334155" />
          <rect x="76" y="352" width="112" height="7" rx="3.5" fill="#1e293b" />
          <rect className="dl-progress" x="76" y="352" width="112" height="7" rx="3.5" fill="#38bdf8" />
          <circle className="dl-led" cx="254" cy="342" r="6" fill="#22c55e" />
          <rect x="222" y="330" width="44" height="6" rx="3" fill="#cbd5e1" /><rect x="222" y="348" width="44" height="6" rx="3" fill="#cbd5e1" />
        </g>

        {/* technician */}
        <g className="dl-tech">
          <g className="dl-breathe">
            <path d="M505 262 C480 300 470 380 476 470 L700 470 C704 380 700 310 676 272 C656 240 620 226 585 224 L540 224 C522 230 512 246 505 262 Z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
            <path d="M548 226 L575 304 L612 226 Z" fill="#cbd5e1" />
            <path d="M556 226 L574 296 M604 226 L580 296" stroke="#e2e8f0" strokeWidth="2" fill="none" />
            <rect x="620" y="330" width="42" height="34" rx="5" fill="none" stroke="#e2e8f0" strokeWidth="2" />
            <rect x="548" y="196" width="34" height="38" rx="10" fill="#e9b496" />
            {/* head */}
            <g className="dl-head" style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '565px 215px' }}>
              <circle cx="603" cy="112" r="21" fill="#1f2937" />
              <rect x="596" y="126" width="14" height="6" rx="3" fill="#f5c542" transform="rotate(25 603 129)" />
              <ellipse cx="565" cy="160" rx="40" ry="48" fill="#f0c4a4" />
              <path d="M527 158 q-11 11 1 18 q4 1 7 -2 z" fill="#f0c4a4" />
              <path d="M524 152 C520 108 548 92 575 96 C606 100 612 134 604 166 C596 142 580 128 560 128 C545 128 530 136 524 152 Z" fill="#1f2937" />
              <ellipse cx="597" cy="168" rx="7" ry="10" fill="#e6ae8f" />
              <circle cx="597" cy="180" r="2.6" fill="#f5c542" />
              <path d="M538 143 q10 -6 22 -1" fill="none" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
              <g className="dl-eye" transform="translate(549 157)">
                <ellipse rx="8.5" ry="6.5" fill="#fff" />
                <circle cx={gaze.x} cy={gaze.y} r="3.6" fill="#0f172a" style={{ transition: 'cx .25s, cy .25s' }} />
              </g>
              <circle cx="556" cy="177" r="7" fill="#f9a8a8" opacity="0.35" />
              <path className="dl-smile" d="M541 185 q10 7 21 0" fill="none" stroke="#b45309" strokeWidth="2.6" strokeLinecap="round" />
              <path className="dl-smile-big" d="M539 184 q11 12 24 0 q-12 5 -24 0 z" fill="#b45309" />
            </g>
            {/* arm, glove and the plate she is holding */}
            <path d="M524 246 C484 250 444 264 414 280 L420 304 C456 296 494 288 534 288 Z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
            <rect x="414" y="276" width="14" height="30" rx="5" fill="#e2e8f0" transform="rotate(-8 421 291)" />
          </g>
          <g className="dl-held">
            <g transform="translate(296 208) rotate(-13 62 40)">
              <rect width="124" height="82" rx="8" fill="#1f2937" />
              <rect x="7" y="7" width="110" height="68" rx="5" fill="#9aa8ba" />
              <Arch x={16} y={16} s={0.9} /><Arch x={50} y={14} s={0.9} /><Arch x={84} y={16} s={0.9} />
              <Arch x={16} y={44} s={0.9} /><Arch x={50} y={44} s={0.9} /><Arch x={84} y={44} s={0.9} />
            </g>
            <g className="dl-glove">
              <ellipse cx="404" cy="284" rx="24" ry="17" fill="#3b82f6" transform="rotate(-12 404 284)" />
              <path d="M386 272 q-10 -10 -2 -18 q8 -5 12 4 l6 12 z" fill="#3b82f6" />
              <path d="M392 296 q-4 8 4 10 M406 300 q0 8 8 8" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
            </g>
          </g>
          <g className="dl-sparkles" fill="#fbbf24">
            <path className="s1" d="M330 196 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" />
            <path className="s2" d="M420 214 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 z" />
            <path className="s3" d="M290 250 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" />
          </g>
        </g>
      </svg>
    </div>
  );
}
