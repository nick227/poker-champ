import { useEffect, useMemo, useRef } from "react";
import { getAuthToken } from "@poker-champ/sdk";
import { createRealtimeSession, type RealtimeSession, type RealtimeSessionOptions } from "./transport";
import { resolveRealtimeTransportConfig, type TransportScope } from "@/registry/transport.registry";

type UseRealtimeChannelOptions = {
  scope: TransportScope;
  id?: string;
  enabled?: boolean;
  authHydrated?: boolean;
  joinOptions?: Record<string, unknown>;
  onMessage: RealtimeSessionOptions["onMessage"];
  onError?: RealtimeSessionOptions["onError"];
  onOpen?: (send: (type: string, payload?: unknown) => boolean) => void;
  onClose?: RealtimeSessionOptions["onClose"];
};

export function canStartRealtimeSession(input: {
  scope: TransportScope;
  enabled?: boolean;
  authHydrated?: boolean;
  authToken?: string | null;
}): boolean {
  if (input.enabled === false) return false;
  if (input.scope !== "table") return true;
  if (!input.authHydrated) return false;
  if (!input.authToken) return false;
  return true;
}

export function useRealtimeChannel(options: UseRealtimeChannelOptions) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const callbackRef = useRef(options);
  const send = (type: string, payload?: unknown) => sessionRef.current?.send({ type, payload }) ?? false;

  useEffect(() => {
    callbackRef.current = options;
  }, [options]);

  useEffect(() => {
    const authToken = options.scope === "table" ? getAuthToken() : null;
    if (!canStartRealtimeSession({ scope: options.scope, enabled: options.enabled, authHydrated: options.authHydrated, authToken })) {
      // Hard-stop: never attempt table realtime socket/join until auth is hydrated and token exists.
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      return;
    }

    const config = resolveRealtimeTransportConfig({
      scope: options.scope,
      id: options.id,
      token: authToken,
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
  }, [options.scope, options.id, options.enabled, options.authHydrated, options.joinOptions]);

  return useMemo(
    () => ({
      send,
    }),
    [],
  );
}
