import { useEffect, useMemo, useRef } from "react";
import { getAuthToken } from "@poker-champ/sdk";
import { createRealtimeSession, type RealtimeSession, type RealtimeSessionOptions } from "./transport";
import { resolveRealtimeTransportConfig, type TransportScope } from "@/registry/transport.registry";

type UseRealtimeChannelOptions = {
  scope: TransportScope;
  id?: string;
  enabled?: boolean;
  joinOptions?: Record<string, unknown>;
  onMessage: RealtimeSessionOptions["onMessage"];
  onError?: RealtimeSessionOptions["onError"];
  onOpen?: (send: (type: string, payload?: unknown) => boolean) => void;
  onClose?: RealtimeSessionOptions["onClose"];
};

export function useRealtimeChannel(options: UseRealtimeChannelOptions) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const callbackRef = useRef(options);
  const send = (type: string, payload?: unknown) => sessionRef.current?.send({ type, payload }) ?? false;

  useEffect(() => {
    callbackRef.current = options;
  }, [options]);

  useEffect(() => {
    if (options.enabled === false) {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      return;
    }

    const config = resolveRealtimeTransportConfig({
      scope: options.scope,
      id: options.id,
      token: options.scope === "table" ? getAuthToken() : null,
      joinOptions: options.joinOptions,
    });
    const session = createRealtimeSession({
      transport: config.transport,
      url: config.url,
      roomName: "roomName" in config ? config.roomName : undefined,
      roomId: "roomId" in config ? config.roomId : undefined,
      joinOptions: "joinOptions" in config ? config.joinOptions : undefined,
      onMessage: (message) => callbackRef.current.onMessage(message),
      onError: (message) => callbackRef.current.onError?.(message),
      onOpen: () => callbackRef.current.onOpen?.(send),
      onClose: () => callbackRef.current.onClose?.(),
    });

    sessionRef.current = session;
    return () => {
      session.disconnect();
      sessionRef.current = null;
    };
  }, [options.scope, options.id, options.enabled, options.joinOptions]);

  return useMemo(
    () => ({
      send,
    }),
    [],
  );
}
