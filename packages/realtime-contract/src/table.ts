import { z } from "zod";
import { ActionPayloadSchema } from "./action.js";

const SchemaVersion = z.literal(1).default(1);
const StreetEnum = z.enum(["WAITING", "PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"]);
const LastActionStreetEnum = z.enum(["PREFLOP", "FLOP", "TURN", "RIVER"]);
const PlayerStatusEnum = z.enum(["WAITING", "ACTIVE", "FOLDED", "ALL_IN", "ABANDONED", "OUT"]);
const VisibilityEnum = z.enum(["PUBLIC", "PRIVATE"]);
const JoinModeEnum = z.enum(["NEW", "RESTORE"]);
const LastActionOriginEnum = z.enum(["PLAYER", "AUTO", "FORCED"]);
export const TableErrorCodeEnum = z.enum([
  "NOT_YOUR_TURN",
  "INVALID_ACTION",
  "INSUFFICIENT_FUNDS",
  "TABLE_NOT_FOUND",
  "TABLE_GONE",
  "BUYIN_INVALID",
  "UNAUTHORIZED",
]);

const SnapshotReasonEnum = z.enum([
  "JOIN",
  "RECONNECT",
  "ACTION_ACCEPTED",
  "BOT_ACTION",
  "RUNOUT_STAGE",
  "AUTO_TRANSITION",
  "HAND_START",
  "HAND_SHOWDOWN",
  "HAND_END",
  "SEAT_CHANGE",
]);

export const TableJoinOptionsSchema = z.object({
  tableId: z.string().min(1).optional(),
  name: z.string().min(1).max(80).optional(),
  buyInCents: z.number().int().positive(),
  password: z.string().min(1).max(64).optional(),
});

export const ActionEnvelopePayloadSchema = z.object({
  actionId: z.string().min(1),
  payload: ActionPayloadSchema,
});

export const ActionWithIdPayloadSchema = z.intersection(
  ActionPayloadSchema,
  z.object({
    actionId: z.string().min(1),
  }),
);

export const AddBotPayloadSchema = z.object({
  botId: z.string().min(1).optional(),
  name: z.string().min(1).max(80).optional(),
  buyInCents: z.number().int().positive(),
});
export const ListBotsPayloadSchema = z.object({});
export const RemoveBotPayloadSchema = z.object({
  botId: z.string().min(1),
});

export const BotSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().min(1).optional(),
});

export const BotsListPayloadSchema = z.object({
  bots: z.array(BotSummarySchema),
});

export const ChatPayloadSchema = z.object({
  text: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(500)),
});

export const SetSittingOutPayloadSchema = z.object({
  sittingOut: z.boolean(),
});

export const ChatMessagePayloadSchema = z.object({
  id: z.string().min(1),
  tableId: z.string().min(1),
  senderUserId: z.string().min(1),
  senderName: z.string().min(1),
  text: z.string().min(1),
  createdAtTs: z.number().int().nonnegative(),
});

export const TableInboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ACTION"), payload: z.union([ActionWithIdPayloadSchema, ActionEnvelopePayloadSchema]) }),
  z.object({ type: z.literal("ADD_BOT"), payload: AddBotPayloadSchema }),
  z.object({ type: z.literal("LIST_BOTS"), payload: ListBotsPayloadSchema }),
  z.object({ type: z.literal("REMOVE_BOT"), payload: RemoveBotPayloadSchema }),
  z.object({ type: z.literal("CHAT"), payload: ChatPayloadSchema }),
  z.object({ type: z.literal("SET_SITTING_OUT"), payload: SetSittingOutPayloadSchema }),
]);

export const HeroActionOptionsSchema = z.object({
  canFold: z.boolean(),
  canCheck: z.boolean(),
  canCall: z.boolean(),
  canBet: z.boolean(),
  canRaise: z.boolean(),
  canAllIn: z.boolean(),
  primaryWagerAction: z.enum(["NONE", "BET", "RAISE"]).default("NONE"),
  callAmount: z.number().int().nonnegative().default(0),
  minRaiseTo: z.number().int().positive().optional(),
  maxRaiseTo: z.number().int().positive().optional(),
});

