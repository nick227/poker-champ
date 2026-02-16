import { Client } from "@colyseus/sdk";

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
  disconnect: () => void;
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
    }, 2000);
  };

  const connect = () => {
    try {
      socket = new WebSocket(wsUrl);
    } catch (err: any) {
      options.onError?.(err?.message ?? "Unable to initialize websocket");
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
    };
  }

  let connected = false;
  let shouldReconnect = true;
  let room: any = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (!shouldReconnect || reconnectTimer) return;
    options.onMessage({ type: "RECONNECTING" });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, 2000);
  };

  const connect = async () => {
    try {
      const client = new Client(url);
      room = options.roomId
        ? await client.joinById(options.roomId, options.joinOptions ?? {})
        : await client.joinOrCreate(options.roomName ?? "lobby", options.joinOptions ?? {});

      connected = true;
      options.onMessage({ type: "CONNECTED" });
      options.onOpen?.();

      room.onMessage("*", (type: string, payload: unknown) => {
        options.onMessage({ type, payload });
      });

      room.onError((code: number, message: string) => {
        options.onError?.(`Colyseus error (${code}): ${message}`);
      });

      room.onLeave(() => {
        connected = false;
        options.onMessage({ type: "DISCONNECTED" });
        options.onClose?.();
        scheduleReconnect();
      });
    } catch (err: any) {
      connected = false;
      options.onMessage({ type: "DISCONNECTED" });
      options.onError?.(err?.message ?? "Unable to connect to Colyseus");
      scheduleReconnect();
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
    disconnect: () => {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (!room) return;
      connected = false;
      try {
        room.leave();
      } catch {}
      room = null;
    },
  };
}

