import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

// Minimum time between location POSTs — watchPosition can fire far more
// often than that (every GPS jitter), so this throttles the network/battery
// cost without needing a fixed setInterval poll.
const POST_INTERVAL_MS = 20_000;

// Opt-in continuous location sharing for a delivery agent — mirrors the
// Promise-wrapped geolocation pattern already used for one-shot geofenced
// clock-in in AttendanceClock.jsx, but via watchPosition for a continuous
// stream while `sharing` is true. Never starts on its own; the caller
// controls `sharing` via toggle().
export function useLiveLocationSharing() {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);
  const lastPostRef = useRef(0);

  const post = useCallback((coords) => {
    api.post('/delivery/location', {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? undefined,
      heading: coords.heading ?? undefined,
      speed: coords.speed ?? undefined,
    }).catch(() => {}); // a missed beat isn't worth surfacing — the next one lands in <20s
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    api.post('/delivery/location/stop').catch(() => {});
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Location is not available on this device/browser.');
      return;
    }
    setError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPostRef.current < POST_INTERVAL_MS) return;
        lastPostRef.current = now;
        post(pos.coords);
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED
          ? 'Location permission denied — enable it to share your location.'
          : 'Could not get your location.');
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
    setSharing(true);
  }, [post, stop]);

  const toggle = useCallback(() => {
    if (sharing) stop(); else start();
  }, [sharing, start, stop]);

  // Stop sharing (and tell the server) if the component unmounts while
  // still on — e.g. the agent logs out without explicitly toggling off.
  useEffect(() => () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      api.post('/delivery/location/stop').catch(() => {});
    }
  }, []);

  return { sharing, error, toggle };
}
