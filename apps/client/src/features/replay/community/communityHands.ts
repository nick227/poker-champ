import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { assertReplaySnapshotsShape } from "./assertReplaySnapshotsShape";

export type CommunityHandDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type CommunityHand = {
  id: string;
  title: string;
  summary: string;
  difficulty: CommunityHandDifficulty;
  snapshots: readonly TableSnapshotPayload[];
};

const COMMUNITY_HAND_BASE_TS = Date.parse("2026-01-01T00:00:00.000Z");

type CommunityLastAction = {
  street: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  actorUserId: "hero-user" | "villain-user";
  action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
  amountCents: number;
  raiseToCents?: number;
  potAfterCents: number;
};

function createSnapshot(
  seq: number,
  input: {
    street: "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
    toActSeat: number;
    potCents: number;
    board: string[];
    heroStackCents: number;
    villainStackCents: number;
    heroBetCents: number;
    villainBetCents: number;
    reason: TableSnapshotPayload["reason"];
    lastAction: CommunityLastAction;
    lastHandResult?: NonNullable<TableSnapshotPayload["lastHandResult"]>;
  },
): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: `community-cbet-1-${seq}`,
    snapshotSeq: seq,
    emittedAtTs: COMMUNITY_HAND_BASE_TS + seq,
    serverTimeTs: COMMUNITY_HAND_BASE_TS + seq,
    stateHash: `community-cbet-1-hash-${seq}`,
    reason: input.reason,
    table: {
      tableId: "community-table-1",
      tableName: "Community Lesson Table",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
      showStats: true,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "hero-user",
        name: "Hero",
        stackCents: input.heroStackCents,
        roundBetCents: input.heroBetCents,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE",
        isToAct: input.toActSeat === 0,
        isBot: false,
      },
      {
        seat: 1,
        occupied: true,
        userId: "villain-user",
        name: "Villain",
        stackCents: input.villainStackCents,
        roundBetCents: input.villainBetCents,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        status: "ACTIVE",
        isToAct: input.toActSeat === 1,
        isBot: false,
      },
    ],
    hero: {
      userId: "hero-user",
      youAreSeated: true,
      seat: 0,
      holeCards: ["As", "Kd"],
    },
    lastAction: {
      handId: "community-cbet-hand-1",
      seq,
      street: input.lastAction.street,
      actorUserId: input.lastAction.actorUserId,
      actorKind: "HUMAN",
      action: input.lastAction.action,
      amountCents: input.lastAction.amountCents,
      raiseToCents: input.lastAction.raiseToCents,
      potAfterCents: input.lastAction.potAfterCents,
      origin: "PLAYER",
      createdAtTs: COMMUNITY_HAND_BASE_TS + seq,
    },
    lastHandResult: input.lastHandResult,
    hand: {
      handId: "community-cbet-hand-1",
      handNumber: 1,
      street: input.street,
      board: input.board,
      potCents: input.potCents,
      dealerSeat: 1,
      sbSeat: 0,
      bbSeat: 1,
      toActSeat: input.toActSeat,
      actionCount: seq,
      roundCurrentBetCents: Math.max(input.heroBetCents, input.villainBetCents),
      minRaiseCents: 100,
    },
  };
}

