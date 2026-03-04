import { Client } from "@colyseus/sdk";
import { lobby } from "@poker-champ/sdk";
import { RECONNECT_DELAY_MS, MAX_RECONNECT_ATTEMPTS } from "@/constants";

/** Close code when leaving a stale/superseded connection. Matches server use (PokerRoom) for SESSION_REPLACED and rebind; treated as non-error. */
const LEAVE_CODE_STALE_OR_REPLACED = 4000;

export type RealtimeOutboundMessage = {
  type: string;
  payload?: unknown;
};

export type RealtimeInboundMessage = {
  type: string;
  payload?: unknown;
};

export type RealtimeSessionOptions = {
  transport?: "ws" | "colyseus";
  url?: string;
  roomName?: string;
  roomId?: string;
  joinOptions?: Record<string, unknown>;
  onMessage: (message: RealtimeInboundMessage) => void;
  onError?: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export type RealtimeSession = {
  connected: () => boolean;
  send: (message: RealtimeOutboundMessage) => boolean;
  disconnect: (consented?: boolean) => void;
  getNativeRoom?: () => unknown;
};

export const transportCapabilities = {
  supportsRooms: true,
  supportsPresence: true,
  supportsBinary: false,
} as const;

function toWsUrl(raw?: string): string | null {
  if (!raw) return null;
  if (raw.startsWith("ws://") || raw.startsWith("wss://")) return raw;
  if (raw.startsWith("http://")) return raw.replace("http://", "ws://");
  if (raw.startsWith("https://")) return raw.replace("https://", "wss://");
  return null;
}

async function resolveRoomIdByTableId(tableId: string): Promise<string | null> {
  const data = await lobby.listTables();
  const match = (data.tables ?? []).find((t) => String(t.tableId ?? "") === tableId);
  const roomId = match?.roomId;
  return typeof roomId === "string" && roomId.length > 0 ? roomId : null;
}

function normalizeInbound(data: unknown): RealtimeInboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  if (typeof record.type === "string") {
    return { type: record.type, payload: record.payload };
  }

  const inferredType =
    typeof record.kind === "string"
      ? record.kind
      : typeof record.event === "string"
        ? record.event
        : null;
  if (!inferredType) return null;

  const payload = "payload" in record ? record.payload : record;
  return { type: inferredType, payload };
}

export function createRealtimeSession(options: RealtimeSessionOptions): RealtimeSession {
  const mode = options.transport ?? "ws";
  if (mode === "colyseus") {
    return createColyseusSession(options);
  }
  return createWebSocketSession(options);
}

function createWebSocketSession(options: RealtimeSessionOptions): RealtimeSession {
  const wsUrl = toWsUrl(options.url);
  if (!wsUrl) {
    return {
      connected: () => false,
      send: () => false,
      disconnect: () => undefined,
      getNativeRoom: () => null,
    };
  }

  let connected = false;
  let shouldReconnect = true;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (!shouldReconnect || reconnectTimer) return;
    options.onMessage({ type: "RECONNECTING" });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = () => {
    try {
      socket = new WebSocket(wsUrl);
    } catch (err: unknown) {
      options.onError?.(err instanceof Error ? err.message : "Unable to initialize websocket");
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      connected = true;
      options.onMessage({ type: "CONNECTED" });
      options.onOpen?.();
    };

    socket.onclose = () => {
      connected = false;
      options.onMessage({ type: "DISCONNECTED" });
      options.onClose?.();
      scheduleReconnect();
    };

    socket.onerror = () => options.onError?.("Realtime transport error");
    socket.onmessage = (event) => {
      try {
        const parsed = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const message = normalizeInbound(parsed);
        if (message) options.onMessage(message);
      } catch {
        options.onError?.("Malformed realtime payload");
      }
    };
  };

  connect();

  return {
    connected: () => connected,
    send: (message) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    disconnect: () => {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (!socket) return;
      try {
        socket.close();
      } catch {}
      socket = null;
    },
    getNativeRoom: () => null,
  };
}

