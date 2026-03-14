import { afterEach, describe, expect, it, vi } from "vitest";

import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

import { logger } from "./lib/logger.js";
import { Dealer } from "./engine/Dealer.js";
import { CashierService } from "./engine/economy/CashierService.js";
import { PlayerState } from "./state/PlayerState.js";
import { PokerState } from "./state/PokerState.js";
import { PokerRoom } from "./rooms/PokerRoom.js";

vi.mock("@poker-champ/db", () => {
  const mockTx = {
    userAward: { findMany: () => Promise.resolve([]), create: () => Promise.resolve({}), update: () => Promise.resolve({}) },
    userHandCount: { findMany: () => Promise.resolve([]), update: () => Promise.resolve({}) },
    awardGrantEvent: { create: () => Promise.resolve({}) },
    $executeRawUnsafe: () => Promise.resolve(0),
  };
  return {
    getPrisma: () => ({
      user: { findUnique: () => Promise.resolve(null), findMany: () => Promise.resolve([]) },
      tableSnapshotLog: { create: () => Promise.resolve({}) },
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
    }),
    disconnectPrisma: () => Promise.resolve(),
  };
});

type LogMethod = "info" | "warn";
type FakeClient = {
  sessionId: string;
  auth?: { userId: string };
  leave: () => void;
  send: (type: string, payload: unknown) => void;
  sentByType: Record<string, unknown[]>;
  latestSnapshot: TableSnapshotPayload | null;
};

function hasValue(payload: Record<string, unknown>, key: string): boolean {
  if (!(key in payload)) return false;
  const value = payload[key];
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function expectFields(payload: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    expect(hasValue(payload, field), `missing field ${field}`).toBe(true);
  }
}

function getLogEntries(spy: ReturnType<typeof vi.spyOn>, method: LogMethod, msg: string) {
  return spy.mock.calls
    .filter((call) => call[1] === msg)
    .map((call) => ({ method, payload: (call[0] ?? {}) as Record<string, unknown>, msg }));
}

function makePlayer(input: {
  id: string;
  name: string;
  seat: number;
  kind?: PlayerState["kind"];
  status?: PlayerState["status"];
  connected?: boolean;
  needsAction?: boolean;
  stackCents?: number;
  roundBetCents?: number;
  committedCents?: number;
}) {
  const player = new PlayerState();
  player.id = input.id;
  player.userId = input.id;
  player.kind = input.kind ?? "HUMAN";
  player.name = input.name;
  player.seat = input.seat;
  player.status = input.status ?? "ACTIVE";
  player.connected = input.connected ?? true;
  player.needsAction = input.needsAction ?? true;
  player.stackCents = input.stackCents ?? 10_000;
  player.roundBetCents = input.roundBetCents ?? 0;
  player.committedCents = input.committedCents ?? 0;
  return player;
}

function makeState(maxSeats = 2) {
  const state = new PokerState();
  state.tableId = "table_log_contract";
  state.tableName = "Log Contract";
  state.maxSeats = maxSeats;
  for (let i = 0; i < maxSeats; i += 1) state.seats.push("");
  return state;
}

function makeClient(sessionId: string): FakeClient {
  const sentByType: Record<string, unknown[]> = {};
  const client: FakeClient = {
    sessionId,
    auth: undefined,
    sentByType,
    latestSnapshot: null,
    leave: () => {},
    send: (type: string, payload: unknown) => {
      if (!sentByType[type]) sentByType[type] = [];
      sentByType[type].push(payload);
      if (type === "TABLE_SNAPSHOT") client.latestSnapshot = payload as TableSnapshotPayload;
    },
  };
  return client;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await delay(20);
  }
}

function pickProgressAction(snapshot: TableSnapshotPayload): { action: "CALL" | "CHECK" } {
  const options = snapshot.hero.actionOptions;
  if (options?.canCall) return { action: "CALL" };
  if (options?.canCheck) return { action: "CHECK" };
  throw new Error("Expected a progress action (CALL or CHECK) to be available");
}

async function setupTwoPlayerRoom() {
  (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5_000 });
  (CashierService as any).processCashGameCashOut = async () => ({ success: true });

  const room = new PokerRoom() as any;
  room.setMetadata = async () => {};
  room.roomId = "room_log_contract";
  room.onCreate({
    tableConfig: {
      tableId: "table_log_contract",
      name: "Log Contract",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2_000,
      maxBuyInCents: 20_000,
      visibility: "PUBLIC",
      createdAt: Date.now(),
    },
  });

  (room.dealer as { scheduleHumanTurnTimeout?: (userId: string) => void }).scheduleHumanTurnTimeout = () => {};

  const clientA = makeClient("sess_log_a");
  const clientB = makeClient("sess_log_b");

  await room.onJoin(clientA as any, { buyInCents: 5_000 }, { userId: "user_a", username: "alice" });
  await room.onJoin(clientB as any, { buyInCents: 5_000 }, { userId: "user_b", username: "bob" });

  await waitFor(
    () => Boolean(clientA.latestSnapshot?.hand?.handId) && Boolean(clientB.latestSnapshot?.hand?.handId),
    4_000,
    "initial hand snapshots",
  );

  return { room, clientA, clientB };
}

