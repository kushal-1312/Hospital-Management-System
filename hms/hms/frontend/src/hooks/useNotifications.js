import { useState, useEffect, useCallback } from 'react';
import useSocket from './useSocket';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * UPGRADE 2: useNotifications hook
 *
 * Manages in-app notifications:
 * - Fetches initial list from REST API on mount
 * - Listens for real-time push via Socket.io
 * - Tracks unread count for the badge
 * - Provides markRead / markAllRead / clear actions
 */
const useNotifications = () => {
  const { user } = useAuth();
  const { on } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // ── Fetch from REST on mount ───────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=30');
      setNotifications(res.data.data);
      setUnreadCount(res.data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Socket: new notification arrives live ──────────────────
  useEffect(() => {
    const unsub = on('notification:new', (notification) => {
      setNotifications(prev => [notification, ...prev].slice(0, 50));
      setUnreadCount(prev => prev + 1);

      // Show toast for important types
      const toastFn = notification.type === 'critical' ? toast.error
        : notification.type === 'warning' ? toast
        : toast.success;

      toastFn(
        `${notification.title}\n${notification.body}`,
        {
          duration: notification.type === 'critical' ? 8000 : 4000,
          icon: notification.type === 'critical' ? '🚨'
              : notification.type === 'appointment' ? '📅'
              : notification.type === 'patient' ? '👤'
              : '🔔'
        }
      );
    });
    return unsub;
  }, [on]);

  // ── Socket: unread count update ────────────────────────────
  useEffect(() => {
    const unsub = on('notifications:unreadCount', ({ count }) => {
      setUnreadCount(count);
    });
    return unsub;
  }, [on]);

  // ── Socket: initial batch on connect ──────────────────────
  useEffect(() => {
    const unsub = on('notifications:init', (list) => {
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });
    return unsub;
  }, [on]);

  // ── Mark one or more as read ───────────────────────────────
  const markRead = useCallback(async (ids) => {
    try {
      const body = ids ? { ids } : {};
      const res = await api.put('/notifications/read', body);
      setUnreadCount(res.data.unreadCount);
      setNotifications(prev =>
        prev.map(n =>
          !ids || ids.includes(n._id) ? { ...n, read: true } : n
        )
      );
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  }, []);

  // ── Mark all as read ───────────────────────────────────────
  const markAllRead = useCallback(() => markRead(null), [markRead]);

  // ── Clear all read notifications ───────────────────────────
  const clearRead = useCallback(async () => {
    try {
      await api.delete('/notifications/clear-read');
      setNotifications(prev => prev.filter(n => !n.read));
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }, []);

  // ── Delete one ────────────────────────────────────────────
  const deleteOne = useCallback(async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    clearRead,
    deleteOne,
    refetch: fetchNotifications
  };
};

export default useNotifications;
