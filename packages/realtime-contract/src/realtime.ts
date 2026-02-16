import { z } from "zod";
import { CreateTableSchema, JoinTableSchema } from "./lobby";

export const LobbyInboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("LIST_TABLES"), payload: z.unknown().optional() }),
  z.object({ type: z.literal("CREATE_TABLE"), payload: CreateTableSchema }),
  z.object({ type: z.literal("JOIN_TABLE"), payload: JoinTableSchema }),
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
