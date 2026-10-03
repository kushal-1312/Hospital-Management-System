import { useState, useEffect, useCallback, useRef } from 'react';
import useSocket from './useSocket';
import { dashboardAPI } from '../services/api';

/**
 * UPGRADE 2: useLiveDashboard hook
 *
 * Keeps dashboard stats fresh via two mechanisms:
 * 1. Socket event `dashboard:refresh` — triggers immediate re-fetch
 *    whenever any patient/appointment is mutated on the server.
 * 2. Polling fallback — re-fetches every 30 seconds in case
 *    the socket connection is unavailable.
 */
const POLL_INTERVAL_MS = 30_000;

const useLiveDashboard = () => {
  const { on, emit } = useSocket();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const pollRef = useRef(null);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await dashboardAPI.getStats();
      setStats(res.data.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Initial load ───────────────────────────────────────────
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Socket: listen for refresh signals ────────────────────
  useEffect(() => {
    // Server emits this whenever patient/appointment data changes
    const unsub = on('dashboard:refresh', () => {
      setIsLive(true);
      fetchStats(true); // silent refresh — no loading spinner
    });

    // Also request initial snapshot via socket
    emit('dashboard:request');

    return unsub;
  }, [on, emit, fetchStats]);

  // ── Socket: receive direct snapshot from server ────────────
  useEffect(() => {
    const unsub = on('dashboard:update', (snapshot) => {
      setStats(prev => prev ? { ...prev, counts: { ...prev.counts, ...snapshot } } : prev);
      setLastUpdated(new Date(snapshot.timestamp));
      setIsLive(true);
    });
    return unsub;
  }, [on]);

  // ── Polling fallback (when socket is unavailable) ──────────
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchStats(true);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollRef.current);
  }, [fetchStats]);

  // ── Patient/appointment real-time events ───────────────────
  useEffect(() => {
    // Critical patient alert — don't wait for polling
    const unsub1 = on('patient:critical', () => fetchStats(true));
    const unsub2 = on('patient:added', () => fetchStats(true));
    const unsub3 = on('appointment:scheduled', () => fetchStats(true));
    const unsub4 = on('appointment:statusChanged', () => fetchStats(true));

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [on, fetchStats]);

  const manualRefresh = useCallback(() => fetchStats(false), [fetchStats]);

  return { stats, loading, lastUpdated, isLive, manualRefresh };
};

export default useLiveDashboard;
