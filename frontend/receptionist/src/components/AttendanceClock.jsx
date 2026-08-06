import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAccessTime, MdFreeBreakfast } from 'react-icons/md';

// Wraps the callback-based Geolocation API in a Promise with a friendly
// error message on denial/timeout/unavailability.
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device/browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error('Location permission denied. Enable it to clock in/out.'));
        else reject(new Error('Could not get your location. Please try again.'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

const CLOCK_TOAST = {
  CLOCK_IN: 'Clocked in!', CLOCK_OUT: 'Clocked out!',
  BREAK_START: 'Break started!', BREAK_END: 'Break ended!',
};

// Self-service Clock In / Start Break / End Break / Clock Out, geofenced to
// the lab for CLOCK_IN/CLOCK_OUT (POST /api/attendance/self on the backend
// enforces this — breaks are not geofenced there either). Drop this into
// any dashboard header; it manages its own state off today's events, same
// as originally built for DeliveryDashboard.
export default function AttendanceClock() {
  const [todayEvents, setTodayEvents] = useState([]);
  const [clocking, setClocking] = useState(false);

  const loadAttendance = useCallback(async () => {
    try {
      const res = await api.get('/attendance/self/today');
      setTodayEvents(res.data.events ?? []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  // Attendance state, derived purely from today's last event — mirrors what
  // the backend itself infers (no separate "current status" endpoint needed).
  const lastEvent = todayEvents[todayEvents.length - 1];
  const onBreak = lastEvent?.type === 'BREAK_START';
  const isClockedIn = lastEvent?.type === 'CLOCK_IN' || lastEvent?.type === 'BREAK_END';
  // lastEvent isn't necessarily the CLOCK_IN itself once breaks are in play
  // (e.g. it could be a BREAK_END) — find the actual clock-in time for the label.
  const clockInEvent = [...todayEvents].reverse().find(e => e.type === 'CLOCK_IN');

  const handleClock = async (type) => {
    setClocking(true);
    try {
      const coords = await getCurrentPosition();
      await api.post('/attendance/self', { type, latitude: coords.latitude, longitude: coords.longitude });
      toast.success(CLOCK_TOAST[type]);
      loadAttendance();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not record attendance.');
    } finally {
      setClocking(false);
    }
  };

  const btnStyle = (bg) => ({
    background: bg, border: 'none', color: '#fff', borderRadius: 7,
    padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: clocking ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  });

  if (onBreak) {
    return (
      <button onClick={() => handleClock('BREAK_END')} disabled={clocking} style={btnStyle('#2563EB')}>
        <MdFreeBreakfast size={14} />
        {clocking ? 'Locating…' : `End Break (since ${format(new Date(lastEvent.timestamp), 'HH:mm')})`}
      </button>
    );
  }

  return (
    <>
      {isClockedIn && (
        <button onClick={() => handleClock('BREAK_START')} disabled={clocking} style={btnStyle('#D97706')}>
          <MdFreeBreakfast size={14} /> Start Break
        </button>
      )}
      <button onClick={() => handleClock(isClockedIn ? 'CLOCK_OUT' : 'CLOCK_IN')} disabled={clocking} style={btnStyle(isClockedIn ? '#DC2626' : '#16A34A')}>
        <MdAccessTime size={14} />
        {clocking ? 'Locating…' : isClockedIn
          ? `Clock Out${clockInEvent ? ` (in ${format(new Date(clockInEvent.timestamp), 'HH:mm')})` : ''}`
          : 'Clock In'}
      </button>
    </>
  );
}
