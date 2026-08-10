import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api, { socket } from '../api';

// In-app notifications for the logged-in account — list + unread count,
// kept live via the `user_${id}` socket room (see backend/src/index.js's
// `join_user` handler and notifications.js's POST /broadcast). Any page
// that mounts this joins that room; NotificationBell/the Notifications tab
// both consume it so a badge and an open list never disagree.
export function useNotifications(userId, { page = 1, limit = 20 } = {}) {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', page, limit],
    queryFn: () => api.get('/notifications', { params: { page, limit } }).then(r => r.data),
    enabled: !!userId,
    staleTime: 15_000,
  });

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data.count),
    enabled: !!userId,
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    if (!userId) return;
    socket.emit('join_user', userId);
    const onNotification = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, [userId, qc]);

  return {
    notifications: listQuery.data?.notifications ?? [],
    pagination: listQuery.data?.pagination ?? {},
    isLoading: listQuery.isLoading,
    unreadCount: unreadQuery.data ?? 0,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
