import { useEffect, useRef, useState } from 'react';
import { buildWsUrl } from '../api/client';
import type { WsEvent } from '../types';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

function parseEvent(raw: string): WsEvent | null {
  try {
    const data = JSON.parse(raw) as { type?: unknown };
    if (typeof data.type !== 'string') return null;
    return data as WsEvent;
  } catch {
    return null;
  }
}

/**
 * Opens a WebSocket to the live-events endpoint for the given token and calls
 * `onEvent` for every parsed message. Reconnects with backoff on drop.
 * The `onEvent` callback is stored in a ref so the socket is not torn down on
 * every render.
 */
export function useWebSocket(
  token: string | null,
  onEvent: (event: WsEvent) => void,
): WsStatus {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!token) {
      setStatus('disconnected');
      return;
    }

    let closedByUs = false;
    let retry = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setStatus('connecting');
      socket = new WebSocket(buildWsUrl(token));

      socket.onopen = () => {
        retry = 0;
        setStatus('connected');
      };

      socket.onmessage = (ev: MessageEvent<string>) => {
        const parsed = parseEvent(
          typeof ev.data === 'string' ? ev.data : String(ev.data),
        );
        if (parsed) {
          handlerRef.current(parsed);
        }
      };

      socket.onclose = () => {
        setStatus('disconnected');
        if (closedByUs) return;
        retry += 1;
        const delay = Math.min(1000 * 2 ** (retry - 1), 10000);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [token]);

  return status;
}
