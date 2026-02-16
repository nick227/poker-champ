import {
  LobbyInboundMessageSchema,
  LobbyOutboundMessageSchema,
  TableInboundMessageSchema,
  TableOutboundMessageSchema,
} from "@poker-champ/realtime-contract";

const lifecycleTypes = new Set(["CONNECTED", "DISCONNECTED", "RECONNECTING"]);

export function isValidLobbyOutbound(type: string, payload: unknown): boolean {
  if (lifecycleTypes.has(type)) return true;
  return LobbyOutboundMessageSchema.safeParse({ type, payload }).success;
}

export function isValidTableOutbound(type: string, payload: unknown): boolean {
  if (lifecycleTypes.has(type)) return true;
  return TableOutboundMessageSchema.safeParse({ type, payload }).success;
}

export function isValidLobbyInbound(type: string, payload?: unknown): boolean {
  return LobbyInboundMessageSchema.safeParse({ type, payload }).success;
}

export function isValidTableInbound(type: string, payload: unknown): boolean {
  return TableInboundMessageSchema.safeParse({ type, payload }).success;
}