describe("log schema contract", () => {
  const prevDecisionSampleRate = process.env.ENGINE_DECISION_SAMPLE_RATE;
  const prevDecisionTableFilter = process.env.ENGINE_DECISION_TABLE_ID;
  const prevDecisionStallDetection = process.env.FEATURE_DECISION_STALL_DETECTION;
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  afterEach(() => {
    process.env.ENGINE_DECISION_SAMPLE_RATE = prevDecisionSampleRate;
    process.env.ENGINE_DECISION_TABLE_ID = prevDecisionTableFilter;
    process.env.FEATURE_DECISION_STALL_DETECTION = prevDecisionStallDetection;
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits TABLE_STALLED and TABLE_STALLED_RECOVERY_REDRIVE with required fields", () => {
    vi.useFakeTimers();
    process.env.FEATURE_DECISION_STALL_DETECTION = "true";

    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const room = new PokerRoom() as any;
    room.roomId = "room_log_schema_contract";
    room.getBoundClient = () => ({ sessionId: "stub" });

    const state = makeState();
    state.handId = "hand_stalled_contract";
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.toActSeat = 1;
    state.runoutMode = "NONE";
    state.seats[0] = "u1";
    state.seats[1] = "bot1";
    state.playersById.set("u1", makePlayer({ id: "u1", name: "Hero", seat: 0, needsAction: false }));
    state.playersById.set("bot1", makePlayer({ id: "bot1", name: "Bot", seat: 1, kind: "BOT", needsAction: true }));

    room.state = state;
    room.lastSnapshotAt = Date.now() - 20_000;
    room.lastSnapshotSeq = 7;
    room.dealer = {
      logEngineDecisionPublic: vi.fn(),
      getQueueDepth: vi.fn(() => 0),
      getStallReasonPublic: vi.fn(() => "BOT_OVERDUE"),
      getLastDecisionTraceIdPublic: vi.fn(() => "trace_stall_1"),
      maybeActForBotPublic: vi.fn(),
      logTurnStalledIfNeeded: vi.fn(),
    };

    room.startStallMonitorInternal();
    vi.advanceTimersByTime(10_500);

    const stalled = getLogEntries(warnSpy, "warn", "TABLE_STALLED");
    const redrive = getLogEntries(warnSpy, "warn", "TABLE_STALLED_RECOVERY_REDRIVE");
    expect(stalled).toHaveLength(1);
    expect(redrive).toHaveLength(1);

    expectFields(stalled[0]!.payload, [
      "roomId",
      "tableId",
      "handId",
      "stallReason",
      "street",
      "toActSeat",
      "stallAgeMs",
      "turnAgeMs",
      "decisionTraceId",
      "queueDepth",
    ]);
    expectFields(redrive[0]!.payload, [
      "roomId",
      "tableId",
      "handId",
      "stallReason",
      "stallAgeMs",
      "turnAgeMs",
      "decisionTraceId",
    ]);
  });

  it("emits ENGINE_DECISION, ENGINE_RUNTIME_STEP, and ENGINE_PARITY with required fields", () => {
    process.env.ENGINE_DECISION_SAMPLE_RATE = "1";
    process.env.ENGINE_DECISION_TABLE_ID = "";

    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const state = makeState();
    state.handId = "hand_engine_logs";
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.toActSeat = 0;
    state.turnDeadlineMs = 123_456;
    state.seats[0] = "u1";
    state.playersById.set("u1", makePlayer({ id: "u1", name: "Hero", seat: 0, needsAction: true }));

    const dealer = new Dealer(state);
    try {
      (dealer as any).logEngineDecisionAndRuntimeStep("LOG_CONTRACT_TEST", 777_777);

      const decision = getLogEntries(infoSpy, "info", "ENGINE_DECISION");
      const runtime = getLogEntries(infoSpy, "info", "ENGINE_RUNTIME_STEP");
      const parity = getLogEntries(infoSpy, "info", "ENGINE_PARITY");

      expect(decision).toHaveLength(1);
      expect(runtime).toHaveLength(1);
      expect(parity).toHaveLength(1);

      expectFields(decision[0]!.payload, [
        "decisionTraceId",
        "tableId",
        "handId",
        "street",
        "toActSeat",
        "toActUserId",
        "turnDeadlineMs",
        "step",
        "reason",
        "now",
      ]);
      expectFields(runtime[0]!.payload, [
        "decisionTraceId",
        "tableId",
        "handId",
        "street",
        "toActSeat",
        "toActUserId",
        "turnDeadlineMs",
        "step",
        "reason",
        "now",
        "runtimeStep",
      ]);
      expectFields(parity[0]!.payload, [
        "tableId",
        "handId",
        "decisionTraceId",
        "reason",
        "decisionStep",
        "runtimeStep",
        "match",
      ]);
    } finally {
      dealer.dispose();
    }
  });

  it("emits ENGINE_PARITY_MISMATCH with required fields when parity diverges", () => {
    process.env.ENGINE_DECISION_SAMPLE_RATE = "1";
    process.env.ENGINE_DECISION_TABLE_ID = "";

    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const state = makeState();
    state.handId = "hand_engine_parity_mismatch";
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.toActSeat = 0;
    state.turnDeadlineMs = 88_000;
    state.seats[0] = "u1";
    state.playersById.set("u1", makePlayer({ id: "u1", name: "Hero", seat: 0, needsAction: true }));

    const dealer = new Dealer(state);
    try {
      vi.spyOn(dealer as any, "deriveRuntimeStep").mockReturnValue("NO_OP");
      (dealer as any).logEngineDecisionAndRuntimeStep("FORCED_MISMATCH", 999_999);

      const mismatch = getLogEntries(warnSpy, "warn", "ENGINE_PARITY_MISMATCH");
      expect(mismatch).toHaveLength(1);
      expectFields(mismatch[0]!.payload, [
        "tableId",
        "handId",
        "decisionTraceId",
        "reason",
        "decisionStep",
        "runtimeStep",
        "street",
        "toActSeat",
        "toActUserId",
        "turnDeadlineMs",
      ]);
    } finally {
      dealer.dispose();
    }
  });

  it("emits real lifecycle log events for action attempt, acceptance, and next-actor progression", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const { room, clientA, clientB } = await setupTwoPlayerRoom();

    try {
      await waitFor(
        () => Boolean(clientA.latestSnapshot?.hero?.actionOptions || clientB.latestSnapshot?.hero?.actionOptions),
        4_000,
        "hero action options",
      );

      const actorClient =
        clientA.latestSnapshot?.hero?.youAreSeated && clientA.latestSnapshot.hand?.toActSeat === clientA.latestSnapshot.hero.seat
          ? clientA
          : clientB;
      const nextClient = actorClient === clientA ? clientB : clientA;
      const firstAction = pickProgressAction(actorClient.latestSnapshot!);
      room.onMessageEvents.emit("ACTION", actorClient as any, {
        ...firstAction,
        actionId: `act_contract_1_${Date.now()}`,
      });

      await waitFor(
        () => getLogEntries(infoSpy, "info", "POKER_ACTION_ACCEPTED").length >= 1,
        4_000,
        "first action accepted",
      );

      await waitFor(
        () => Boolean(nextClient.latestSnapshot?.hero?.actionOptions),
        4_000,
        "next actor snapshot",
      );
      const secondAction = pickProgressAction(nextClient.latestSnapshot!);
      room.onMessageEvents.emit("ACTION", nextClient as any, {
        ...secondAction,
        actionId: `act_contract_2_${Date.now()}`,
      });

      await waitFor(
        () => getLogEntries(infoSpy, "info", "NEXT_ACTOR_SELECTED").length >= 1,
        6_000,
        "street advance next actor selection",
      );
      await waitFor(
        () =>
          getLogEntries(infoSpy, "info", "ACTION_ACCEPTED").length >= 2 &&
          getLogEntries(infoSpy, "info", "POKER_ACTION_ACCEPTED").length >= 2,
        6_000,
        "second action acceptance logs",
      );

      const actionAttempt = getLogEntries(infoSpy, "info", "POKER_ACTION_ATTEMPT");
      const actionAccepted = getLogEntries(infoSpy, "info", "ACTION_ACCEPTED");
      const roomAccepted = getLogEntries(infoSpy, "info", "POKER_ACTION_ACCEPTED");
      const nextActor = getLogEntries(infoSpy, "info", "NEXT_ACTOR_SELECTED");

      expect(actionAttempt.length).toBeGreaterThanOrEqual(2);
      expect(actionAccepted.length).toBeGreaterThanOrEqual(2);
      expect(roomAccepted.length).toBeGreaterThanOrEqual(2);
      expect(nextActor.length).toBeGreaterThanOrEqual(1);

      expectFields(actionAttempt[0]!.payload, ["roomId", "tableId", "userId", "action"]);
      expectFields(actionAccepted[0]!.payload, ["tableId", "handId", "userId", "action"]);
      expectFields(roomAccepted[0]!.payload, ["roomId", "tableId", "userId", "action"]);
      expectFields(nextActor[0]!.payload, ["tableId", "handId", "street", "toActSeat", "toActUserId"]);
    } finally {
      room.onDispose?.();
      room.dealer?.dispose?.();
    }
  });
});
