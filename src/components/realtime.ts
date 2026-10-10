"use client";

import { useEffect, useRef } from "react";

export type RealtimeMessage = { channel: string; event: { type: string; [k: string]: unknown } };

/**
 * Subscribes to server-sent events for the given channels. Reconnects
 * automatically (EventSource handles retry); `onReconnect` lets callers
 * refetch state they may have missed while disconnected.
 */
export function useRealtime(channels: string[], onMessage: (m: RealtimeMessage) => void, onReconnect?: () => void) {
  const handler = useRef(onMessage);
  const reconnect = useRef(onReconnect);
  handler.current = onMessage;
  reconnect.current = onReconnect;
  const key = channels.filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!key) return;
    let opened = false;
    const es = new EventSource(`/api/realtime?channels=${encodeURIComponent(key)}`);
    es.onopen = () => {
      if (opened) reconnect.current?.();
      opened = true;
    };
    es.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as RealtimeMessage);
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [key]);
}
