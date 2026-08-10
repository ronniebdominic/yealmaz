import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { format, formatDistanceToNow } from 'date-fns';
import { MdNotifications, MdNotificationsNone, MdCampaign, MdDoneAll, MdInbox } from 'react-icons/md';

function NotificationRow({ n, onRead }) {
  return (
    <div
      onClick={() => !n.isRead && onRead(n.id)}
      style={{
        display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12,
        background: n.isRead ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.65)',
        border: `1px solid ${n.isRead ? 'rgba(255,255,255,0.4)' : 'var(--glass-border)'}`,
        marginBottom: 8, cursor: n.isRead ? 'default' : 'pointer', position: 'relative',
      }}
    >
      {!n.isRead && <span style={{ position: 'absolute', top: 14, right: 12, width: 7, height: 7, borderRadius: '50%', background: '#D97706' }} />}
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: n.type === 'ANNOUNCEMENT' ? 'rgba(217,119,6,0.15)' : 'rgba(0,196,180,0.15)',
        color: n.type === 'ANNOUNCEMENT' ? '#D97706' : 'var(--accent)',
      }}>
        <MdCampaign size={16} />
      </div>
      <div style={{ minWidth: 0, flex: 1, paddingRight: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 2 }}>{n.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4, marginBottom: 4 }}>{n.message}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {n.sender?.name && <span>From {n.sender.name} ·</span>}
          <span title={format(new Date(n.createdAt), 'dd MMM yyyy, h:mm a')}>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

function NotificationList({ notifications, isLoading, markRead, markAllRead, unreadCount }) {
  return (
    <div>
      {unreadCount > 0 && (
        <button onClick={markAllRead} style={{
          display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', marginBottom: 10,
          background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
        }}>
          <MdDoneAll size={14} /> Mark all read
        </button>
      )}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30 }}>
          <MdInbox size={28} color="var(--text-3)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No notifications yet</div>
        </div>
      ) : (
        notifications.map(n => <NotificationRow key={n.id} n={n} onRead={markRead} />)
      )}
    </div>
  );
}

// Bell + badge + popover — the default usage anywhere in a header.
// Pass variant="full" to render just the list (no bell/popover chrome),
// for a dedicated Notifications tab/page.
export default function NotificationBell({ variant = 'dropdown' }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { notifications, isLoading, unreadCount, markRead, markAllRead } = useNotifications(user?.id);

  if (variant === 'full') {
    return <NotificationList notifications={notifications} isLoading={isLoading} markRead={markRead} markAllRead={markAllRead} unreadCount={unreadCount} />;
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Notifications" style={{
        background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 8,
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
      }}>
        {unreadCount > 0 ? <MdNotifications size={18} /> : <MdNotificationsNone size={18} />}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8, background: '#DC2626',
            color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          <div className="glass-card" style={{
            position: 'absolute', top: 42, right: 0, width: 320, maxHeight: 420, overflowY: 'auto',
            padding: 14, zIndex: 201,
          }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MdNotifications size={15} /> Notifications
            </div>
            <NotificationList notifications={notifications} isLoading={isLoading} markRead={markRead} markAllRead={markAllRead} unreadCount={unreadCount} />
          </div>
        </>
      )}
    </div>
  );
}
