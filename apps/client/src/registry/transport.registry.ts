export type RealtimeTransportMode = "ws" | "colyseus";
export type TransportScope = "lobby" | "table";

type RealtimeTransportConfig = {
  transport: RealtimeTransportMode;
  url?: string;
  roomName?: string;
  roomId?: string;
  joinOptions?: Record<string, unknown>;
};

type ResolveConfigInput = {
  scope: TransportScope;
  id?: string;
  token?: string | null;
  joinOptions?: Record<string, unknown>;
};

type TransportDefinition = {
  key: RealtimeTransportMode;
  label: string;
  capabilities: {
    supportsRooms: boolean;
    supportsPresence: boolean;
    supportsBinary: boolean;
  };
  resolve: (input: ResolveConfigInput) => RealtimeTransportConfig;
};

function resolveWsConfig(input: ResolveConfigInput): RealtimeTransportConfig {
  if (input.scope === "lobby") {
    return {
      transport: "ws",
      url: process.env.EXPO_PUBLIC_WS_URL,
    };
  }

  const tableId = String(input.id ?? "");
  const base = process.env.EXPO_PUBLIC_WS_URL;
  if (!base) {
    return { transport: "ws", url: undefined };
  }
  const separator = base.includes("?") ? "&" : "?";
  const withTableId = `${base}${separator}tableId=${encodeURIComponent(tableId)}`;
  const withToken = input.token ? `${withTableId}&token=${encodeURIComponent(input.token)}` : withTableId;
  return {
    transport: "ws",
    url: withToken,
  };
}

function resolveColyseusConfig(input: ResolveConfigInput): RealtimeTransportConfig {
  if (input.scope === "lobby") {
    return {
      transport: "colyseus",
      url: process.env.EXPO_PUBLIC_COLYSEUS_URL,
      roomName: "lobby",
      joinOptions: input.token ? { token: input.token } : undefined,
    };
  }

  return {
    transport: "colyseus",
    url: process.env.EXPO_PUBLIC_COLYSEUS_URL,
    roomName: "poker",
    roomId: String(input.id ?? ""),
    joinOptions: {
      ...(input.joinOptions ?? {}),
      ...(input.token ? { token: input.token } : {}),
    },
  };
}

const transportByKey: Record<RealtimeTransportMode, TransportDefinition> = {
  ws: {
    key: "ws",
    label: "WebSocket",
    capabilities: { supportsRooms: true, supportsPresence: true, supportsBinary: false },
    resolve: resolveWsConfig,
  },
  colyseus: {
    key: "colyseus",
    label: "Colyseus",
    capabilities: { supportsRooms: true, supportsPresence: true, supportsBinary: false },
    resolve: resolveColyseusConfig,
  },
};

const transportOrdered: TransportDefinition[] = [transportByKey.ws, transportByKey.colyseus];

const transportRegistry = {
  byKey: transportByKey,
  ordered: transportOrdered,
} as const;

function getRealtimeTransportMode(): RealtimeTransportMode {
  const mode = (process.env.EXPO_PUBLIC_REALTIME_TRANSPORT as RealtimeTransportMode | undefined) ?? "colyseus";
  const safeMode = mode in transportRegistry.byKey ? mode : "colyseus";
  if (safeMode === "ws" && process.env.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_WS !== "true") {
    return "colyseus";
  }
  return safeMode;
}

export function resolveRealtimeTransportConfig(input: ResolveConfigInput): RealtimeTransportConfig {
  const mode = getRealtimeTransportMode();
  return transportRegistry.byKey[mode].resolve(input);
}