const COMMUNITY_HAND_CBET_PRESSURE_SNAPSHOTS = [
  createSnapshot(1, {
    street: "PREFLOP",
    toActSeat: 1,
    potCents: 400,
    board: [],
    heroStackCents: 1700,
    villainStackCents: 1900,
    heroBetCents: 300,
    villainBetCents: 100,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "PREFLOP",
      actorUserId: "hero-user",
      action: "RAISE",
      amountCents: 250,
      raiseToCents: 300,
      potAfterCents: 400,
    },
  }),
  createSnapshot(2, {
    street: "PREFLOP",
    toActSeat: 0,
    potCents: 600,
    board: [],
    heroStackCents: 1700,
    villainStackCents: 1700,
    heroBetCents: 300,
    villainBetCents: 300,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "PREFLOP",
      actorUserId: "villain-user",
      action: "CALL",
      amountCents: 200,
      potAfterCents: 600,
    },
  }),
  createSnapshot(3, {
    street: "FLOP",
    toActSeat: 0,
    potCents: 600,
    board: ["Ah", "7d", "2c"],
    heroStackCents: 1700,
    villainStackCents: 1700,
    heroBetCents: 0,
    villainBetCents: 0,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "FLOP",
      actorUserId: "villain-user",
      action: "CHECK",
      amountCents: 0,
      potAfterCents: 600,
    },
  }),
  createSnapshot(4, {
    street: "FLOP",
    toActSeat: 1,
    potCents: 900,
    board: ["Ah", "7d", "2c"],
    heroStackCents: 1400,
    villainStackCents: 1700,
    heroBetCents: 300,
    villainBetCents: 0,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "FLOP",
      actorUserId: "hero-user",
      action: "BET",
      amountCents: 300,
      potAfterCents: 900,
    },
  }),
  createSnapshot(5, {
    street: "FLOP",
    toActSeat: 0,
    potCents: 1200,
    board: ["Ah", "7d", "2c"],
    heroStackCents: 1400,
    villainStackCents: 1400,
    heroBetCents: 300,
    villainBetCents: 300,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "FLOP",
      actorUserId: "villain-user",
      action: "CALL",
      amountCents: 300,
      potAfterCents: 1200,
    },
  }),
  createSnapshot(6, {
    street: "TURN",
    toActSeat: 0,
    potCents: 1200,
    board: ["Ah", "7d", "2c", "9s"],
    heroStackCents: 1400,
    villainStackCents: 1400,
    heroBetCents: 0,
    villainBetCents: 0,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "TURN",
      actorUserId: "villain-user",
      action: "CHECK",
      amountCents: 0,
      potAfterCents: 1200,
    },
  }),
  createSnapshot(7, {
    street: "TURN",
    toActSeat: 1,
    potCents: 1800,
    board: ["Ah", "7d", "2c", "9s"],
    heroStackCents: 800,
    villainStackCents: 1400,
    heroBetCents: 600,
    villainBetCents: 0,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "TURN",
      actorUserId: "hero-user",
      action: "BET",
      amountCents: 600,
      potAfterCents: 1800,
    },
  }),
  createSnapshot(8, {
    street: "TURN",
    toActSeat: 0,
    potCents: 2400,
    board: ["Ah", "7d", "2c", "9s"],
    heroStackCents: 800,
    villainStackCents: 800,
    heroBetCents: 600,
    villainBetCents: 600,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "TURN",
      actorUserId: "villain-user",
      action: "CALL",
      amountCents: 600,
      potAfterCents: 2400,
    },
  }),
  createSnapshot(9, {
    street: "RIVER",
    toActSeat: 0,
    potCents: 2400,
    board: ["Ah", "7d", "2c", "9s", "3h"],
    heroStackCents: 800,
    villainStackCents: 800,
    heroBetCents: 0,
    villainBetCents: 0,
    reason: "ACTION_ACCEPTED",
    lastAction: {
      street: "RIVER",
      actorUserId: "villain-user",
      action: "CHECK",
      amountCents: 0,
      potAfterCents: 2400,
    },
  }),
  createSnapshot(10, {
    street: "SHOWDOWN",
    toActSeat: 0,
    potCents: 2400,
    board: ["Ah", "7d", "2c", "9s", "3h"],
    heroStackCents: 3200,
    villainStackCents: 800,
    heroBetCents: 0,
    villainBetCents: 0,
    reason: "HAND_END",
    lastAction: {
      street: "RIVER",
      actorUserId: "hero-user",
      action: "CHECK",
      amountCents: 0,
      potAfterCents: 2400,
    },
    lastHandResult: {
      handId: "community-cbet-hand-1",
      reason: "SHOWDOWN",
      potCents: 2400,
      winnerId: "hero-user",
      payoutsByUserId: {
        "hero-user": 2400,
      },
      board: ["Ah", "7d", "2c", "9s", "3h"],
      showdownHoleCardsByUserId: {
        "hero-user": ["As", "Kd"],
        "villain-user": ["Qh", "Js"],
      },
      winningHandDescr: "Top pair, ace kicker",
    },
  }),
] as const satisfies readonly TableSnapshotPayload[];

const COMMUNITY_HANDS = [
  {
    id: "cbet-pressure",
    title: "C-Bet Pressure on Ace-High Flop",
    summary: "Preflop raise, single caller, and a clean continuation bet spot on A-high texture.",
    difficulty: "Beginner",
    snapshots: assertReplaySnapshotsShape(
      COMMUNITY_HAND_CBET_PRESSURE_SNAPSHOTS,
      "cbet-pressure",
    ),
  },
] as const satisfies readonly CommunityHand[];

export const COMMUNITY_HAND_DEFAULT_ID = COMMUNITY_HANDS[0].id;

export function getCommunityHandById(id: string): CommunityHand | null {
  return COMMUNITY_HANDS.find((hand) => hand.id === id) ?? null;
}

export function getDefaultCommunityHand(): CommunityHand {
  return COMMUNITY_HANDS[0];
}
