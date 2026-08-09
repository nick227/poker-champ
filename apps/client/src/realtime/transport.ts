import { Client } from "@colyseus/sdk";
import { lobby, request } from "@poker-champ/sdk";
import {
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_ATTEMPTS_WITH_TOKEN,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from "@/constants";

/** Close code when leaving a stale/superseded connection. Must match PokerRoom session-replaced code. */
const LEAVE_CODE_STALE_OR_REPLACED = 4001;

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

const transportCapabilities = {
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

type ConnectTargetResponse = { tableId?: string; roomId?: string };

/**
 * Canonical room resolution: `GET /api/lobby/tables/:tableId/connect-target` -> `{ tableId, roomId }`.
 * This is the server-authoritative source of truth for "which Colyseus room currently serves
 * this table," replacing guesswork on the client. Returns null (rather than throwing) on any
 * failure — including 404 on servers that don't have the endpoint deployed yet — so callers can
 * fall back to the heuristic below during rollout.
 */
async function fetchConnectTarget(tableId: string): Promise<string | null> {
  try {
    const result = await request<ConnectTargetResponse>(
      "GET",
      `/api/lobby/tables/${encodeURIComponent(tableId)}/connect-target`,
    );
    const roomId = result?.roomId;
    return typeof roomId === "string" && roomId.length > 0 ? roomId : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Colyseus roomId from a tableId, preferring the canonical connect-target endpoint.
 * Falls back to scanning the table list (heuristic) only if the canonical lookup is unavailable —
 * this backstop can be removed once connect-target has been live long enough to trust exclusively.
 */
async function resolveRoomIdByTableId(tableId: string): Promise<string | null> {
  const canonical = await fetchConnectTarget(tableId);
  if (canonical) return canonical;

  const data = await lobby.listTables();
  const match = (data.tables ?? []).find((t) => String(t.tableId ?? "") === tableId);
  const roomId = match?.roomId;
  return typeof roomId === "string" && roomId.length > 0 ? roomId : null;
}

/** Colyseus 0.17+ expects `client.reconnect("roomId:token")` from `room.reconnectionToken`. */
export function captureReconnectionToken(room: {
  roomId?: string;
  sessionId?: string;
  reconnectionToken?: string;
}): string | null {
  const roomId = room.roomId;
  if (!roomId) return null;
  const token = room.reconnectionToken;
  if (typeof token === "string" && token.length > 0) {
    return token.includes(":") ? token : `${roomId}:${token}`;
  }
  const sessionId = room.sessionId;
  if (typeof sessionId === "string" && sessionId.length > 0) {
    return `${roomId}:${sessionId}`;
  }
  return null;
}

export type ConnectFailureKind = "retryable" | "terminal";

/** Classify Colyseus connect/reconnect errors so we do not spin on disposed or expired rooms. */
export function classifyConnectFailure(message: string): ConnectFailureKind {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "retryable";
  if (normalized.includes("room \"") && normalized.includes("\" not found")) return "terminal";
  if (normalized.includes("has been disposed")) return "terminal";
  if (normalized.includes("allowreconnection")) return "terminal";
  if (normalized.includes("invalid or expired session")) return "terminal";
  if (normalized.includes("invalid reconnection token")) return "terminal";
  if (normalized.includes("missing_buy_in_cents")) return "terminal";
  if (normalized.includes("insufficient_bankroll") || normalized.includes("insufficient bankroll")) {
    return "terminal";
  }
  if (normalized.includes("bad_join_options")) return "terminal";
  if (normalized.includes("authentication required")) return "terminal";
  return "retryable";
}

/**
 * Exponential backoff with jitter, capped so a real-time reconnect never waits minutes.
 *
 *   delay = min(cap, base * 2^attempt) * (0.5 + random() * 0.5)
 *
 * `attempt` is 0-based (0 = first retry after the initial disconnect). Jittering the delay
 * (rather than using a fixed schedule) avoids a thundering herd where every client reconnects
 * in lockstep after a shared server blip. `random` is injectable so tests can assert exact
 * bounds without relying on statistical sampling of `Math.random`.
 */
export function computeReconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const exponential = RECONNECT_BASE_DELAY_MS * Math.pow(2, safeAttempt);
  const capped = Math.min(RECONNECT_MAX_DELAY_MS, exponential);
  const jitterFactor = 0.5 + random() * 0.5;
  return Math.round(capped * jitterFactor);
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
  /** Set by disconnect(); once true no further attempt of any generation may dispatch or reconnect. */
  let disposed = false;
  /** Monotonic generation: bumped at the start of every connect() attempt. A socket's event
   * handlers capture their own generation number and no-op once superseded, so a late/delayed
   * event from an old socket (e.g. a straggling onopen firing after a newer attempt already
   * connected) cannot clobber the current session's state. */
  let generation = 0;
  let reconnectAttempts = 0;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (disposed || !shouldReconnect || reconnectTimer) return;
    options.onMessage({ type: "RECONNECTING" });
    const delay = computeReconnectDelayMs(reconnectAttempts);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disposed) return;
      connect();
    }, delay);
  };

  const connect = () => {
    const myGeneration = ++generation;
    const isStale = () => disposed || myGeneration !== generation;

    let sock: WebSocket;
    try {
      sock = new WebSocket(wsUrl);
    } catch (err: unknown) {
      if (isStale()) return;
      options.onError?.(err instanceof Error ? err.message : "Unable to initialize websocket");
      scheduleReconnect();
      return;
    }
    socket = sock;

    sock.onopen = () => {
      if (isStale()) return;
      connected = true;
      reconnectAttempts = 0;
      options.onMessage({ type: "CONNECTED" });
      options.onOpen?.();
    };

    sock.onclose = () => {
      if (isStale()) return;
      connected = false;
      options.onMessage({ type: "DISCONNECTED" });
      options.onClose?.();
      scheduleReconnect();
    };

    sock.onerror = () => {
      if (isStale()) return;
      options.onError?.("Realtime transport error");
    };
    sock.onmessage = (event) => {
      if (isStale()) return;
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
      disposed = true;
      shouldReconnect = false;
      generation += 1;
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
  /** When set, connect() uses client.reconnect(reconnectionToken) for seat reservation. */
  let reconnectionToken: string | null = null;
  let attemptedRoomIdRecovery = false;
  let attemptedRoomIdPreflightRecovery = false;
  let attemptedEmptyErrorRetry = false;
  let reconnectAttempts = 0;
  let terminalJoinFailure = false;
  /** Set when server sends ERROR SESSION_REPLACED; we must not reconnect on leave (avoids replace→reconnect loop). */
  let sessionReplacedByNewerConnection = false;
  let reconnectStartTs = 0;
  const MAX_RECONNECT_DURATION_MS = 20 * 60 * 1000;
  
  const debugLog = (...args: unknown[]) => {
     
    console.log("[COLYSEUS_RT]", ...args);
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
    const hasReconnectToken = Boolean(reconnectionToken);
    const maxAttempts = hasReconnectToken ? MAX_RECONNECT_ATTEMPTS_WITH_TOKEN : MAX_RECONNECT_ATTEMPTS;
    if (reconnectAttempts >= maxAttempts) {
      debugLog("RECONNECT_ABORTED_MAX_ATTEMPTS", {
        roomId: activeRoomId,
        roomName: options.roomName,
        reconnectAttempts,
        hasReconnectToken,
      });
      shouldReconnect = false;
      reconnectionToken = null;
      options.onError?.("Could not restore this table session. Return to the lobby and join again.");
      return;
    }

    if (reconnectStartTs === 0) {
      reconnectStartTs = Date.now();
    } else if (Date.now() - reconnectStartTs > MAX_RECONNECT_DURATION_MS) {
      debugLog("RECONNECT_ABORTED_TIMEOUT", {
        roomId: activeRoomId,
        roomName: options.roomName,
        durationMs: Date.now() - reconnectStartTs,
      });
      shouldReconnect = false;
      reconnectionToken = null;
      reconnectStartTs = 0;
      options.onError?.("Session expired. Please rejoin the table.");
      return;
    }

    const delay = computeReconnectDelayMs(reconnectAttempts);
    reconnectAttempts += 1;
    debugLog("SCHEDULE_RECONNECT", {
      roomId: options.roomId,
      roomName: options.roomName,
      hasReconnectToken,
      reconnectAttempts,
      delayMs: delay,
    });
    options.onMessage({ type: "RECONNECTING" });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disposed) return;
      void connect();
    }, delay);
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
      const useReconnect = Boolean(reconnectionToken);
      debugLog("SOCKET_CONNECT_ATTEMPT", {
        url,
        roomId: activeRoomId,
        roomName: options.roomName,
        useReconnect,
        hasJoinOptions: Boolean(options.joinOptions),
        joinOptionKeys: options.joinOptions ? Object.keys(options.joinOptions) : [],
      });
      if (useReconnect && reconnectionToken) {
        room = await client.reconnect(reconnectionToken);
        reconnectionToken = null;
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
      reconnectStartTs = 0;
      terminalJoinFailure = false;
      const currentRoom = room;
      // Store reconnect token immediately on successful join so it's available
      // even if onLeave fires without a clean close code. This is the primary
      // reservation; onLeave also refreshes it as a belt-and-suspenders guard.
      if (shouldReconnect) {
        reconnectionToken = captureReconnectionToken(currentRoom ?? {});
      }
      if (useReconnect) {
        debugLog("RECONNECT_SUCCESS", { roomId: currentRoom?.roomId, sessionId: currentRoom?.sessionId });
      } else {
        debugLog("CONNECTED", { roomId: currentRoom?.roomId ?? options.roomId, sessionId: currentRoom?.sessionId });
      }
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

      currentRoom!.onLeave((code?: number) => {
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
          debugLog("LEAVE_SESSION_REPLACED", { roomId: roomIdForReconnect });
          // Clear token — this session is definitively over.
          reconnectionToken = null;
          return;
        }
        // Consented leave (code 4000) = player intentionally left; clear token.
        const isConsented = code === 4000;
        if (isConsented) {
          reconnectionToken = null;
          return;
        }
        if (shouldReconnect) {
          const refreshed = captureReconnectionToken({
            roomId: roomIdForReconnect ?? undefined,
            sessionId: sessionIdForReconnect ?? undefined,
            reconnectionToken: currentRoom.reconnectionToken,
          });
          if (refreshed) reconnectionToken = refreshed;
          debugLog("RECONNECT_SCHEDULED", { reconnectionToken, closeCode: code });
          scheduleReconnect();
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to connect to Colyseus";
      debugLog("CONNECT_FAILED", { roomId: activeRoomId, roomName: options.roomName, message, useReconnect: Boolean(reconnectionToken) });

      // If this connect attempt is stale (disposed or superseded by a newer attempt),
      // do not emit DISCONNECTED, do not schedule reconnect, and do not mutate shared
      // reconnection state. The live attempt owns reconnect/error semantics.
      if (isStale()) {
        return;
      }

      const failureKind = classifyConnectFailure(message);
      if (failureKind === "terminal") {
        reconnectionToken = null;
        shouldReconnect = false;
        terminalJoinFailure = true;
      }

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

      if (failureKind === "terminal") {
        options.onError?.("This table session has ended. Return to the lobby and join again.");
      } else {
        options.onError?.(message);
      }
      if (failureKind === "retryable" && !terminalJoinFailure) {
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
