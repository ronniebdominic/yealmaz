// Ye-Almaz — Biometric device status strip
// Surfaces GET /api/attendance/devices so HR can see from inside the LMS
// whether the Hikvision bridge/terminal at the client site is actually
// online, instead of only noticing a dead device days later as a gap in
// attendance data. Renders nothing until a bridge has connected at least
// once, so a site with no biometric hardware sees no clutter.
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { MdSensors, MdSensorsOff, MdWarningAmber } from 'react-icons/md';
import api from '../../../api';

// Matches the backend's DEVICE_OFFLINE_AFTER_MS window conceptually — the
// server already computes `online`, this is just for the queue-backlog hint.
const QUEUE_BACKLOG_WARN = 5;

function DeviceRow({ device }) {
  const { deviceId, label, online, lastSeenAt, lastEventAt, queueDepth, pollEnabled, lastPollOk, lastPollError, bridgeVersion } = device;

  const statusColor = online ? 'var(--green)' : 'var(--red)';
  const statusText = online ? 'Online' : (lastSeenAt ? 'Offline' : 'Never connected');
  const StatusIcon = online ? MdSensors : MdSensorsOff;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 4px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 160 }}>
        <StatusIcon size={16} color={statusColor} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{label || deviceId}</div>
          <div style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{statusText}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Last punch:{' '}
        <span style={{ color: 'var(--text-2)' }}>
          {lastEventAt ? formatDistanceToNow(new Date(lastEventAt), { addSuffix: true }) : 'none yet'}
        </span>
      </div>

      {lastSeenAt && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Last heartbeat:{' '}
          <span style={{ color: 'var(--text-2)' }}>{formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true })}</span>
        </div>
      )}

      {typeof queueDepth === 'number' && queueDepth > 0 && (
        <div style={{ fontSize: 12, color: queueDepth >= QUEUE_BACKLOG_WARN ? 'var(--amber)' : 'var(--text-3)', fontWeight: queueDepth >= QUEUE_BACKLOG_WARN ? 700 : 400 }}>
          {queueDepth} punch{queueDepth === 1 ? '' : 'es'} queued (not yet sent)
        </div>
      )}

      {pollEnabled && lastPollOk === false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--red)' }} title={lastPollError || ''}>
          <MdWarningAmber size={14} /> ISAPI poll failing
        </div>
      )}

      {bridgeVersion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>bridge v{bridgeVersion}</div>}
    </div>
  );
}

export default function DeviceStatusBar() {
  const { data } = useQuery({
    queryKey: ['hr', 'attendance', 'devices'],
    queryFn: () => api.get('/attendance/devices').then(r => r.data),
    // Health data changes on its own timeline (heartbeats), not on user
    // action, so a short poll keeps it current without a manual refresh.
    refetchInterval: 60 * 1000,
  });

  const devices = data?.devices || [];
  if (devices.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 14, padding: '2px 12px' }}>
      {devices.map(d => <DeviceRow key={d.deviceId} device={d} />)}
    </div>
  );
}
