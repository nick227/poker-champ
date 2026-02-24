import { z } from "zod";
import { CreateTableSchema, JoinTableSchema, OnlinePlayerSummarySchema } from "./lobby.js";

export const LobbyChatScopeSchema = z.string().min(1).default("lobby");
export const LobbyChatSendPayloadSchema = z.object({
  text: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(500)),
});

export const LobbyChatMessagePayloadSchema = z.object({
  id: z.string().min(1),
  scope: LobbyChatScopeSchema,
  senderUserId: z.string().min(1),
  senderName: z.string().min(1),
  text: z.string().min(1).max(500),
  createdAtTs: z.number().int().nonnegative(),
});

export const LobbyInboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("LIST_TABLES"), payload: z.unknown().optional() }),
  z.object({ type: z.literal("LIST_ONLINE_PLAYERS"), payload: z.unknown().optional() }),
  z.object({ type: z.literal("CREATE_TABLE"), payload: CreateTableSchema }),
  z.object({ type: z.literal("JOIN_TABLE"), payload: JoinTableSchema }),
  z.object({ type: z.literal("SEND_LOBBY_CHAT"), payload: LobbyChatSendPayloadSchema }),
  z.object({ type: z.literal("JOIN_LOBBY_VOICE"), payload: z.unknown().optional() }),
  z.object({ type: z.literal("LEAVE_LOBBY_VOICE"), payload: z.unknown().optional() }),
  z.object({ type: z.literal("VOICE_SIGNAL"), payload: z.unknown().optional() }),
]);

export const LobbyOutboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TABLE_LIST"), payload: z.object({ tables: z.array(z.unknown()) }) }),
  z.object({
    type: z.literal("TABLE_CREATED"),
    payload: z.object({ tableId: z.string().min(1), roomId: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("TABLE_JOIN_INFO"),
    payload: z.object({ tableId: z.string().min(1), roomId: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("ONLINE_COUNT"),
    payload: z.object({ totalOnline: z.number().int().min(0) }),
  }),
  z.object({
    type: z.literal("ONLINE_PLAYERS"),
    payload: z.object({
      totalOnline: z.number().int().min(0),
      generatedAt: z.number().int().nonnegative(),
      players: z.array(OnlinePlayerSummarySchema),
    }),
  }),
  z.object({
    type: z.literal("LOBBY_VOICE_PARTICIPANTS"),
    payload: z.object({
      userIds: z.array(z.string().min(1)),
      serverNowTs: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal("LOBBY_CHAT_MESSAGE"),
    payload: LobbyChatMessagePayloadSchema,
  }),
  z.object({
    type: z.literal("ERROR"),
    payload: z.object({
      code: z.string().min(1),
      message: z.string().optional(),
      details: z.unknown().optional(),
    }),
  }),
]);

export type LobbyInboundMessage = z.infer<typeof LobbyInboundMessageSchema>;
export type LobbyOutboundMessage = z.infer<typeof LobbyOutboundMessageSchema>;
export type LobbyChatMessagePayload = z.infer<typeof LobbyChatMessagePayloadSchema>;
