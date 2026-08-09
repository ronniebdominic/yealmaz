import { useEffect, useState } from 'react';
import { MdInstallMobile, MdClose } from 'react-icons/md';

// Explicit in-app "Install" prompt — this app's manifest.json/sw.js are
// already registered app-wide (index.html + main.jsx), so it's installable
// today, but relying solely on the browser's own address-bar icon is easy
// to miss. Chrome/Edge/Android fire `beforeinstallprompt` when the PWA
// criteria are met; capturing that lets us offer a one-tap Install button.
// iOS Safari never fires that event — there's no programmatic install
// there, so it gets one-time instructions instead. Same pattern as the
// clinic app's install banner (yealmaz-clinic-app/App.js).
export default function InstallAppBanner() {
  const [installEvent, setInstallEvent] = useState(null);
  const [mode, setMode] = useState(null); // 'chrome' | 'ios'
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    let dismissed = false;
    try { dismissed = localStorage.getItem('pwaInstallDismissed') === '1'; } catch {}
    if (dismissed) return;

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
      setMode('chrome');
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    const ua = navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    if (isIOS && isSafari) {
      setMode('ios');
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem('pwaInstallDismissed', '1'); } catch {}
  };

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 60, background: 'var(--navy)', color: '#fff',
      padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5,
    }}>
      <MdInstallMobile size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.35, fontWeight: 600 }}>
        {mode === 'ios'
          ? 'Install this app: tap Share, then "Add to Home Screen"'
          : 'Install this app for quicker, full-screen access'}
      </span>
      {mode === 'chrome' && (
        <button onClick={install} style={{
          background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: 999,
          padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
        }}>Install</button>
      )}
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 2 }} aria-label="Dismiss">
        <MdClose size={16} />
      </button>
    </div>
  );
}