function createColyseusSession(options: RealtimeSessionOptions): RealtimeSession {
  const url = options.url;
  if (!url) {
    options.onError?.("Missing Colyseus URL");
    return {
      connected: () => false,
      send: () => false,
      disconnect: () => undefined,
      getNativeRoom: () => null,
    };
  }

  let connected = false;
  let shouldReconnect = true;
  /** Set by disconnect(); when true, connect() must not fire CONNECTED/onOpen and must leave immediately after join. */
  let disposed = false;
  /** Monotonic generation: increment at start of connect(); set to DISPOSED_GEN in disconnect(). Stale callbacks and late-joining attempts check this so they don't dispatch or become active. */
  const DISPOSED_CONNECT_GEN = -1;
  let connectAttemptId = 0;
  type ColyseusRoom = Awaited<ReturnType<Client["joinById"]>>;
  let room: ColyseusRoom | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRoomId = options.roomId;
  /** When set, connect() uses client.reconnect() instead of joinById so the server's allowReconnection reservation is used. */
  let reconnectionRoomId: string | null = null;
  let reconnectionSessionId: string | null = null;
  let attemptedRoomIdRecovery = false;
  let attemptedRoomIdPreflightRecovery = false;
  let attemptedEmptyErrorRetry = false;
  let reconnectAttempts = 0;
  let terminalJoinFailure = false;
  /** Set when server sends ERROR SESSION_REPLACED; we must not reconnect on leave (avoids replace→reconnect loop). */
  let sessionReplacedByNewerConnection = false;
  const debugLog = (...args: unknown[]) => {
     
    console.log("[COLYSEUS_RT]", ...args);
  };

  const isRetryableJoinError = (message: string): boolean => {
    if (!message || message.trim().length === 0) return true;
    const normalized = message.toLowerCase();
    if (normalized.includes("room \"") && normalized.includes("\" not found")) return false;
    if (normalized.includes("missing_buy_in_cents")) return false;
    if (normalized.includes("insufficient_bankroll")) return false;
    if (normalized.includes("insufficient bankroll")) return false;
    if (normalized.includes("bad_join_options")) return false;
    if (normalized.includes("invalid or expired session")) return false;
    if (normalized.includes("authentication required")) return false;
    return true;
  };

  const isRoomNotFoundError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes("room \"") && normalized.includes("\" not found");
  };

  const scheduleReconnect = () => {
    if (disposed || !shouldReconnect || reconnectTimer) return;
    if (terminalJoinFailure) {
      debugLog("RECONNECT_ABORTED_TERMINAL_JOIN_FAILURE", { roomId: activeRoomId, roomName: options.roomName });
      return;
    }
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      debugLog("RECONNECT_ABORTED_MAX_ATTEMPTS", {
        roomId: activeRoomId,
        roomName: options.roomName,
        reconnectAttempts,
      });
      shouldReconnect = false;
      options.onError?.("Join failed repeatedly. Please retry manually.");
      return;
    }
    reconnectAttempts += 1;
    debugLog("SCHEDULE_RECONNECT", { roomId: options.roomId, roomName: options.roomName });
    options.onMessage({ type: "RECONNECTING" });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disposed) return;
      void connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = async () => {
    const myConnectId = ++connectAttemptId;
    const isStale = () => disposed || myConnectId !== connectAttemptId;
    try {
      const tableIdCandidate =
        typeof options.joinOptions?.tableId === "string" && options.joinOptions.tableId.length > 0
          ? options.joinOptions.tableId
          : null;

      // If caller passed tableId as roomId, resolve real Colyseus roomId before first join attempt.
      if (
        activeRoomId &&
        tableIdCandidate &&
        activeRoomId === tableIdCandidate &&
        !attemptedRoomIdPreflightRecovery
      ) {
        attemptedRoomIdPreflightRecovery = true;
        try {
          const recoveredRoomId = await resolveRoomIdByTableId(tableIdCandidate);
          if (isStale()) return;
          if (recoveredRoomId && recoveredRoomId !== activeRoomId) {
            activeRoomId = recoveredRoomId;
            debugLog("ROOM_ID_PREJOIN_RECOVERED", { tableId: tableIdCandidate, recoveredRoomId });
          }
        } catch (recoveryErr: unknown) {
          debugLog("ROOM_ID_PREJOIN_RECOVERY_FAILED", {
            tableId: tableIdCandidate,
            message: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
          });
        }
      }

      const client = new Client(url);
      const useReconnect = Boolean(reconnectionRoomId && reconnectionSessionId);
      debugLog("SOCKET_CONNECT_ATTEMPT", {
        url,
        roomId: activeRoomId,
        roomName: options.roomName,
        useReconnect,
        hasJoinOptions: Boolean(options.joinOptions),
        joinOptionKeys: options.joinOptions ? Object.keys(options.joinOptions) : [],
      });
      if (useReconnect && reconnectionRoomId && reconnectionSessionId) {
        room = await client.reconnect(reconnectionRoomId, reconnectionSessionId);
        reconnectionRoomId = null;
        reconnectionSessionId = null;
      } else {
        room = activeRoomId
          ? await client.joinById(activeRoomId, options.joinOptions ?? {})
          : await client.joinOrCreate(options.roomName ?? "lobby", options.joinOptions ?? {});
      }

      if (isStale() && room) {
        try {
          (room as unknown as { leave: (code?: number) => void }).leave(LEAVE_CODE_STALE_OR_REPLACED);
        } catch {}
        room = null;
        return;
      }

      connected = true;
      reconnectAttempts = 0;
      terminalJoinFailure = false;
      const currentRoom = room;
      debugLog("CONNECTED", { roomId: currentRoom?.roomId ?? options.roomId, sessionId: currentRoom?.sessionId });
      options.onMessage({
        type: "CONNECTED",
        payload: currentRoom?.sessionId != null ? { sessionId: currentRoom.sessionId } : undefined,
      });
      options.onOpen?.();

      currentRoom!.onMessage("*", (type: string | number, payload: unknown) => {
        if (myConnectId !== connectAttemptId) return;
        if (type === "ERROR" && payload && typeof payload === "object") {
          const code = (payload as { code?: string }).code;
          if (code === "JOIN_FAILED" || code === "BAD_JOIN_OPTIONS" || code === "MISSING_BUY_IN_CENTS" || code === "UNAUTHORIZED") {
            terminalJoinFailure = true;
            shouldReconnect = false;
            debugLog("TERMINAL_JOIN_ERROR_RECEIVED", { roomId: room?.roomId ?? options.roomId, code });
          }
        }
        if (type === "ERROR" && payload && typeof payload === "object" && (payload as { code?: string }).code === "SESSION_REPLACED") {
          sessionReplacedByNewerConnection = true;
          debugLog("SESSION_REPLACED_RECEIVED", { roomId: room?.roomId ?? options.roomId });
        }
        options.onMessage({ type: typeof type === "string" ? type : String(type), payload });
      });

      currentRoom!.onError((code: number, message?: string) => {
        if (myConnectId !== connectAttemptId) return;
        debugLog("ROOM_ERROR", { code, message, roomId: room?.roomId ?? options.roomId });
        options.onError?.(`Colyseus error (${code}): ${message ?? ""}`);
      });

      currentRoom!.onLeave(() => {
        if (myConnectId !== connectAttemptId) return;
        const roomIdForReconnect = currentRoom.roomId ?? null;
        const sessionIdForReconnect = currentRoom.sessionId ?? null;
        connected = false;
        room = null;
        options.onMessage({
          type: "DISCONNECTED",
          payload: sessionIdForReconnect != null ? { sessionId: sessionIdForReconnect } : undefined,
        });
        options.onClose?.();
        if (sessionReplacedByNewerConnection) {
          debugLog("Session replaced by newer connection (no retry)");
          return;
        }
        if (shouldReconnect) {
          if (roomIdForReconnect && sessionIdForReconnect) {
            reconnectionRoomId = roomIdForReconnect;
            reconnectionSessionId = sessionIdForReconnect;
          }
          scheduleReconnect();
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to connect to Colyseus";
      debugLog("CONNECT_FAILED", { roomId: activeRoomId, roomName: options.roomName, message });

      // If this connect attempt is stale (disposed or superseded by a newer attempt),
      // do not emit DISCONNECTED, do not schedule reconnect, and do not mutate shared
      // reconnection state. The live attempt owns reconnect/error semantics.
      if (isStale()) {
        return;
      }

      reconnectionRoomId = null;
      reconnectionSessionId = null;
      connected = false;
      room = null;
      options.onMessage({ type: "DISCONNECTED", payload: undefined });

      const tableIdCandidate = options.joinOptions?.tableId;
      if (
        activeRoomId &&
        isRoomNotFoundError(message) &&
        !attemptedRoomIdRecovery &&
        typeof tableIdCandidate === "string" &&
        tableIdCandidate.length > 0
      ) {
        attemptedRoomIdRecovery = true;
        try {
          const recoveredRoomId = await resolveRoomIdByTableId(tableIdCandidate);
          if (recoveredRoomId && recoveredRoomId !== activeRoomId) {
            activeRoomId = recoveredRoomId;
            debugLog("ROOM_ID_RECOVERED", { tableId: tableIdCandidate, recoveredRoomId });
            await connect();
            return;
          }
          debugLog("ROOM_ID_RECOVERY_MISS", { tableId: tableIdCandidate, attemptedRoomId: activeRoomId });
        } catch (recoveryErr: unknown) {
          debugLog("ROOM_ID_RECOVERY_FAILED", {
            tableId: tableIdCandidate,
            message: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
          });
        }
      }

      if (
        (!message || message.trim().length === 0) &&
        !attemptedEmptyErrorRetry &&
        typeof tableIdCandidate === "string" &&
        tableIdCandidate.length > 0
      ) {
        attemptedEmptyErrorRetry = true;
        try {
          const recoveredRoomId = await resolveRoomIdByTableId(tableIdCandidate);
          if (recoveredRoomId && recoveredRoomId !== activeRoomId) {
            activeRoomId = recoveredRoomId;
            debugLog("EMPTY_ERROR_ROOM_ID_RECOVERED", { tableId: tableIdCandidate, recoveredRoomId });
          }
        } catch (recoveryErr: unknown) {
          debugLog("EMPTY_ERROR_ROOM_ID_RECOVERY_FAILED", {
            tableId: tableIdCandidate,
            message: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
          });
        }
      }

      options.onError?.(message);
      if (isRetryableJoinError(message) && !terminalJoinFailure) {
        scheduleReconnect();
      }
    }
  };

  void connect();

  return {
    connected: () => connected,
    send: (message) => {
      if (!connected || !room) return false;
      room.send(message.type, message.payload);
      return true;
    },
    disconnect: (consented: boolean = false) => {
      disposed = true;
      connectAttemptId = DISPOSED_CONNECT_GEN;
      shouldReconnect = false;
      debugLog("DISCONNECT_REQUESTED", { roomId: room?.roomId ?? activeRoomId });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (!room) return;
      connected = false;
      try {
        room.leave(consented);
      } catch {}
      room = null;
    },
    getNativeRoom: () => room,
  };
}
