import { useEffect, useRef, useState, useCallback } from 'react';
import { MdPhotoCamera, MdVideocamOff } from 'react-icons/md';

const JSQR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';

function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSQR_CDN;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load QR library'));
    document.head.appendChild(s);
  });
}

export default function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Try native BarcodeDetector first (faster on Chrome Android)
    if ('BarcodeDetector' in window) {
      new window.BarcodeDetector({ formats: ['qr_code'] })
        .detect(canvas)
        .then(codes => {
          if (codes.length > 0) return codes[0].rawValue;
        })
        .then(raw => {
          if (!raw) { animRef.current = requestAnimationFrame(scanFrame); return; }
          deliver(raw);
        })
        .catch(() => { animRef.current = requestAnimationFrame(scanFrame); });
      return;
    }

    // Fallback: jsQR (works in Firefox, Safari, all browsers)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    if (code) {
      deliver(code.data);
    } else {
      animRef.current = requestAnimationFrame(scanFrame);
    }
  }, []); // eslint-disable-line

  const deliver = useCallback((raw) => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const match = raw.match(/\/api\/scan\/([^?/\s]+)/);
    onScan(match ? match[1] : raw.trim());
  }, [onScan]);

  useEffect(() => {
    async function start() {
      // Ensure jsQR is available as fallback
      try { await loadJsQR(); } catch { /* BarcodeDetector will be used if available */ }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (err) {
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera access denied. Tap the camera icon in the address bar and allow access.'
            : `Could not open camera: ${err.message}`
        );
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setStarted(true);
          animRef.current = requestAnimationFrame(scanFrame);
        };
      }
    }

    start();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [scanFrame]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', background: 'rgba(0,0,0,0.85)', flexShrink: 0
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 7 }}><MdPhotoCamera size={17} /> Scan Case QR Code</span>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
          borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600
        }}>
          Cancel
        </button>
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {error ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', padding: 32, textAlign: 'center', gap: 14
        }}>
          <MdVideocamOff size={52} />
          <div style={{ fontWeight: 700, fontSize: 18 }}>Camera Unavailable</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, maxWidth: 280, lineHeight: 1.6 }}>{error}</div>
          <button onClick={onClose} style={{
            marginTop: 8, background: '#1A56A0', border: 'none', color: '#fff',
            borderRadius: 10, padding: '12px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 600
          }}>
            Go Back
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

          {/* Dimmed overlay + targeting frame */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
          }}>
            <div style={{
              width: 264, height: 264, position: 'relative',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)'
            }}>
              {/* Corner marks */}
              {[
                { top: 0, left: 0, borderTop: '3px solid #00C4B4', borderLeft: '3px solid #00C4B4' },
                { top: 0, right: 0, borderTop: '3px solid #00C4B4', borderRight: '3px solid #00C4B4' },
                { bottom: 0, left: 0, borderBottom: '3px solid #00C4B4', borderLeft: '3px solid #00C4B4' },
                { bottom: 0, right: 0, borderBottom: '3px solid #00C4B4', borderRight: '3px solid #00C4B4' },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: 28, height: 28, borderRadius: 3, ...s }} />
              ))}
            </div>
          </div>

          <div style={{
            position: 'absolute', bottom: 44, left: 0, right: 0,
            textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 14,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)'
          }}>
            {started ? 'Align the QR code inside the frame' : 'Starting camera…'}
          </div>
        </div>
      )}
    </div>
  );
}
