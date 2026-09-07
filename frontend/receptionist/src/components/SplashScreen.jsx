// Ye-Almaz — App boot splash, shown once while the app first mounts.
// Mirrors the clinic app's own SplashScreen.js (same navy/gold branding,
// glass-ring logo, pulsing dots) translated to web/CSS — see App.jsx for
// how long it's held and the fade-out into the real app.
export default function SplashScreen({ fadingOut }) {
  return (
    <div className={`splash-screen${fadingOut ? ' splash-fade-out' : ''}`}>
      <div className="splash-logo-ring">
        <img src="/logo.png" alt="" className="splash-logo" />
      </div>
      <div className="splash-text-block">
        <div className="splash-app-name">Ye-Almaz</div>
        <div className="splash-app-sub">Dental Laboratory</div>
        <div className="splash-divider" />
        <div className="splash-tagline">Dental Lab Management System</div>
      </div>
      <div className="splash-dots">
        <span className="splash-dot" style={{ animationDelay: '0ms' }} />
        <span className="splash-dot" style={{ animationDelay: '200ms' }} />
        <span className="splash-dot" style={{ animationDelay: '400ms' }} />
      </div>
      <div className="splash-footer">Ye-Almaz Dental Lab · Addis Ababa</div>
    </div>
  );
}
