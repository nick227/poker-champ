import { useEffect, useMemo, useRef } from "react";
import { getAuthToken } from "@poker-champ/sdk";
import { createRealtimeSession, type RealtimeSession, type RealtimeSessionOptions } from "./transport";
import { resolveRealtimeTransportConfig, type TransportScope } from "@/registry/transport.registry";
import { useE2EConnectionCountStore } from "@/stores/e2eConnectionCount.store";

type UseRealtimeChannelOptions = {
  scope: TransportScope;
  id?: string;
  enabled?: boolean;
  authHydrated?: boolean;
  joinOptions?: Record<string, unknown>;
  onMessage: RealtimeSessionOptions["onMessage"];
  onError?: RealtimeSessionOptions["onError"];
  onOpen?: (send: (type: string, payload?: unknown) => boolean, getNativeRoom?: () => unknown) => void;
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
  /** Monotonic generation for this channel: bumped every time the connect effect (re-)runs.
   * The callbacks handed to a given session capture their own generation number and no-op once
   * a newer session has superseded them. This guards against a slow/delayed callback from an
   * older session (e.g. a straggling CONNECTED from a stale reconnect attempt) resolving after
   * a newer session has already taken over and clobbering its state. Transport-level disconnect
   * already prevents most of this, but the check here makes the channel correct by construction
   * rather than relying on cleanup-ordering timing. */
  const generationRef = useRef(0);
  const send = (type: string, payload?: unknown) => sessionRef.current?.send({ type, payload }) ?? false;
  const disconnect = (consented: boolean = false) => sessionRef.current?.disconnect(consented);

  useEffect(() => {
    callbackRef.current = options;
  }, [options]);

  useEffect(() => {
    const authToken = getAuthToken();
    if (!canStartRealtimeSession({ scope: options.scope, enabled: options.enabled, authHydrated: options.authHydrated, authToken })) {
      // Hard-stop: never attempt table realtime socket/join until auth is hydrated and token exists.
      generationRef.current += 1;
      sessionRef.current?.disconnect(false);
      sessionRef.current = null;
      return;
    }

    const myGeneration = ++generationRef.current;
    const isStale = () => myGeneration !== generationRef.current;

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
      onMessage: (message) => {
        if (isStale()) return;
        callbackRef.current.onMessage(message);
      },
      onError: (message) => {
        if (isStale()) return;
        callbackRef.current.onError?.(message);
      },
      onOpen: () => {
        if (isStale()) return;
        callbackRef.current.onOpen?.(send, sessionRef.current?.getNativeRoom);
      },
      onClose: () => {
        if (isStale()) return;
        callbackRef.current.onClose?.();
      },
    });

    sessionRef.current = session;
    if (options.scope === "table") {
      useE2EConnectionCountStore.getState().increment();
    }
    return () => {
      if (options.scope === "table") {
        useE2EConnectionCountStore.getState().decrement();
      }
      session.disconnect(false);
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [options.scope, options.id, options.enabled, options.authHydrated, options.joinOptions]);

  return useMemo(
    () => ({
      send,
      disconnect,
      getNativeRoom: () => sessionRef.current?.getNativeRoom?.(),
    }),
    [],
  );
}
