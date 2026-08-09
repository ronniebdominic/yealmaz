import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import api, { socket } from '../api';
import { MdTwoWheeler, MdInfoOutline } from 'react-icons/md';

// Live positions of every delivery agent currently sharing their location
// (opt-in, toggled from their own portal — see useLiveLocationSharing.js).
// Initial snapshot from GET /delivery/locations, kept live afterwards via
// the 'dispatch_ops' socket room (driver_location / driver_location_stopped
// — see backend/src/routes/delivery.js's POST /location[/stop]).
// A custom divIcon avoids Leaflet's default marker image entirely, which
// sidesteps the classic bundler-breaks-the-default-icon-path problem.
const ADDIS_ABABA = [9.03, 38.74];
const AMBER = '#D97706';

function agentIcon(name) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;border-radius:50%;background:${AMBER};color:#fff;
      display:flex;align-items:center;justify-content:center;font:700 12px/1 'DM Sans',sans-serif;
      border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
    ">${initials}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function timeAgo(iso) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

export default function LiveTrackingMap() {
  const [live, setLive] = useState(new Map()); // userId -> agent position

  const { data, isLoading } = useQuery({
    queryKey: ['delivery', 'locations'],
    queryFn: () => api.get('/delivery/locations').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Seed from the initial snapshot once loaded.
  useEffect(() => {
    if (!data?.agents) return;
    setLive(prev => {
      const next = new Map(prev);
      for (const a of data.agents) next.set(a.userId, a);
      return next;
    });
  }, [data]);

  // Live updates over the dispatch_ops room.
  useEffect(() => {
    socket.emit('join_dispatch_ops');
    const onLocation = (a) => setLive(prev => new Map(prev).set(a.userId, a));
    const onStopped = ({ userId }) => setLive(prev => { const next = new Map(prev); next.delete(userId); return next; });
    socket.on('driver_location', onLocation);
    socket.on('driver_location_stopped', onStopped);
    return () => {
      socket.off('driver_location', onLocation);
      socket.off('driver_location_stopped', onStopped);
    };
  }, []);

  const agents = useMemo(() => [...live.values()], [live]);
  const center = agents.length > 0 ? [agents[0].latitude, agents[0].longitude] : ADDIS_ABABA;

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', height: 560 }}>
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {agents.map(a => (
          <Marker key={a.userId} position={[a.latitude, a.longitude]} icon={agentIcon(a.name)}>
            <Popup>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, minWidth: 140 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{a.name}</div>
                {a.station && <div style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>{a.station}</div>}
                <div style={{ color: '#9CA3AF', fontSize: 11 }}>Updated {timeAgo(a.updatedAt)}</div>
                {a.speed != null && <div style={{ color: '#9CA3AF', fontSize: 11 }}>{Math.round(a.speed * 3.6)} km/h</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {!isLoading && agents.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', background: 'rgba(255,255,255,0.5)',
        }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '14px 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', textAlign: 'center', maxWidth: 260 }}>
            <MdTwoWheeler size={26} color={AMBER} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1F2937', marginBottom: 3 }}>No one sharing location right now</div>
            <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <MdInfoOutline size={13} /> Drivers opt in from their own portal
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