export const HeroCalculationsSchema = z.object({
  mode: z.enum(["LIVE_ADVISORY", "SHOWDOWN_ANALYSIS"]).default("SHOWDOWN_ANALYSIS"),
  stale: z.boolean().default(false),
  equityPct: z.number().int().min(0).max(100).optional(),
  potOddsPct: z.number().int().min(0).max(100).optional(),
  outs: z.number().int().nonnegative().optional(),
  updatedAtTs: z.number().int().nonnegative().optional(),
});

/** Session-scoped player stats (VPIP/PFR). Partial for incremental rollout. */
export const HeroPlayerStatsSchema = z
  .object({
    hands: z.number().int().nonnegative(),
    vpipPct: z.number().min(0).max(100),
    pfrPct: z.number().min(0).max(100),
  })
  .partial();

export const CalculationsMetaSchema = z.object({
  computedAtTs: z.number().int().nonnegative().optional(),
  street: StreetEnum.optional(),
  playersConsidered: z.number().int().nonnegative().optional(),
  stateHash: z.string().min(1).optional(),
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
  disconnectDeadlineTs: z.number().int().nonnegative().default(0),
  isDealer: z.boolean().default(false),
  isToAct: z.boolean().default(false),
});

export const TableLastActionSchema = z.object({
  handId: z.string().min(1),
  seq: z.number().int().positive(),
  street: LastActionStreetEnum,
  actorUserId: z.string().min(1),
  actorKind: z.enum(["HUMAN", "BOT"]),
  action: z.enum(["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALL_IN"]),
  amountCents: z.number().int().nonnegative(),
  raiseToCents: z.number().int().positive().optional(),
  potAfterCents: z.number().int().nonnegative(),
  origin: LastActionOriginEnum,
  createdAtTs: z.number().int().nonnegative(),
});

export const TableSnapshotPayloadSchema = z.object({
  version: SchemaVersion,
  snapshotId: z.string().min(1),
  snapshotSeq: z.number().int().positive(),
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
    showStats: z.boolean().default(true),
  }),

  hand: z.object({
    handId: z.string(),
    handNumber: z.number().int().nonnegative(),
    street: StreetEnum,
    dealerSeat: z.number().int().min(0),
    sbSeat: z.number().int().min(0),
    bbSeat: z.number().int().min(0),
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
    calculations: HeroCalculationsSchema.optional(),
    playerStats: HeroPlayerStatsSchema.optional(),
  }),

  calculationsMeta: CalculationsMetaSchema.optional(),
  lastAction: TableLastActionSchema.optional(),

  lastHandResult: z
    .object({
      handId: z.string().min(1),
      reason: z.enum(["LAST_PLAYER", "SHOWDOWN"]),
      potCents: z.number().int().nonnegative(),
      winnerId: z.string().min(1).optional(),
      payoutsByUserId: z.record(z.string(), z.number().int().nonnegative()).default({}),
      board: z.array(z.string().min(2).max(2)).max(5).optional(),
      showdownHoleCardsByUserId: z
        .record(z.string(), z.tuple([z.string().min(2).max(2), z.string().min(2).max(2)]))
        .optional(),
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
  z.object({ type: z.literal("BOTS_LIST"), payload: BotsListPayloadSchema }),
  z.object({ type: z.literal("CHAT_MESSAGE"), payload: ChatMessagePayloadSchema }),
]);

export type TableJoinOptions = z.infer<typeof TableJoinOptionsSchema>;
export type TableInboundMessage = z.infer<typeof TableInboundMessageSchema>;
export type TableOutboundMessage = z.infer<typeof TableOutboundMessageSchema>;
export type TableSeatSnapshot = z.infer<typeof TableSeatSnapshotSchema>;
export type TableSnapshotPayload = z.infer<typeof TableSnapshotPayloadSchema>;
export type TableLastAction = z.infer<typeof TableLastActionSchema>;
export type HeroActionOptions = z.infer<typeof HeroActionOptionsSchema>;
export type HeroPlayerStats = z.infer<typeof HeroPlayerStatsSchema>;
export type TableErrorCode = z.infer<typeof TableErrorCodeEnum>;
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;
export type BotSummary = z.infer<typeof BotSummarySchema>;
