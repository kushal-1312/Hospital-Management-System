import { useCallback, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { authAPI, getAccessToken } from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
let socketInstance: Socket | null = null;

const useSocket = () => {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      socketInstance?.disconnect();
      socketInstance = null;
      socketRef.current = null;
      return;
    }

    const token = getAccessToken();
    if (!token) return;
    if (socketInstance?.connected) {
      socketRef.current = socketInstance;
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
      withCredentials: true,
    });

    socket.on('connect_error', async (error) => {
      if (!/token|auth/i.test(error.message)) return;
      try {
        const refreshedToken = await authAPI.refresh();
        socket.auth = { token: refreshedToken };
        socket.connect();
      } catch {
        window.dispatchEvent(new Event('session:expired'));
      }
    });

    socketInstance = socket;
    socketRef.current = socket;
  }, [user]);

  const on = useCallback(<T = unknown>(event: string, handler: (payload: T) => void) => {
    const wrapped = handler as (...args: unknown[]) => void;
    socketRef.current?.on(event, wrapped);
    return () => { socketRef.current?.off(event, wrapped); };
  }, []);

  const off = useCallback(<T = unknown>(event: string, handler: (payload: T) => void) => {
    socketRef.current?.off(event, handler as (...args: unknown[]) => void);
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, on, off, emit };
};

export default useSocket;
