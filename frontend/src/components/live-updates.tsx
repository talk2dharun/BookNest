'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';
import { getAccessToken, refreshSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function LiveUpdates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [disconnected, setDisconnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    const socket = io(API_URL, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const refetchView = () => {
      void queryClient.invalidateQueries();
    };

    socket.on('connect', () => {
      setDisconnected(false);
      refetchView();
    });
    socket.on('disconnect', () => setDisconnected(true));
    socket.io.on('reconnect_attempt', async () => {
      let currentToken = getAccessToken();
      if (!currentToken) {
        const session = await refreshSession();
        currentToken = session?.accessToken ?? null;
      }
      socket.auth = { token: currentToken };
      setDisconnected(true);
    });
    socket.on('connect_error', async (err) => {
      if (err.message === 'Unauthorized') {
        const session = await refreshSession();
        if (session?.accessToken) {
          socket.auth = { token: session.accessToken };
          socket.connect();
        }
      }
    });

    socket.on('lending:created', refetchView);
    socket.on('lending:returned', refetchView);
    socket.on('shelf:book-added', refetchView);
    socket.on('shelf:book-removed', refetchView);
    socket.on('shelf:shared', refetchView);
    socket.on('shelf:role-changed', refetchView);
    socket.on('shelf:access-removed', refetchView);
    socket.on('activity:new', refetchView);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, queryClient]);

  if (!disconnected || !user) {
    return null;
  }

  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
      Live updates disconnected, reconnecting...
    </div>
  );
}
