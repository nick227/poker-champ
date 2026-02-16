import { z } from "zod";
import { ActionPayloadSchema } from "./action";

const SchemaVersion = z.literal(1).default(1);
const StreetEnum = z.enum(["WAITING", "PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"]);
const PlayerStatusEnum = z.enum(["WAITING", "ACTIVE", "FOLDED", "ALL_IN", "ABANDONED", "OUT"]);
const VisibilityEnum = z.enum(["PUBLIC", "PRIVATE"]);
const JoinModeEnum = z.enum(["NEW", "RESTORE"]);
export const TableErrorCodeEnum = z.enum([
  "NOT_YOUR_TURN",
  "INVALID_ACTION",
  "INSUFFICIENT_FUNDS",
  "TABLE_NOT_FOUND",
  "BUYIN_INVALID",
  "UNAUTHORIZED",
]);

const SnapshotReasonEnum = z.enum([
  "JOIN",
  "RECONNECT",
  "ACTION_ACCEPTED",
  "BOT_ACTION",
  "AUTO_TRANSITION",
  "HAND_START",
  "HAND_END",
  "SEAT_CHANGE",
]);

export const TableJoinOptionsSchema = z.object({
  tableId: z.string().min(1).optional(),
  name: z.string().min(1).max(80).optional(),
  buyInCents: z.number().int().positive(),
  password: z.string().min(1).max(64).optional(),
});

export const AddBotPayloadSchema = z.object({
  name: z.string().min(1).max(80).default("Bot"),
  buyInCents: z.number().int().positive(),
});
export const RemoveBotPayloadSchema = z.object({
  botId: z.string().min(1),
});

export const TableInboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ACTION"), payload: ActionPayloadSchema }),
  z.object({ type: z.literal("ADD_BOT"), payload: AddBotPayloadSchema }),
  z.object({ type: z.literal("REMOVE_BOT"), payload: RemoveBotPayloadSchema }),
]);

export const HeroActionOptionsSchema = z.object({
  canFold: z.boolean(),
  canCheck: z.boolean(),
  canCall: z.boolean(),
  canBet: z.boolean(),
  canRaise: z.boolean(),
  canAllIn: z.boolean(),
  callAmount: z.number().int().nonnegative().default(0),
  minRaiseTo: z.number().int().positive().optional(),
  maxRaiseTo: z.number().int().positive().optional(),
});

export const TableSeatSnapshotSchema = z.object({
  seat: z.number().int().min(0),
  occupied: z.boolean(),
  userId: z.string().min(1).optional(),
  isBot: z.boolean().default(false),
  name: z.string().min(1).default(""),
  status: PlayerStatusEnum.default("OUT"),
  stackCents: z.number().int().nonnegative().default(0),
  roundBetCents: z.number().int().nonnegative().default(0),
  committedCents: z.number().int().nonnegative().default(0),
  connected: z.boolean().default(false),
  isDealer: z.boolean().default(false),
  isToAct: z.boolean().default(false),
});

export const TableSnapshotPayloadSchema = z.object({
  version: SchemaVersion,
  snapshotId: z.string().min(1),
  emittedAtTs: z.number().int().nonnegative(),
  serverTimeTs: z.number().int().nonnegative(),
  stateHash: z.string().min(1),
  reason: SnapshotReasonEnum,
  actionId: z.string().min(1).optional(),
  nextHandAtTs: z.number().int().nonnegative().optional(),

  table: z.object({
    tableId: z.string().min(1),
    tableName: z.string().min(1),
    visibility: VisibilityEnum,
    maxSeats: z.number().int().min(2).max(10),
    smallBlindCents: z.number().int().positive(),
    bigBlindCents: z.number().int().positive(),
    minBuyInCents: z.number().int().positive(),
    maxBuyInCents: z.number().int().positive(),
  }),

  hand: z.object({
    handId: z.string(),
    handNumber: z.number().int().nonnegative(),
    street: StreetEnum,
    dealerSeat: z.number().int().min(0),
    toActSeat: z.number().int().min(0),
    actionCount: z.number().int().nonnegative(),
    roundCurrentBetCents: z.number().int().nonnegative(),
    minRaiseCents: z.number().int().nonnegative(),
    potCents: z.number().int().nonnegative(),
    board: z.array(z.string().min(2).max(2)).max(5),
  }).optional(), // street WAITING / hand undefined means no active hand

  seats: z.array(TableSeatSnapshotSchema).min(2).max(10),

  hero: z.object({
    userId: z.string().min(1),
    youAreSeated: z.boolean(),
    seat: z.number().int().min(0).optional(),
    holeCards: z.array(z.string().min(2).max(2)).length(2).optional(),
    actionOptions: HeroActionOptionsSchema.optional(),
  }),

  lastHandResult: z
    .object({
      handId: z.string().min(1),
      reason: z.enum(["LAST_PLAYER", "SHOWDOWN"]),
      potCents: z.number().int().nonnegative(),
      winnerId: z.string().min(1).optional(),
      payoutsByUserId: z.record(z.string(), z.number().int().nonnegative()).default({}),
      board: z.array(z.string().min(2).max(2)).max(5).optional(),
      winnerHoleCards: z.array(z.string().min(2).max(2)).length(2).optional(),
      winningHandDescr: z.string().optional(),
    })
    .optional(),
});

export const TableOutboundMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("WELCOME"),
    payload: z.object({
      version: SchemaVersion,
      roomId: z.string().min(1),
      playerId: z.string().min(1),
      tableId: z.string().min(1),
      joinMode: JoinModeEnum,
    }),
  }),
  z.object({
    type: z.literal("SESSION_RESTORED"),
    payload: z.object({
      version: SchemaVersion,
      userId: z.string().min(1),
      deadlineTs: z.number(),
      joinMode: JoinModeEnum,
    }),
  }),
  z.object({
    type: z.literal("TABLE_SNAPSHOT"),
    payload: TableSnapshotPayloadSchema,
  }),
  z.object({
    type: z.literal("ERROR"),
    payload: z.object({
      version: SchemaVersion,
      code: z.union([TableErrorCodeEnum, z.string().min(1)]),
      message: z.string().optional(),
      details: z.unknown().optional(),
    }),
  }),
]);

export type TableJoinOptions = z.infer<typeof TableJoinOptionsSchema>;
export type TableInboundMessage = z.infer<typeof TableInboundMessageSchema>;
export type TableOutboundMessage = z.infer<typeof TableOutboundMessageSchema>;
export type TableSnapshotPayload = z.infer<typeof TableSnapshotPayloadSchema>;
export type HeroActionOptions = z.infer<typeof HeroActionOptionsSchema>;
export type TableErrorCode = z.infer<typeof TableErrorCodeEnum>;
