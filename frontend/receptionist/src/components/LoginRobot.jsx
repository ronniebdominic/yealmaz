import { useState, useEffect, useRef } from 'react';


export default function InteractiveRobot({
  activeField = null,
  formStatus = 'idle',
  email = '',
  isTyping = false,
  typingField = null,
}) {
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [pinkBlinking, setPinkBlinking] = useState(false);
  const [starBlinking, setStarBlinking] = useState(false);
  const [purpleBlinking, setPurpleBlinking] = useState(false);
  const [sparkles, setSparkles] = useState([]);
  const containerRef = useRef(null);

  // Mouse tracking for pupil movement & look direction
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width * 0.45;
      const centerY = rect.top + rect.height * 0.5;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);
      const maxDistance = 420;

      const clampedDist = Math.min(distance / maxDistance, 1);
      const angle = Math.atan2(deltaY, deltaX);

      setMouseOffset({
        x: Math.cos(angle) * clampedDist * 5.5,
        y: Math.sin(angle) * clampedDist * 4.0,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Robot blinking cycle
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 160);
    }, 3400);

    return () => clearInterval(blinkInterval);
  }, []);

  // Pink character blinking cycle
  useEffect(() => {
    const pinkBlinkInterval = setInterval(() => {
      setPinkBlinking(true);
      setTimeout(() => setPinkBlinking(false), 180);
    }, 4200);

    return () => clearInterval(pinkBlinkInterval);
  }, []);

  // Star character blinking cycle (Lively open-close eyes)
  useEffect(() => {
    const starBlinkInterval = setInterval(() => {
      setStarBlinking(true);
      setTimeout(() => setStarBlinking(false), 180);
    }, 2800);

    return () => clearInterval(starBlinkInterval);
  }, []);

  // Purple character blinking cycle
  useEffect(() => {
    const purpleBlinkInterval = setInterval(() => {
      setPurpleBlinking(true);
      setTimeout(() => setPurpleBlinking(false), 180);
    }, 3600);

    return () => clearInterval(purpleBlinkInterval);
  }, []);

  // Click reaction sparkles
  const handleStageClick = () => {
    const newSparkles = Array.from({ length: 8 }).map((_, i) => ({
      id: Date.now() + i,
      x: 240 + (Math.random() - 0.5) * 260,
      y: 110 + (Math.random() - 0.5) * 110,
      size: 4 + Math.random() * 5,
    }));
    setSparkles(newSparkles);
    setTimeout(() => setSparkles([]), 900);
  };

  // Interaction & Typing States
  const isPasswordFocused = activeField === 'password' || typingField === 'password';
  const isTypingUsername = isTyping && (typingField === 'username' || activeField === 'username');
  const isTypingEmail = isTyping && (typingField === 'email' || activeField === 'email');
  const isTypingCredentials = isTyping && (isTypingUsername || isTypingEmail);
  const isLookingAtForm = (activeField === 'username' || activeField === 'email') && !isTyping;

  // Inter-character gaze calculations:
  // When user is typing credentials, the squad turns to look at EACH OTHER with lively chatter!
  let robotPupilX = mouseOffset.x;
  let robotPupilY = mouseOffset.y;
  let isPeeking = false;

  if (isPasswordFocused) {
    isPeeking = true;
  } else if (isTypingCredentials) {
    // Robot glances right, directly at Pink Companion!
    robotPupilX = 5.2;
    robotPupilY = 0.5;
  } else if (isLookingAtForm) {
    robotPupilX = 5.5;
    robotPupilY = 1.0;
  }

  // Pink gaze:
  let pinkPupilX = mouseOffset.x * 0.85;
  let pinkPupilY = mouseOffset.y * 0.85;
  if (isTypingCredentials) {
    // Pink glances left, directly back at Blue Robot!
    pinkPupilX = -4.5;
    pinkPupilY = 0.5;
  } else if (isLookingAtForm) {
    pinkPupilX = 4.5;
    pinkPupilY = 0.5;
  }

  // Star gaze:
  let starPupilX = mouseOffset.x * 0.7;
  let starPupilY = mouseOffset.y * 0.7;
  if (isTypingCredentials) {
    // Star leans and looks down-left towards Teal Cube & Pink
    starPupilX = -2.0;
    starPupilY = 2.5;
  } else if (isLookingAtForm) {
    starPupilX = 3.5;
    starPupilY = 0.4;
  }

  // Orange Cyclops gaze:
  let orangePupilX = mouseOffset.x * 0.65;
  let orangePupilY = mouseOffset.y * 0.65;
  if (isPasswordFocused) {
    orangePupilX = 5.2;
    orangePupilY = 0.2;
  } else if (isTypingCredentials) {
    // Looks left towards Star, Teal & the squad!
    orangePupilX = -4.0;
    orangePupilY = 0.2;
  } else if (isLookingAtForm) {
    orangePupilX = 3.0;
    orangePupilY = 0.3;
  }

  // Purple gaze:
  let purplePupilX = mouseOffset.x * 0.6;
  let purplePupilY = mouseOffset.y * 0.6;
  if (isTypingCredentials) {
    // Grooves and looks left towards Orange & Star!
    purplePupilX = -3.5;
    purplePupilY = 0.2;
  } else if (isLookingAtForm) {
    purplePupilX = 3.0;
    purplePupilY = 0.3;
  }

  return (
    <div
      className="robot-stage"
      ref={containerRef}
      onClick={handleStageClick}
      title="Interactive companions squad"
    >
      {/* Speech / Reaction Bubble: Dynamic inter-character chatter */}
      <div className={`robot-bubble ${activeField || isTyping ? 'visible' : ''}`}>
        {isPasswordFocused && "🙈 Shhh — we won't peek!"}
        {!isPasswordFocused && isTypingEmail && (email ? "💌 Got it — looking you up…" : "📧 Typing your email…")}
        {!isPasswordFocused && !isTyping && activeField === 'email' && "👋 Welcome to Ye-Almaz! What's your email?"}
        {!activeField && formStatus === 'success' && "🎉 Welcome back!"}
      </div>

      {/* Main Vector SVG Scene with All 6 Characters */}
      <svg
        viewBox="0 -90 690 460"
        className="robot-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Blue Robot Body Gradient */}
          <linearGradient id="robotBlueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3E83F6" />
            <stop offset="60%" stopColor="#2E6EEA" />
            <stop offset="100%" stopColor="#1E5AD6" />
          </linearGradient>

          {/* Robot Bevel Rim */}
          <linearGradient id="robotBevelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1C4BB8" />
            <stop offset="100%" stopColor="#153E9E" />
          </linearGradient>

          {/* Pink Character Gradient */}
          <linearGradient id="pinkBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FA67C7" />
            <stop offset="70%" stopColor="#F554BF" />
            <stop offset="100%" stopColor="#E03EA8" />
          </linearGradient>

          {/* Golden Star Body Gradient */}
          <linearGradient id="starGoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="45%" stopColor="#FFCA28" />
            <stop offset="100%" stopColor="#FFB300" />
          </linearGradient>

          {/* Star Lower Bevel */}
          <linearGradient id="starBevelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFA000" />
            <stop offset="100%" stopColor="#E65100" />
          </linearGradient>

          {/* Teal Cube Gradient */}
          <linearGradient id="tealCubeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#30E8C3" />
            <stop offset="70%" stopColor="#22D3AB" />
            <stop offset="100%" stopColor="#13B892" />
          </linearGradient>

          {/* Teal Cube Bevel */}
          <linearGradient id="tealCubeBevel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#109B7A" />
            <stop offset="100%" stopColor="#0B795F" />
          </linearGradient>

          {/* Mint Neon Glow */}
          <filter id="mintGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.0" floodColor="#2EE8C2" floodOpacity="0.7" />
          </filter>

          {/* Golden Shimmer Glow */}
          <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#FFC107" floodOpacity="0.5" />
          </filter>

          {/* Orange Character Sphere 3D Gradients */}
          <radialGradient id="orangeSphereGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFA04D" />
            <stop offset="50%" stopColor="#FF7315" />
            <stop offset="100%" stopColor="#E65100" />
          </radialGradient>
          <radialGradient id="orangeHeadGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFAA5E" />
            <stop offset="50%" stopColor="#FF7A1F" />
            <stop offset="100%" stopColor="#E65100" />
          </radialGradient>

          {/* Purple Triangle Gradients */}
          <linearGradient id="purpleTriangleGrad" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>

          {/* Hula Hoop Neon Glow Filter */}
          <filter id="hulaGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.0" floodColor="#00F5D4" floodOpacity="0.85" />
          </filter>

          {/* Visor Glare */}
          <linearGradient id="robotVisorReflection" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.12)" />
            <stop offset="35%" stopColor="rgba(255, 255, 255, 0.02)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </linearGradient>
        </defs>

        {/* ===================================================
            FLOOR SHADOWS
            =================================================== */}
        {/* Blue Robot Shadow */}
        <ellipse cx="92" cy="332" rx="40" ry="7" fill="rgba(15, 23, 42, 0.10)" />
        {/* Pink Character Shadow */}
        <ellipse cx="238" cy="332" rx="55" ry="8" fill="rgba(15, 23, 42, 0.11)" />
        {/* Teal Cube & Star Combined Floor Shadow */}
        <ellipse cx="388" cy="332" rx="58" ry="9" fill="rgba(15, 23, 42, 0.12)" />
        {/* Orange Figure-8 Shadow */}
        <ellipse cx="498" cy="332" rx="36" ry="7" fill="rgba(15, 23, 42, 0.10)" />
        {/* Purple Triangle Shadow */}
        <ellipse cx="597" cy="332" rx="45" ry="8" fill="rgba(15, 23, 42, 0.11)" />

        {/* ===================================================
            1. BLUE ROBOT (LEFT)
            =================================================== */}
        <g id="blue-robot-character" className={`blue-robot-wrapper ${isTypingCredentials ? 'squad-interact-robot-typing' : ''} ${isPasswordFocused ? 'squad-interact-robot-shy' : ''}`}>
          {/* Static Stick Legs */}
          <rect x="76" y="262" width="7.5" height="42" rx="2" fill="#091E30" />
          <rect x="108" y="262" width="7.5" height="42" rx="2" fill="#091E30" />

          {/* Cyan Boots */}
          <g className="robot-left-boot">
            <rect x="73" y="282" width="13" height="17" rx="2.5" fill="#00DDB3" />
            <path
              d="M 86 284 L 86 300 A 3 3 0 0 1 83 303 L 62 303 A 5 5 0 0 1 57 298 L 57 295 A 5 5 0 0 1 62 290 L 73 290 L 73 284 Z"
              fill="#00DDB3"
            />
          </g>
          <g className="robot-right-boot">
            <rect x="105" y="282" width="13" height="17" rx="2.5" fill="#00DDB3" />
            <rect x="105" y="288" width="13" height="15" rx="6" fill="#00DDB3" />
          </g>

          {/* Head & Body Group: Moves neck left/right naturally or tilts towards squad */}
          <g className={`robot-head-body ${isTypingCredentials ? 'interact-tilt-pink' : isLookingAtForm ? 'focus-right' : 'idle-look-around'}`}>
            {/* Dark Arms on Hips */}
            <path
              d="M 36 186 C 6 184, 2 230, 38 222"
              stroke="#091E30"
              strokeWidth="10.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M 148 186 C 178 184, 182 230, 146 222"
              stroke="#091E30"
              strokeWidth="10.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Blue Torso Chassis */}
            <rect x="42" y="196" width="100" height="74" rx="22" ry="22" fill="url(#robotBevelGrad)" />
            <rect x="42" y="193" width="100" height="72" rx="22" ry="22" fill="url(#robotBlueGrad)" />

            {/* Mint Antenna & Light */}
            <line x1="92" y1="122" x2="92" y2="152" stroke="#2EE8C2" strokeWidth="4.5" strokeLinecap="round" />
            <circle cx="92" cy="116" r="8" fill="#2EE8C2" filter="url(#mintGlow)" id="robot-antenna-glow" />

            {/* Blue Head Chassis */}
            <rect x="36" y="148" width="112" height="66" rx="24" ry="24" fill="url(#robotBevelGrad)" />
            <rect x="36" y="145" width="112" height="64" rx="24" ry="24" fill="url(#robotBlueGrad)" />

            {/* Visor */}
            <rect x="50" y="156" width="84" height="50" rx="10" ry="10" fill="#06080F" />
            <rect x="50" y="156" width="84" height="50" rx="10" ry="10" fill="url(#robotVisorReflection)" />

            {/* Eyes */}
            {!isPeeking ? (
              <g style={{ transformOrigin: '92px 181px' }} className={isBlinking ? 'blinking' : ''}>
                <circle cx="72" cy="181" r="12.5" fill="#2EE8C2" filter="url(#mintGlow)" />
                <circle cx={72 + robotPupilX} cy={181 + robotPupilY} r="7" fill="#06080F" />

                <circle cx="112" cy="181" r="12.5" fill="#2EE8C2" filter="url(#mintGlow)" />
                <circle cx={112 + robotPupilX} cy={181 + robotPupilY} r="7" fill="#06080F" />
              </g>
            ) : (
              <g id="robot-eyes-shy">
                <path d="M 66 177 L 72 182 L 66 187" stroke="#2EE8C2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#mintGlow)" />
                <path d="M 118 177 L 112 182 L 118 187" stroke="#2EE8C2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#mintGlow)" />
                <circle cx="60" cy="189" r="3.5" fill="#FF5376" opacity="0.7" />
                <circle cx="124" cy="189" r="3.5" fill="#FF5376" opacity="0.7" />
              </g>
            )}

            {/* Lower Console */}
            <g id="robot-lower-console">
              <rect x="55" y="216" width="42" height="18" rx="4" fill="#0A1828" />
              <rect x="59" y="220" width="24" height="3" rx="1.5" fill="#2EE8C2" />
              <rect x="59" y="226" width="24" height="3" rx="1.5" fill="#2EE8C2" />
              <circle cx="90" cy="221.5" r="1.6" fill="#2EE8C2" />
              <circle cx="90" cy="227.5" r="1.6" fill="#2EE8C2" />

              <circle cx="106" cy="225" r="5.5" fill="#2EE8C2" className="interactive-btn" />
              <circle cx="120" cy="225" r="5.5" fill="#FF5722" className="interactive-btn" />
            </g>
          </g>
        </g>

        {/* ===================================================
            2. PINK COMPANION (CENTER) - Vibing to Music & Interacting
            =================================================== */}
        <g id="pink-companion-character" className={`pink-character-group ${isTypingCredentials ? 'squad-interact-pink-typing' : ''} ${isPasswordFocused ? 'squad-interact-pink-shy' : ''}`}>
          {/* Long Stick Legs */}
          <rect x="210" y="242" width="9" height="64" rx="2" fill="#083832" />
          <rect x="264" y="242" width="9" height="64" rx="2" fill="#083832" />

          {/* Yellow Socks */}
          <rect x="205" y="299" width="19" height="14" rx="2.5" fill="#FFB800" />
          <rect x="259" y="299" width="19" height="14" rx="2.5" fill="#FFB800" />

          {/* Cyan Shoes */}
          <g className="pink-left-shoe">
            <rect x="205" y="309" width="19" height="15" rx="3" fill="#00E5BC" />
            <path
              d="M 224 311 L 224 324 A 4 4 0 0 1 220 328 L 193 328 A 6 6 0 0 1 187 322 L 187 318 A 6 6 0 0 1 193 312 L 205 312 L 205 311 Z"
              fill="#00E5BC"
            />
          </g>
          <g className="pink-right-shoe">
            <rect x="259" y="309" width="19" height="19" rx="7.5" fill="#00E5BC" />
          </g>

          {/* Head & Body Group: Grooves to music beat */}
          <g className="pink-body-head">
            {/* Curly Dark Green Hair */}
            <g id="pink-hair" fill="#0A4138">
              <circle cx="190" cy="94" r="15" />
              <circle cx="210" cy="74" r="18" />
              <circle cx="236" cy="65" r="20" />
              <circle cx="264" cy="72" r="19" />
              <circle cx="286" cy="91" r="15" />
            </g>

            {/* Mint Headphones Arch */}
            <path
              d="M 163 146 C 159 70, 313 70, 309 146"
              stroke="#4FE0C1"
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
            />

            {/* Striped Sweatband */}
            <g id="sweatband">
              <clipPath id="sweatbandClip">
                <rect x="180" y="93" width="112" height="23" rx="7" />
              </clipPath>
              <g clipPath="url(#sweatbandClip)">
                <rect x="180" y="93" width="112" height="23" fill="#FFAE00" />
                <rect x="188" y="93" width="13" height="23" fill="#FF6D00" />
                <rect x="209" y="93" width="13" height="23" fill="#FF6D00" />
                <rect x="230" y="93" width="13" height="23" fill="#FF6D00" />
                <rect x="251" y="93" width="13" height="23" fill="#FF6D00" />
                <rect x="272" y="93" width="13" height="23" fill="#FF6D00" />
              </g>
            </g>

            {/* Earcups with Sound Waves */}
            <g className="earcup-group-left">
              <ellipse cx="164" cy="148" rx="13" ry="24" stroke="#4FE0C1" strokeWidth="2.4" fill="none" className="music-wave wave-1" />
              <ellipse cx="164" cy="148" rx="19" ry="30" stroke="#4FE0C1" strokeWidth="1.6" fill="none" className="music-wave wave-2" />
              <rect x="153" y="126" width="21" height="44" rx="10.5" fill="#4FE0C1" className="pink-earcup" />
            </g>
            <g className="earcup-group-right">
              <ellipse cx="297" cy="148" rx="13" ry="24" stroke="#4FE0C1" strokeWidth="2.4" fill="none" className="music-wave wave-1" />
              <ellipse cx="297" cy="148" rx="19" ry="30" stroke="#4FE0C1" strokeWidth="1.6" fill="none" className="music-wave wave-2" />
              <rect x="296" y="126" width="21" height="44" rx="10.5" fill="#4FE0C1" className="pink-earcup" />
            </g>

            {/* Floating Music Notes */}
            <g className="floating-music-notes">
              <path d="M 326 122 A 4 3 0 1 1 322 126 L 327 106 L 336 109 L 328 111 Z" fill="#FF4081" className="music-note note-1" />
              <path d="M 136 120 A 3.5 2.8 0 1 1 133 124 L 137 106 L 150 103 L 150 119 A 3.5 2.8 0 1 1 146 123 L 150 108 L 137 111 Z" fill="#2EE8C2" className="music-note note-2" />
              <path d="M 312 90 A 3.8 3 0 1 1 308 94 L 313 77 L 322 81 L 314 83 Z" fill="#FFAE00" className="music-note note-3" />
            </g>

            {/* Fluffy Body */}
            <path
              d="M 183 116 C 183 106, 196 102, 215 102 L 257 102 C 276 102, 289 106, 289 116 L 308 218 C 312 234, 300 243, 285 243 L 187 243 C 172 243, 160 234, 164 218 Z"
              fill="url(#pinkBodyGrad)"
            />

            {/* Right Arm on Hip */}
            <path d="M 300 197 C 324 202, 324 235, 298 229" stroke="#083832" strokeWidth="10" strokeLinecap="round" fill="none" />

            {/* Face Eyes: Normal or Bashful (Password Mode) */}
            {!isPasswordFocused ? (
              <g style={{ transformOrigin: '236px 168px' }} className={pinkBlinking ? 'blinking' : ''}>
                <g id="pink-left-eye">
                  <ellipse cx="208" cy="166" rx="17" ry="13.5" fill="#FFFFFF" />
                  <circle cx={208 + pinkPupilX} cy={166 + pinkPupilY} r="10" fill="#06080F" />
                  <circle cx={205 + pinkPupilX * 0.5} cy={163 + pinkPupilY * 0.5} r="3" fill="#FFFFFF" />
                  <path d="M 193 180 Q 208 184 223 180" stroke="#C20078" strokeWidth="3" strokeLinecap="round" fill="none" />
                </g>
                <g id="pink-right-eye">
                  <ellipse cx="265" cy="166" rx="17" ry="13.5" fill="#FFFFFF" />
                  <circle cx={265 + pinkPupilX} cy={166 + pinkPupilY} r="10" fill="#06080F" />
                  <circle cx={262 + pinkPupilX * 0.5} cy={163 + pinkPupilY * 0.5} r="3" fill="#FFFFFF" />
                  <path d="M 250 180 Q 265 184 280 180" stroke="#C20078" strokeWidth="3" strokeLinecap="round" fill="none" />
                </g>
              </g>
            ) : (
              <g id="pink-eyes-shy" style={{ transformOrigin: '236px 168px' }}>
                <path d="M 195 168 Q 208 158 221 168" stroke="#06080F" strokeWidth="3.6" strokeLinecap="round" fill="none" />
                <path d="M 252 168 Q 265 158 278 168" stroke="#06080F" strokeWidth="3.6" strokeLinecap="round" fill="none" />
                <circle cx="200" cy="178" r="6" fill="#FF1744" opacity="0.6" />
                <circle cx="273" cy="178" r="6" fill="#FF1744" opacity="0.6" />
              </g>
            )}

            {/* Cute Smile */}
            <path d="M 224 186 C 228 180, 234 182, 237 187 C 240 182, 246 180, 250 186 C 253 201, 221 201, 224 186 Z" fill="#06080F" />
            <path d="M 230 194 Q 237 189 244 194 Q 237 199 230 194 Z" fill="#FFA6D0" />
          </g>
        </g>

        {/* ===================================================
            3. GOLDEN STAR CHARACTER ON STILTS (BACKGROUND / TALL)
            =================================================== */}
        <g id="golden-star-character" className={`golden-star-group ${isTypingCredentials ? 'squad-interact-star-typing' : ''} ${isPasswordFocused ? 'squad-interact-star-shy' : ''}`}>
          {/* Long Stilt Legs (Passing behind Teal Cube, extra tall) */}
          <rect x="372" y="56" width="9.5" height="240" rx="3" fill="#083832" className="star-stilt-left" />
          <rect x="395" y="56" width="9.5" height="240" rx="3" fill="#083832" className="star-stilt-right" />

          {/* Elevated & Scaled Golden Star Body (Taller & Bigger) */}
          <g className="star-upper-wrapper" transform="translate(388, 60) scale(1.55) translate(-388, -138)">
            {/* Floating Sparkle Particles around Star */}
            <text x="440" y="60" fontSize="8" className="star-sparkle-particle sp-1">✦</text>
            <text x="330" y="75" fontSize="10" className="star-sparkle-particle sp-2">✧</text>
            <text x="455" y="105" fontSize="7" className="star-sparkle-particle sp-3">⭑</text>

            {/* Star Upper Body & Head (Excited bouncy sway) */}
            <g className="star-sway-body">
              {/* Star Arms - With Independent Wave Animation */}
              <g className="star-left-arm">
                <path d="M 358 138 C 338 148, 332 192, 348 214" stroke="#083832" strokeWidth="9" strokeLinecap="round" fill="none" />
              </g>
              <g className="star-right-arm">
                <path d="M 420 138 C 442 148, 452 182, 464 204" stroke="#083832" strokeWidth="9" strokeLinecap="round" fill="none" />
              </g>

              {/* Star 3D Bevel Shadow Facets */}
              <path
                d="M 388 52 
                   L 403 91 L 444 96 L 413 124 L 424 164 L 388 143 L 352 164 L 363 124 L 332 96 L 373 91 Z"
                fill="url(#starBevelGrad)"
                transform="translate(0, 3)"
              />

              {/* Golden Star Main Body (5 rounded points) */}
              <path
                d="M 388 50 
                   L 404 89 L 445 94 L 414 122 L 425 162 L 388 141 L 351 162 L 362 122 L 331 94 L 372 89 Z"
                fill="url(#starGoldGrad)"
                stroke="#FFAE00"
                strokeWidth="2.5"
                strokeLinejoin="round"
                filter="url(#goldGlow)"
              />

              {/* Golden Shimmer Overlay */}
              <path
                d="M 388 50 
                   L 404 89 L 445 94 L 414 122 L 425 162 L 388 141 L 351 162 L 362 122 L 331 94 L 372 89 Z"
                fill="rgba(255, 255, 255, 0.15)"
                className="star-shimmer-overlay"
              />

              {/* Clinging Dark Pet Kitten (on the star's left arm point) */}
              <g id="star-clinging-pet" className="clinging-pet">
                {/* Pet Body & Head */}
                <circle cx="316" cy="102" r="14" fill="#0F2B38" />
                {/* Left Ear */}
                <path d="M 307 92 L 312 99 L 304 100 Z" fill="#0F2B38" />
                {/* Right Ear */}
                <path d="M 321 90 L 324 98 L 317 98 Z" fill="#0F2B38" />
                {/* Eyes */}
                <circle cx="312" cy="102" r="2.4" fill="#FFFFFF" />
                <circle cx="319" cy="102" r="2.4" fill="#FFFFFF" />
                <circle cx="312.5" cy="102" r="1.2" fill="#000" />
                <circle cx="319.5" cy="102" r="1.2" fill="#000" />
                {/* Tiny Cute Nose */}
                <ellipse cx="315.5" cy="106" rx="1.5" ry="1" fill="#2A4F5C" />
                {/* Paws grasping star point */}
                <ellipse cx="327" cy="108" rx="4" ry="5" fill="#0F2B38" />
                <ellipse cx="318" cy="116" rx="4" ry="5" fill="#0F2B38" />
                {/* Tiny tail curl */}
                <path d="M 302 108 C 296 106, 294 114, 300 112" stroke="#0F2B38" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              </g>

              {/* Scaled & Enlarged Face Features (Face Thora Bada) */}
              <g id="star-face-features" transform="translate(388, 118) scale(1.25) translate(-388, -118)">
                {/* Expressive Big Anime Eyes (matching Pink Companion, slightly smaller) */}
                {!isPasswordFocused ? (
                  <g
                    id="star-eyes"
                    style={{ transformOrigin: '388px 111px' }}
                    className={starBlinking ? 'blinking' : ''}
                  >
                    {/* Left Eye */}
                    <g id="star-left-eye">
                      <ellipse cx="371" cy="111" rx="10.2" ry="8.2" fill="#FFFFFF" />
                      <circle cx={371 + starPupilX} cy={111 + starPupilY} r="5.8" fill="#081E28" />
                      <circle cx={369 + starPupilX * 0.5} cy={109 + starPupilY * 0.5} r="1.8" fill="#FFFFFF" />
                    </g>

                    {/* Right Eye */}
                    <g id="star-right-eye">
                      <ellipse cx="405" cy="111" rx="10.2" ry="8.2" fill="#FFFFFF" />
                      <circle cx={405 + starPupilX} cy={111 + starPupilY} r="5.8" fill="#081E28" />
                      <circle cx={403 + starPupilX * 0.5} cy={109 + starPupilY * 0.5} r="1.8" fill="#FFFFFF" />
                    </g>
                  </g>
                ) : (
                  <g id="star-eyes-shy" style={{ transformOrigin: '388px 111px' }}>
                    <path d="M 363 113 Q 371 106 379 113" stroke="#081E28" strokeWidth="2.6" strokeLinecap="round" fill="none" />
                    <path d="M 397 113 Q 405 106 413 113" stroke="#081E28" strokeWidth="2.6" strokeLinecap="round" fill="none" />
                  </g>
                )}

                {/* Star Mouth - Realistic Organic Talking / Singing Animation */}
                <g id="star-mouth" className="star-mouth-realistic">
                  {/* Mouth Cavity with naturally curved smile top and deep dropping lower jaw */}
                  <path
                    d="M 374 126 C 380 128.5, 396 128.5, 402 126 C 405 142, 371 142, 374 126 Z"
                    fill="#081E28"
                  />

                  {/* Inner Details: Tooth & Tongue (smoothly visible when mouth opens) */}
                  <g className="star-mouth-inner">
                    {/* Cute white tooth attached under upper lip */}
                    <rect x="384.5" y="125" width="7" height="4.5" rx="1.5" fill="#FFFFFF" />
                    {/* Pink bouncy tongue */}
                    <ellipse cx="388" cy="136" rx="7" ry="4" fill="#FF4081" />
                    <ellipse cx="388" cy="137.5" rx="5" ry="2.5" fill="#FF80AB" />
                  </g>

                  {/* Smile Upper Lip Contour */}
                  <path
                    d="M 373 126 C 379 128.5, 397 128.5, 403 126"
                    stroke="#081E28"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>
              </g>
            </g>
          </g>
        </g>

        {/* ===================================================
            4. TEAL CUBE CHARACTER (FOREGROUND - IN FRONT OF STILTS)
            =================================================== */}
        <g id="teal-cube-character" className={`teal-cube-group ${isTypingCredentials ? 'squad-interact-cube-typing' : ''} ${isPasswordFocused ? 'squad-interact-cube-shy' : ''}`}>
          {/* Feet / Cyan Shoes - Tap Dancing */}
          <g className="cube-left-foot">
            <rect x="354" y="312" width="18" height="17" rx="7" fill="#00DDB3" />
          </g>
          <g className="cube-right-foot">
            <rect x="406" y="312" width="18" height="17" rx="7" fill="#00DDB3" />
            <path d="M 424 314 L 424 326 A 4 4 0 0 1 420 330 L 406 330 A 4 4 0 0 1 402 326 L 402 314 Z" fill="#00DDB3" />
          </g>

          {/* Floating Heart/Star Particles */}
          <text x="330" y="240" fontSize="10" className="cube-float-particle particle-1">💚</text>
          <text x="450" y="245" fontSize="9" className="cube-float-particle particle-2">✨</text>
          <text x="388" y="220" fontSize="11" className="cube-float-particle particle-3">⭐</text>

          {/* Squishy Cube Marshmallow Body */}
          <g className="teal-cube-body">
            {/* Bevel Rim */}
            <rect x="335" y="235" width="106" height="96" rx="28" ry="28" fill="url(#tealCubeBevel)" />
            {/* Main Rounded Teal Chassis */}
            <rect x="335" y="231" width="106" height="94" rx="28" ry="28" fill="url(#tealCubeGrad)" />

            {/* Cute Arms - Now With Individual Swinging Animation */}
            {/* Left Arm: akimbo curve */}
            <g className="cube-left-arm">
              <path d="M 338 274 C 314 284, 312 312, 332 318" stroke="#083832" strokeWidth="9.5" strokeLinecap="round" fill="none" />
            </g>
            {/* Right Arm: friendly open gesture */}
            <g className="cube-right-arm">
              <path d="M 438 274 C 460 284, 464 310, 444 318" stroke="#083832" strokeWidth="9.5" strokeLinecap="round" fill="none" />
            </g>

            {/* Happy Curved Closed Arc Eyes (^ ^) with wiggle */}
            <g id="cube-eyes" className="cube-eyes-group">
              {/* Left Eye: Happy Arc */}
              <path d="M 360 256 Q 369 247 378 256" stroke="#061824" strokeWidth="4" strokeLinecap="round" fill="none" />
              {/* Right Eye: Happy Arc */}
              <path d="M 398 256 Q 407 247 416 256" stroke="#061824" strokeWidth="4" strokeLinecap="round" fill="none" />
            </g>

            {/* Cute Wide Open Smile with cheerful chomp animation */}
            <g className="cube-mouth-group">
              <path d="M 380 270 C 383 266, 393 266, 396 270 C 399 284, 377 284, 380 270 Z" fill="#061824" />
              <path d="M 384 276 Q 388 272 392 276 Q 388 281 384 276 Z" fill="#FFA6D0" />
            </g>
          </g>
        </g>

        {/* ===================================================
            5. ORANGE STACKED SPHERES (FIGURE-8 CHARACTER)
            =================================================== */}
        <g id="orange-character" className={`orange-group ${isTypingCredentials ? 'squad-interact-orange-typing' : ''} ${isPasswordFocused ? 'squad-interact-orange-shy' : ''}`} transform="translate(30, 0)">
          {/* Stick Legs */}
          <rect x="456" y="260" width="8.5" height="66" rx="2" fill="#083832" />
          <rect x="480" y="260" width="8.5" height="66" rx="2" fill="#083832" />

          {/* Boots with cream cuffs */}
          <g className="orange-left-boot">
            <rect x="454" y="318" width="13" height="6" rx="1.5" fill="#FFEAA7" />
            <rect x="448" y="322" width="20" height="12" rx="4" fill="#00DDB3" />
          </g>
          <g className="orange-right-boot">
            <rect x="478" y="318" width="13" height="6" rx="1.5" fill="#FFEAA7" />
            <rect x="474" y="322" width="20" height="12" rx="4" fill="#00DDB3" />
          </g>

          {/* Orange Body and Head Group with Sway */}
          <g className="orange-body-sway">
            {/* Left Arm: noodle curving downwards */}
            <path
              d="M 436 218 C 420 226, 420 256, 434 266"
              stroke="#083832"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
              className="orange-left-arm"
            />
            {/* Right Arm: bent akimbo / resting */}
            <path
              d="M 500 216 C 522 224, 520 248, 502 254"
              stroke="#083832"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
              className="orange-right-arm"
            />

            {/* Bottom Sphere (Body) */}
            <circle cx="468" cy="225" r="42" fill="url(#orangeSphereGrad)" />

            {/* Cyclops Eye (Horizontal Pill) on Bottom Sphere with Blink */}
            <g id="orange-bottom-eye" className="orange-eye-blink">
              <rect x="456" y="209" width="24" height="13" rx="6.5" fill="#FFFFFF" />
              <rect x="456" y="209" width="24" height="13" rx="6.5" fill="#06121E" />
              <circle cx={468 + orangePupilX} cy={215.5 + orangePupilY} r="4.2" fill="#FFFFFF" />
              <circle cx={469 + orangePupilX} cy={214.5 + orangePupilY} r="1.5" fill="#FFFFFF" />
            </g>

            {/* Cute Freckles on Cheeks */}
            <circle cx="445" cy="220" r="1.2" fill="#7C2D12" />
            <circle cx="449" cy="223" r="1.3" fill="#7C2D12" />
            <circle cx="453" cy="221" r="1.2" fill="#7C2D12" />
            <circle cx="447" cy="225" r="1.1" fill="#7C2D12" />

            <circle cx="483" cy="220" r="1.2" fill="#7C2D12" />
            <circle cx="487" cy="223" r="1.3" fill="#7C2D12" />
            <circle cx="491" cy="221" r="1.2" fill="#7C2D12" />
            <circle cx="488" cy="225" r="1.1" fill="#7C2D12" />

            {/* Bottom Sphere Mouth: Realistic Organic Talking / Open-Close Animation */}
            <g id="orange-bottom-mouth" className="orange-mouth-realistic">
              {/* Mouth Cavity */}
              <path
                d="M 458 231 C 462 227, 474 227, 478 231 C 481 243, 455 243, 458 231 Z"
                fill="#06121E"
              />

              {/* Inner Details: Tooth & Tongue (smoothly visible when mouth opens) */}
              <g className="orange-mouth-inner">
                {/* Cute white tooth attached under upper lip */}
                <rect x="465.5" y="229" width="5" height="4" rx="1.2" fill="#FFFFFF" />
                {/* Pink bouncy tongue */}
                <ellipse cx="468" cy="239" rx="5" ry="2.8" fill="#FF4081" />
                <ellipse cx="468" cy="239.8" rx="3.8" ry="1.8" fill="#FF80AB" />
              </g>

              {/* Smile Upper Lip Contour for clean, crisp closed smile */}
              <path
                d="M 457.5 231 C 461.5 227, 474.5 227, 478.5 231"
                stroke="#06121E"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Top Sphere (Head) with Bobbing Motion */}
            <g className="orange-head-bob">
              <circle cx="468" cy="148" r="34" fill="url(#orangeHeadGrad)" />

              {/* Top Face (Looking to the left at the squad) */}
              <g id="orange-top-eye">
                {/* Horizontal white pill eye looking left */}
                <rect x="442" y="141" width="18" height="11" rx="5.5" fill="#FFFFFF" />
                <rect x="442" y="141" width="18" height="11" rx="5.5" fill="#06121E" />
                <circle cx={448 + orangePupilX * 0.7} cy={146.5 + orangePupilY * 0.7} r="3.8" fill="#FFFFFF" />
              </g>

              {/* Top Face Mouth: cute open smile under eye */}
              <g id="orange-top-mouth" className="orange-top-mouth-animated">
                <path d="M 442 157 C 445 153, 454 153, 457 157 C 459 166, 440 166, 442 157 Z" fill="#06121E" />
                <rect x="446" y="155" width="4.5" height="3" rx="1" fill="#FFFFFF" />
              </g>
            </g>
          </g>
        </g>

        {/* ===================================================
            6. PURPLE TRIANGLE CHARACTER (HULA HOOP SPINNER)
            =================================================== */}
        <g id="purple-triangle-character" className={`purple-group ${isTypingCredentials ? 'squad-interact-purple-typing' : ''} ${isPasswordFocused ? 'squad-interact-purple-shy' : ''}`} transform="translate(30, 0)">
          {/* Stick Legs */}
          <rect x="552" y="274" width="8.5" height="52" rx="2" fill="#083832" />
          <rect x="578" y="274" width="8.5" height="52" rx="2" fill="#083832" />

          {/* Turquoise Boots with Cream Cuffs */}
          <g className="purple-left-boot">
            <rect x="548" y="318" width="14" height="6" rx="1.5" fill="#FFEAA7" />
            <rect x="540" y="322" width="22" height="12" rx="4" fill="#00DDB3" />
          </g>
          <g className="purple-right-boot">
            <rect x="576" y="318" width="14" height="6" rx="1.5" fill="#FFEAA7" />
            <rect x="574" y="322" width="20" height="12" rx="4" fill="#00DDB3" />
          </g>

          {/* Hula Hoop BACK Arc (passes behind triangle body) */}
          <path
            d="M 522 254 C 522 240, 612 240, 612 254"
            stroke="#00F5D4"
            strokeWidth="4"
            strokeDasharray="9 6"
            fill="none"
            className="hula-hoop-spin"
            filter="url(#hulaGlow)"
          />

          {/* Purple Triangle Body Group with Groove Sway */}
          <g className="purple-body-sway">
            {/* Rounded Purple Triangle Body */}
            <path
              d="M 567 172
                 C 573 172, 614 260, 617 266
                 C 620 273, 615 277, 606 277
                 L 528 277
                 C 519 277, 514 273, 517 266
                 C 520 260, 561 172, 567 172 Z"
              fill="url(#purpleTriangleGrad)"
              stroke="#6D28D9"
              strokeWidth="2"
            />

            {/* Arms holding Hula Hoop */}
            <path
              d="M 528 244 C 516 248, 515 258, 524 260"
              stroke="#083832"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
              className="purple-left-arm"
            />
            <path
              d="M 605 244 C 618 248, 620 258, 610 260"
              stroke="#083832"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
              className="purple-right-arm"
            />

            {/* Big Expressive Anime Eyes (matching Pink Companion) */}
            {!isPasswordFocused ? (
              <g
                id="purple-eyes"
                style={{ transformOrigin: '566px 226px' }}
                className={purpleBlinking ? 'blinking' : ''}
              >
                {/* Left Eye */}
                <g id="purple-left-eye">
                  <ellipse cx="548" cy="226" rx="10.2" ry="8.2" fill="#FFFFFF" />
                  <circle cx={548 + purplePupilX} cy={226 + purplePupilY} r="5.8" fill="#06121E" />
                  <circle cx={546 + purplePupilX * 0.5} cy={224 + purplePupilY * 0.5} r="1.8" fill="#FFFFFF" />
                  <path d="M 539 234.5 Q 548 237 557 234.5" stroke="#E11D48" strokeWidth="2.0" strokeLinecap="round" fill="none" />
                </g>

                {/* Right Eye */}
                <g id="purple-right-eye">
                  <ellipse cx="584" cy="226" rx="10.2" ry="8.2" fill="#FFFFFF" />
                  <circle cx={584 + purplePupilX} cy={226 + purplePupilY} r="5.8" fill="#06121E" />
                  <circle cx={582 + purplePupilX * 0.5} cy={224 + purplePupilY * 0.5} r="1.8" fill="#FFFFFF" />
                  <path d="M 575 234.5 Q 584 237 593 234.5" stroke="#E11D48" strokeWidth="2.0" strokeLinecap="round" fill="none" />
                </g>
              </g>
            ) : (
              <g id="purple-eyes-shy" style={{ transformOrigin: '566px 226px' }}>
                <path d="M 540 227 Q 548 221 556 227" stroke="#06121E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                <path d="M 576 227 Q 584 221 592 227" stroke="#06121E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              </g>
            )}

            {/* Glowing Pink Horizontal Capsule Blush Cheeks */}
            <rect x="535" y="243" width="12" height="6" rx="3" fill="#FF66C4" className="purple-blush" />
            <rect x="586" y="243" width="12" height="6" rx="3" fill="#FF66C4" className="purple-blush" />

            {/* Cute Open Mouth with Tongue */}
            <g id="purple-mouth" className="purple-mouth-smile">
              <path d="M 561 245 C 563 241, 571 241, 573 245 C 575 253, 559 253, 561 245 Z" fill="#06121E" />
              <ellipse cx="567" cy="250" rx="4" ry="2" fill="#FF80AB" />
            </g>

            {/* Hula Hoop FRONT Arc (passes in front of triangle body) */}
            <path
              d="M 522 254 C 522 268, 612 268, 612 254"
              stroke="#00F5D4"
              strokeWidth="4.5"
              strokeDasharray="9 6"
              fill="none"
              className="hula-hoop-spin"
              filter="url(#hulaGlow)"
            />
          </g>
        </g>

        {/* Click Sparkles */}
        {sparkles.map((sp) => (
          <circle
            key={sp.id}
            cx={sp.x}
            cy={sp.y}
            r={sp.size}
            fill="#FFCA28"
            className="sparkle-particle"
          />
        ))}
      </svg>
    </div>
  );
}
