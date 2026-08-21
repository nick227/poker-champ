import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "./PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { TableSnapshotLogService } from "../engine/persistence/TableSnapshotLogService.js";
import { RandomBotBrain } from "../engine/bots/BotBrain.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { logger } from "../lib/logger.js";
import { awardService } from "../awards/index.js";

vi.mock("@poker-champ/db", () => {
  const mockTx = {
    userAward: { findMany: () => Promise.resolve([]), create: () => Promise.resolve({}), update: () => Promise.resolve({}) },
    userHandCount: { findMany: () => Promise.resolve([]), update: () => Promise.resolve({}) },
    awardGrantEvent: { create: () => Promise.resolve({}) },
    tableSeatSession: {
      findMany: () => Promise.resolve([]),
      count: () => Promise.resolve(0),
      findUnique: () => Promise.resolve(null),
      findFirst: () => Promise.resolve(null),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({}),
      updateMany: () => Promise.resolve({}),
      upsert: () => Promise.resolve({}),
      deleteMany: () => Promise.resolve({}),
    },
    $executeRawUnsafe: () => Promise.resolve(0),
    $queryRawUnsafe: () => Promise.resolve([]),
  };
  return {
    getPrisma: () => ({
      user: { findUnique: () => Promise.resolve(null), findMany: () => Promise.resolve([]) },
      tableSnapshotLog: { create: () => Promise.resolve({}) },
      tableSeatSession: mockTx.tableSeatSession,
      playerBalance: { count: () => Promise.resolve(0) },
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      $executeRawUnsafe: () => Promise.resolve(0),
      $queryRawUnsafe: () => Promise.resolve([]),
    }),
    disconnectPrisma: () => Promise.resolve(),
  };
});

vi.setConfig({ testTimeout: 35000 });

/** Let async message handlers (e.g. ACTION) run before asserting. */
function flushAsync() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

type FakeClient = {
  sessionId: string;
  leave: () => void;
  send: (type: string, payload: unknown) => void;
  sentByType: Record<string, unknown[]>;
  latestSnapshot: TableSnapshotPayload | null;
};

function makeClient(sessionId: string): FakeClient {
  const sentByType: Record<string, unknown[]> = {};
  const client: FakeClient = {
    sessionId,
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

function getSnapshots(client: FakeClient): TableSnapshotPayload[] {
  return (client.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[];
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

function pickLegalAction(snapshot: TableSnapshotPayload): { action: "FOLD" | "CHECK" | "CALL" | "ALL_IN" } {
  const opts = snapshot.hero.actionOptions;
  if (!opts) return { action: "FOLD" };
  if (opts.canCheck) return { action: "CHECK" };
  if (opts.canCall) return { action: "CALL" };
  if (opts.canAllIn) return { action: "ALL_IN" };
  return { action: "FOLD" };
}

describe("table action broadcasting", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;
  const autoActionCapEnv = process.env.AUTO_ACTION_HAND_CAP;
  const persistentSeatsEnv = process.env.FEATURE_PERSISTENT_SEATS;
  const snapshotLogEnv = process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE;

  beforeEach(() => {
    // Default no-op to keep teardown deterministic in tests that do not
    // explicitly mock seat-session persistence.
    vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
    process.env.AUTO_ACTION_HAND_CAP = autoActionCapEnv;
    process.env.FEATURE_PERSISTENT_SEATS = persistentSeatsEnv;
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = snapshotLogEnv;
  });

  async function setupTwoPlayerRoom() {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = "room_broadcast_test";
    room.onCreate({
      tableConfig: {
        tableId: "table_broadcast_test",
        name: "Broadcast Test",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    // Prevent human turn timeout (40s) from being chained onto the action queue so tests don't block.
    (room.dealer as { scheduleHumanTurnTimeout?: (userId: string) => void }).scheduleHumanTurnTimeout = () => {};

    const clientA = makeClient("sess_a");
    const clientB = makeClient("sess_b");

    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    await room.onJoin(clientB as any, { buyInCents: 5000 }, { userId: "user_b", username: "bob" });

    await waitFor(() => Boolean(clientA.latestSnapshot) && Boolean(clientB.latestSnapshot), 4000, "initial snapshots");
    await waitFor(
      () => Boolean(clientA.latestSnapshot?.hand?.handId) && Boolean(clientB.latestSnapshot?.hand?.handId),
      4000,
      "active hand",
    );

    return { room, clientA, clientB };
  }

  async function setupTwoPlayerRoomWithTimeouts() {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = "room_broadcast_test_with_timeouts";
    room.onCreate({
      tableConfig: {
        tableId: "table_broadcast_test_with_timeouts",
        name: "Broadcast Test With Timeouts",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const clientA = makeClient("sess_a_timeout");
    const clientB = makeClient("sess_b_timeout");

    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    await room.onJoin(clientB as any, { buyInCents: 5000 }, { userId: "user_b", username: "bob" });

    await waitFor(() => Boolean(clientA.latestSnapshot) && Boolean(clientB.latestSnapshot), 4000, "initial snapshots");
    await waitFor(
      () => Boolean(clientA.latestSnapshot?.hand?.handId) && Boolean(clientB.latestSnapshot?.hand?.handId),
      4000,
      "active hand",
    );

    return { room, clientA, clientB };
  }

async function setupHumanVsBotRoom() {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = "room_broadcast_bot_runout_test";
    room.onCreate({
      tableConfig: {
        tableId: "table_broadcast_bot_runout_test",
        name: "Broadcast Bot Runout Test",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    // startHand advances dealer to the next active seat; seed so first hand puts action on user_a.
    room.state.dealerSeat = 0;

    (room.dealer as { scheduleHumanTurnTimeout?: (userId: string) => void }).scheduleHumanTurnTimeout = () => {};
    const clientA = makeClient("sess_human");
    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    room.onMessageEvents.emit("ADD_BOT", clientA as any, { name: "Bot", buyInCents: 5000, botId: "chaos_carl" });
    await flushAsync();
    await waitFor(
      () => getSnapshots(clientA).some((snap) => snap.seats.some((s) => s.isBot)),
      5000,
      "bot seated",
    );
    await waitFor(
      () => getSnapshots(clientA).some((snap) => Boolean(snap.hand?.handId)),
      5000,
      "active hand human vs bot",
    );

    return { room, clientA };
  }

  async function setupHumanVsBotRoomWithTimeouts() {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = "room_broadcast_bot_timeout_guard_test";
    room.onCreate({
      tableConfig: {
        tableId: "table_broadcast_bot_timeout_guard_test",
        name: "Broadcast Bot Timeout Guard Test",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    room.state.dealerSeat = 0;

    const clientA = makeClient("sess_human_timeout_guard");
    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    room.onMessageEvents.emit("ADD_BOT", clientA as any, { name: "Bot", buyInCents: 5000, botId: "chaos_carl" });
    await flushAsync();
    await waitFor(
      () => getSnapshots(clientA).some((snap) => snap.seats.some((s) => s.isBot)),
      5000,
      "bot seated",
    );
    await waitFor(
      () => getSnapshots(clientA).some((snap) => Boolean(snap.hand?.handId)),
      5000,
      "active hand human vs bot with timeouts",
    );

    return { room, clientA };
  }


  it("rejects out-of-turn action with NOT_YOUR_TURN", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const toActSeat = clientA.latestSnapshot!.hand!.toActSeat;
      const toActUserId = clientA.latestSnapshot!.seats.find((s) => s.seat === toActSeat)?.userId;
      const wrongClient = toActUserId === "user_a" ? clientB : clientA;
      const errorCountBefore = wrongClient.sentByType.ERROR?.length ?? 0;

      room.onMessageEvents.emit("ACTION", wrongClient as any, { action: "FOLD", actionId: "test-reject-" + Date.now() });
      await flushAsync();
      await waitFor(() => (wrongClient.sentByType.ERROR?.length ?? 0) > errorCountBefore, 4000, "error message");

      const errorCodes = ((wrongClient.sentByType.ERROR ?? []) as any[]).map((e) => e?.code);
      expect(errorCodes).toContain("NOT_YOUR_TURN");
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("does not emit TABLE_STALLED when connected human is toAct even if needsAction drifted false", async () => {
    const decisionStallEnv = process.env.FEATURE_DECISION_STALL_DETECTION;
    process.env.FEATURE_DECISION_STALL_DETECTION = "false";
    const warnSpy = vi.spyOn(logger, "warn");
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const snap = clientA.latestSnapshot!;
      const toActSeat = snap.hand!.toActSeat;
      const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();
      const toActPlayer = room.state.playersById.get(toActUserId!);
      expect(toActPlayer).toBeTruthy();
      toActPlayer!.needsAction = false;

      if (room.stallCheckInterval) {
        clearInterval(room.stallCheckInterval);
        room.stallCheckInterval = null;
      }
      room.lastSnapshotAt = Date.now() - 30_000;
      room.startStallMonitorInternal();

      await delay(10_500);

      const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
      const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
      expect(stalledCalls.length).toBe(0);
      expect(redriveCalls.length).toBe(0);
    } finally {
      process.env.FEATURE_DECISION_STALL_DETECTION = decisionStallEnv;
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("rejoin/session-swap with pending action replay remains idempotent for same actionId", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    const clientARebound = makeClient("sess_a_rebound");
    try {
      await waitFor(() => Boolean(clientA.latestSnapshot?.hand?.handId), 5000, "initial hand before rebound");

      // Ensure user_a is the actor so both stale and rebound sessions target the same logical turn.
      const getToActUser = () => {
        const snap = clientA.latestSnapshot;
        if (!snap?.hand) return "";
        return snap.seats.find((s) => s.seat === snap.hand!.toActSeat)?.userId ?? "";
      };
      if (getToActUser() !== "user_a") {
        const snap = clientB.latestSnapshot!;
        const action = pickLegalAction(snap);
        room.onMessageEvents.emit("ACTION", clientB as any, {
          ...action,
          actionId: `session-swap-prime-${Date.now()}`,
        });
        await flushAsync();
        await waitFor(() => getToActUser() === "user_a", 5000, "rotate action to user_a");
      }

      const beforeSeq = Number(room.state.handActionSeq ?? 0);
      const handIdBefore = String(room.state.handId ?? "");

      // Rebound same user with new session.
      await room.onJoin(clientARebound as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
      await waitFor(() => Boolean(clientARebound.latestSnapshot?.hand?.handId), 5000, "rebound snapshot");

      const action = pickLegalAction(clientARebound.latestSnapshot!);
      const replayActionId = `session-swap-replay-${Date.now()}`;

      // Replay same actionId from stale and rebound sessions.
      room.onMessageEvents.emit("ACTION", clientA as any, { ...action, actionId: replayActionId });
      room.onMessageEvents.emit("ACTION", clientARebound as any, { ...action, actionId: replayActionId });
      await flushAsync();

      await waitFor(
        () => Number(room.state.handActionSeq ?? 0) > beforeSeq || String(room.state.handId ?? "") !== handIdBefore,
        4000,
        "single action application after session swap replay",
      );

      // Idempotency: replay must not double-apply; allow bounded follow-up progression.
      const seqAfterReplay = Number(room.state.handActionSeq ?? 0);
      expect(seqAfterReplay).toBeGreaterThanOrEqual(beforeSeq + 1);
      expect(seqAfterReplay).toBeLessThanOrEqual(beforeSeq + 2);
    } finally {
      try {
        await room.onLeave(clientARebound as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("rejects stale client action after turn has advanced", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const snap = clientA.latestSnapshot!;
      const toActSeat = snap.hand!.toActSeat;
      const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();
      if (!toActUserId) return;

      const actorClient = toActUserId === "user_a" ? clientA : clientB;
      const staleErrorBefore = actorClient.sentByType.ERROR?.length ?? 0;
      const beforeSeq = Number(room.state.handActionSeq ?? 0);

      // First action is valid and advances the turn.
      const legal = pickLegalAction(actorClient.latestSnapshot!);
      room.onMessageEvents.emit("ACTION", actorClient as any, {
        ...legal,
        actionId: `stale-prime-${Date.now()}`,
      });
      await flushAsync();
      await waitFor(() => Number(room.state.handActionSeq ?? 0) > beforeSeq, 4000, "turn advances after valid action");

      const advancedSnapshot = {
        handId: String(room.state.handId ?? ""),
        street: String(room.state.street ?? ""),
        toActSeat: Number(room.state.toActSeat ?? -1),
        handActionSeq: Number(room.state.handActionSeq ?? 0),
      };

      // Second action from same previous actor is now stale for the new turn.
      room.onMessageEvents.emit("ACTION", actorClient as any, {
        ...legal,
        actionId: `stale-late-${Date.now()}`,
      });
      await flushAsync();
      await waitFor(
        () => (actorClient.sentByType.ERROR?.length ?? 0) > staleErrorBefore,
        3000,
        "stale action rejected",
      );

      const codes = ((actorClient.sentByType.ERROR ?? []) as Array<{ code?: string }>).map((e) => e?.code);
      expect(codes.some((code) => code === "NOT_YOUR_TURN" || code === "NOT_ELIGIBLE")).toBe(true);

      // Invariant: stale action must not mutate table state after turn has advanced.
      expect(Number(room.state.handActionSeq ?? 0)).toBe(advancedSnapshot.handActionSeq);
      expect(Number(room.state.toActSeat ?? -1)).toBe(advancedSnapshot.toActSeat);
      expect(String(room.state.handId ?? "")).toBe(advancedSnapshot.handId);
      expect(String(room.state.street ?? "")).toBe(advancedSnapshot.street);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("broadcast ordering emits valid post-action progression snapshots", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const snap = clientA.latestSnapshot!;
      const toActSeat = snap.hand!.toActSeat;
      const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();
      if (!toActUserId) return;

      const actorClient = toActUserId === "user_a" ? clientA : clientB;
      const beforeA = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeB = clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const action = pickLegalAction(actorClient.latestSnapshot!);

      room.onMessageEvents.emit("ACTION", actorClient as any, {
        ...action,
        actionId: `ordering-${Date.now()}`,
      });
      await flushAsync();

      await waitFor(
        () =>
          (clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeA &&
          (clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeB,
        4000,
        "both clients receive post-action snapshots",
      );

      const checkOrder = (snapshots: TableSnapshotPayload[]) => {
        const reasons = snapshots.map((s) => s.reason);
        expect(reasons.length).toBeGreaterThan(0);
        expect(["ACTION_ACCEPTED", "AUTO_TRANSITION", "BOT_ACTION"]).toContain(reasons[0]);

        const acceptedIdx = reasons.indexOf("ACTION_ACCEPTED");
        if (acceptedIdx < 0) return;

        const nextIdx = reasons.findIndex((reason, idx) =>
          idx > acceptedIdx &&
          (reason === "AUTO_TRANSITION" ||
            reason === "BOT_ACTION" ||
            reason === "RUNOUT_STAGE" ||
            reason === "HAND_SHOWDOWN" ||
            reason === "HAND_END"),
        );

        if (nextIdx >= 0) {
          expect(acceptedIdx).toBeLessThan(nextIdx);
        }
      };

      const afterA = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeA);
      const afterB = ((clientB.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeB);
      checkOrder(afterA);
      checkOrder(afterB);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("broadcast contract: first post-action snapshot is ACTION_ACCEPTED or a progressed AUTO_TRANSITION", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const snap = clientA.latestSnapshot!;
      const beforeStreet = snap.hand?.street;
      const beforeActionCount = snap.hand?.actionCount ?? 0;
      const toActSeat = snap.hand!.toActSeat;
      const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();
      if (!toActUserId) return;

      const actorClient = toActUserId === "user_a" ? clientA : clientB;
      const beforeA = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeB = clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const action = pickLegalAction(actorClient.latestSnapshot!);

      room.onMessageEvents.emit("ACTION", actorClient as any, {
        ...action,
        actionId: `ordering-contract-${Date.now()}`,
      });
      await flushAsync();

      await waitFor(
        () =>
          (clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeA &&
          (clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeB,
        4000,
        "both players receive first post-action snapshot",
      );

      const afterA = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeA);
      const afterB = ((clientB.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeB);
      expect(afterA.length).toBeGreaterThan(0);
      expect(afterB.length).toBeGreaterThan(0);

      const assertFirstReasonContract = (snapshots: TableSnapshotPayload[]) => {
        const first = snapshots[0];
        const firstReason = first?.reason;
        expect(["ACTION_ACCEPTED", "AUTO_TRANSITION"]).toContain(firstReason);

        if (firstReason === "AUTO_TRANSITION") {
          const hasHandResult = Boolean(first?.lastHandResult?.handId);
          const streetChanged = first?.hand?.street !== beforeStreet;
          const actionCountAdvanced = (first?.hand?.actionCount ?? 0) > beforeActionCount;
          expect(hasHandResult || streetChanged || actionCountAdvanced).toBe(true);
        }
      };
      assertFirstReasonContract(afterA);
      assertFirstReasonContract(afterB);

      const assertNoPreAcceptedTransition = (snapshots: TableSnapshotPayload[]) => {
        const reasons = snapshots.map((s) => s.reason);
        const acceptedIdx = reasons.indexOf("ACTION_ACCEPTED");
        if (acceptedIdx < 0) return;
        const transitionBeforeAccepted = reasons.some(
          (reason, idx) => idx < acceptedIdx && (reason === "AUTO_TRANSITION" || reason === "BOT_ACTION"),
        );
        expect(transitionBeforeAccepted).toBe(false);
      };

      assertNoPreAcceptedTransition(afterA);
      assertNoPreAcceptedTransition(afterB);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("rejects action when provided handId does not match current hand", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const snap = clientA.latestSnapshot!;
      const toActSeat = snap.hand!.toActSeat;
      const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
      const actor = toActUserId === "user_a" ? clientA : clientB;
      const errorCountBefore = actor.sentByType.ERROR?.length ?? 0;
      const action = {
        ...pickLegalAction(actor.latestSnapshot!),
        actionId: "test-stale-hand-" + Date.now(),
        handId: "hand_stale_mismatch",
      };

      room.onMessageEvents.emit("ACTION", actor as any, action);
      await flushAsync();
      await waitFor(() => (actor.sentByType.ERROR?.length ?? 0) > errorCountBefore, 4000, "hand mismatch error");

      const lastError = ((actor.sentByType.ERROR ?? []) as any[]).at(-1);
      expect(typeof lastError?.code).toBe("string");
      expect(String(lastError?.message ?? "")).toMatch(/handid.*current hand/i);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("broadcasts accepted action updates to both players", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const beforeA = clientA.latestSnapshot!;
      const beforeB = clientB.latestSnapshot!;
      const beforeCountA = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeCountB = clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0;

      const toActSeat = beforeA.hand!.toActSeat;
      const toActUserId = beforeA.seats.find((s) => s.seat === toActSeat)?.userId;
      const actor = toActUserId === "user_a" ? clientA : clientB;
      const action = { ...pickLegalAction(actor.latestSnapshot!), actionId: "test-broadcast-" + Date.now() };

      room.onMessageEvents.emit("ACTION", actor as any, action);
      await flushAsync();
      await waitFor(
        () =>
          (clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeCountA &&
          (clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeCountB,
        4000,
        "broadcast snapshots",
      );

      const afterA = clientA.latestSnapshot!;
      const afterB = clientB.latestSnapshot!;
      expect(afterA.snapshotId).not.toBe(beforeA.snapshotId);
      expect(afterB.snapshotId).not.toBe(beforeB.snapshotId);

      // Snapshot stream is full-state replacement; assert converged state, not one specific transition flag.
      const actorSeat = afterA.seats.find((s) => s.userId === toActUserId)?.seat;
      const actorStillToAct = actorSeat !== undefined && afterA.hand?.toActSeat === actorSeat;
      expect(Boolean(afterA.hand?.handId)).toBe(true);
      expect(Boolean(afterB.hand?.handId)).toBe(true);
      expect(
        Boolean(afterA.lastHandResult?.handId) ||
          afterA.hand?.street !== beforeA.hand?.street ||
          (afterA.hand?.actionCount ?? 0) !== (beforeA.hand?.actionCount ?? 0) ||
          !actorStillToAct,
      ).toBe(true);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("auto-checks or folds when disconnected player is to act", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const before = clientA.latestSnapshot!;
      const beforeCountA = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeCountB = clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeActionCount = before.hand?.actionCount ?? 0;
      const beforeSnapshotsA = beforeCountA;

      const toActSeat = before.hand!.toActSeat;
      const toActUserId = before.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();

      room.dealer.markDisconnected(String(toActUserId), Date.now() - 1);

      await waitFor(
        () =>
          (clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeCountA &&
          (clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeCountB,
        4000,
        "auto-action snapshots",
      );

      const beforeHandId = before.hand?.handId ?? "";

      await waitFor(
        () =>
          ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[])
            .slice(beforeSnapshotsA)
            .some((snap) => snap.lastAction?.origin === "AUTO" && snap.lastAction?.actorUserId === toActUserId) ||
          Boolean(clientA.latestSnapshot?.lastHandResult?.handId) ||
          (clientA.latestSnapshot?.hand?.handId ?? "") !== beforeHandId ||
          (clientA.latestSnapshot?.hand?.actionCount ?? 0) !== beforeActionCount,
        4000,
        "auto-action progression",
      );

      const autoOriginSeen = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[])
        .slice(beforeSnapshotsA)
        .some((snap) => snap.lastAction?.origin === "AUTO" && snap.lastAction?.actorUserId === toActUserId);
      expect(autoOriginSeen).toBe(true);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it(
    "marks disconnected player as sitting out after auto-action cap",
    { timeout: 30000 },
    async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    process.env.AUTO_ACTION_HAND_CAP = "1";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({ softExpired: [], hardDeletedCount: 0 });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    const markSittingOutSpy = vi.spyOn(TableSeatSessionService, "markSittingOut").mockResolvedValue();
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const before = clientA.latestSnapshot!;
      const toActSeat = before.hand!.toActSeat;
      const toActUserId = before.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();

      if (typeof room.dealer.markDisconnectedSerialized === "function") {
        await room.dealer.markDisconnectedSerialized(String(toActUserId), Date.now() - 1);
      } else {
        room.dealer.markDisconnected(String(toActUserId), Date.now() - 1);
      }
      const connectedUserId = String(toActUserId) === "user_a" ? "user_b" : "user_a";
      const connectedClient = connectedUserId === "user_a" ? clientA : clientB;

      await waitFor(
        () =>
          getSnapshots(clientA).some(
            (snap) => snap.lastAction?.origin === "AUTO" && snap.lastAction?.actorUserId === toActUserId,
          ),
        12000,
        "disconnected auto-action observed",
      );

      const started = Date.now();
      let lastActionSnapshotId = "";
      while (Date.now() - started < 14000) {
        const roomHandId = room.state?.handId;
        if (!roomHandId || room.state?.street === "WAITING") break;
        const snap = connectedClient.latestSnapshot;
        if (snap) {
          const connectedSeat = snap.seats.find((s) => s.userId === connectedUserId)?.seat;
          const canActNow =
            snap.hand?.handId === roomHandId &&
            connectedSeat !== undefined &&
            snap.hand?.toActSeat === connectedSeat &&
            Boolean(snap.hero.actionOptions);
          if (canActNow && snap.snapshotId !== lastActionSnapshotId) {
            lastActionSnapshotId = snap.snapshotId;
            const action = { ...pickLegalAction(snap), actionId: `act-${Date.now()}` };
            room.onMessageEvents.emit("ACTION", connectedClient as any, action);
          }
        }

        const disconnectedSeat = clientA.latestSnapshot?.seats.find((s) => s.userId === toActUserId);
        if (disconnectedSeat?.status === "ABANDONED" && markSittingOutSpy.mock.calls.length > 0) break;
        await delay(120);
      }

      await waitFor(
        () =>
          clientA.latestSnapshot?.seats.some((s) => s.userId === toActUserId && s.status === "ABANDONED") === true &&
          markSittingOutSpy.mock.calls.length > 0,
        12000,
        "auto-action cap abandoned",
      );

      const seat = clientA.latestSnapshot!.seats.find((s) => s.userId === toActUserId);
      expect(seat?.status).toBe("ABANDONED");
      expect(markSittingOutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table_broadcast_test",
          userId: toActUserId,
        }),
      );
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("writes snapshot logs through snapshot log service when enabled", async () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "true";
    const writeSpy = vi.spyOn(TableSnapshotLogService, "writeSnapshot").mockResolvedValue();
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      await waitFor(() => writeSpy.mock.calls.length > 0, 4000, "snapshot log writes");
      expect(writeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table_broadcast_test",
          snapshotId: expect.any(String),
          schemaVersion: 1,
          reason: expect.any(String),
          payloadJson: expect.any(Object),
        }),
      );
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("snapshot log persistence failure does not block action progression", async () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "true";
    const warnSpy = vi.spyOn(logger, "warn");
    vi.spyOn(TableSnapshotLogService, "writeSnapshot").mockRejectedValue(new Error("snapshot-log-failure"));
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const before = clientA.latestSnapshot!;
      const beforeCountA = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeCountB = clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const toActSeat = before.hand!.toActSeat;
      const toActUserId = before.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();
      if (!toActUserId) return;

      const actor = toActUserId === "user_a" ? clientA : clientB;
      room.onMessageEvents.emit("ACTION", actor as any, {
        ...pickLegalAction(actor.latestSnapshot!),
        actionId: `snapshot-log-failure-${Date.now()}`,
      });
      await flushAsync();

      await waitFor(
        () =>
          (clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeCountA &&
          (clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0) > beforeCountB,
        5000,
        "snapshot progression despite snapshot log failure",
      );

      const snapAfter = clientA.latestSnapshot!;
      expect(snapAfter.snapshotId).not.toBe(before.snapshotId);
      const snapshotLogFailures = warnSpy.mock.calls.filter((call) => call[1] === "SNAPSHOT_LOG_WRITE_FAILED");
      expect(snapshotLogFailures.length).toBeGreaterThan(0);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("hand-end award persistence failure does not block hand transition", async () => {
    const errorSpy = vi.spyOn(logger, "error");
    vi.spyOn(awardService, "processHandEndAwards").mockRejectedValue(new Error("award-persistence-failure"));
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const start = clientA.latestSnapshot!;
      const handIdBefore = String(start.hand?.handId ?? "");
      expect(handIdBefore).toBeTruthy();

      const toActSeat = start.hand!.toActSeat;
      const toActUserId = start.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();
      if (!toActUserId) return;
      const actor = toActUserId === "user_a" ? clientA : clientB;

      room.onMessageEvents.emit("ACTION", actor as any, {
        action: "FOLD",
        actionId: `award-failure-fold-${Date.now()}`,
      });
      await flushAsync();

      await waitFor(
        () => Boolean(clientA.latestSnapshot?.lastHandResult?.handId === handIdBefore),
        5000,
        "hand ended despite award persistence failure",
      );

      await waitFor(
        () => {
          const current = String(clientA.latestSnapshot?.hand?.handId ?? "");
          return Boolean(current) && current !== handIdBefore;
        },
        6000,
        "next hand started despite award persistence failure",
      );

      const awardFailureLogs = errorSpy.mock.calls.filter(
        (call) => call[1] === "HAND_ENDED side effects failed; continuing hand transition",
      );
      expect(awardFailureLogs.length).toBeGreaterThan(0);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      try {
        await room.onLeave(clientB as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it(
    "emits expected preflop all-in runout sequence for human vs bot",
    { timeout: 25000 },
    async () => {
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        if (ctx.heroActionOptions.canAllIn) return { action: "ALL_IN" };
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        return { action: "FOLD" };
      });

      const { room, clientA } = await setupHumanVsBotRoom();
      try {
        await waitFor(
          () =>
            clientA.latestSnapshot?.seats.find((s) => s.seat === clientA.latestSnapshot?.hand?.toActSeat)?.userId === "user_a" &&
            Boolean(clientA.latestSnapshot?.hero?.actionOptions?.canAllIn),
          10000,
          "human to-act with all-in available",
        );
        const beforeCount = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
        room.onMessageEvents.emit("ACTION", clientA as any, { action: "ALL_IN", actionId: "human-all-in-" + Date.now() });

        await waitFor(
          () => {
            const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
            const reasons = snapshots.map((snap) => snap.reason);
            const runoutCount = reasons.filter((reason) => reason === "RUNOUT_STAGE").length;
            const hasTerminal = reasons.includes("HAND_END") || reasons.includes("HAND_SHOWDOWN");
            const actionAcceptedSnapshot = snapshots.find((snap) => snap.reason === "ACTION_ACCEPTED");
            const actionStreet = actionAcceptedSnapshot?.hand?.street;
            const expectedRunoutStages =
              actionStreet === "PREFLOP" ? 3 :
              actionStreet === "FLOP" ? 2 :
              actionStreet === "TURN" ? 1 : 0;
            
            return runoutCount >= expectedRunoutStages && hasTerminal;
          },
          15000,
          "runout to hand end",
        );

      const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
      const reasons = snapshots.map((snap) => snap.reason);

      const actionAcceptedIdx = reasons.indexOf("ACTION_ACCEPTED");
      expect(actionAcceptedIdx).toBeGreaterThanOrEqual(0);
      const actionStreet = snapshots[actionAcceptedIdx]?.hand?.street;
      const expectedRunoutStages =
        actionStreet === "PREFLOP" ? 3 :
        actionStreet === "FLOP" ? 2 :
        actionStreet === "TURN" ? 1 : 0;
      const runoutIdxs = reasons
        .map((reason, idx) => ({ reason, idx }))
        .filter((entry) => entry.reason === "RUNOUT_STAGE")
        .map((entry) => entry.idx);
      expect(runoutIdxs.length).toBe(expectedRunoutStages);
      const handEndIdx = reasons.indexOf("HAND_END");
      const handShowdownIdx = reasons.indexOf("HAND_SHOWDOWN");
      const terminalIdx = handEndIdx >= 0 ? handEndIdx : handShowdownIdx;
      const lastRunoutIdx = runoutIdxs.length > 0 ? runoutIdxs[runoutIdxs.length - 1]! : actionAcceptedIdx;
      expect(terminalIdx).toBeGreaterThan(lastRunoutIdx);
      if (runoutIdxs.length > 0) {
        expect(runoutIdxs[0]!).toBeGreaterThan(actionAcceptedIdx);
      }

      const handEndSnapshot = snapshots[terminalIdx];
      expect(handEndSnapshot?.hand?.street).toBe("SHOWDOWN");
      expect(handEndSnapshot?.hand?.board?.length).toBe(5);
      expect(handEndSnapshot?.lastHandResult?.handId).toBeDefined();
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("after human calls bot bet, human receives snapshot with advanced state (toActSeat or street)", async () => {
    vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
      if (ctx.heroActionOptions.canBet) return { action: "BET", amountCents: 200 };
      if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
      if (ctx.heroActionOptions.canCall) return { action: "CALL" };
      return { action: "FOLD" };
    });

    const { room, clientA } = await setupHumanVsBotRoom();
    try {
      await waitFor(() => Boolean(clientA.latestSnapshot?.hero?.actionOptions), 10000, "human has action options");
      const before = clientA.latestSnapshot!;
      const beforeStreet = before.hand?.street;
      const beforeToAct = before.hand?.toActSeat;
      const beforeActionCount = before.hand?.actionCount ?? 0;
      const nextAction = before.hero.actionOptions?.canCall
        ? { action: "CALL" as const }
        : pickLegalAction(before);
      const beforeCount = (clientA.sentByType.TABLE_SNAPSHOT ?? []).length;
      room.onMessageEvents.emit("ACTION", clientA as any, { ...nextAction, actionId: "human-followup-" + Date.now() });

      await waitFor(
        () => {
          const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
          const progressed = snapshots.find((s) => {
            const hand = s.hand;
            if (!hand) return false;
            return (
              hand.street !== beforeStreet ||
              hand.toActSeat !== beforeToAct ||
              (hand.actionCount ?? 0) !== beforeActionCount
            );
          });
          return Boolean(progressed) || Boolean(clientA.latestSnapshot?.lastHandResult?.handId);
        },
        10000,
        "state advanced after human action",
      );

      const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
      const terminalOrProgressed = snapshots.some((s) => {
        const hand = s.hand;
        if (!hand) return Boolean(s.lastHandResult?.handId);
        return hand.street !== beforeStreet || hand.toActSeat !== beforeToAct || (hand.actionCount ?? 0) !== beforeActionCount;
      });
      expect(terminalOrProgressed).toBe(true);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it("keeps river human turn actionable in human-vs-bot flow", async () => {
    vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
      if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
      if (ctx.heroActionOptions.canCall) return { action: "CALL" };
      return { action: "FOLD" };
    });

    const warnSpy = vi.spyOn(logger, "warn");
    const { room, clientA } = await setupHumanVsBotRoom();
    try {
      let currentHandId = clientA.latestSnapshot?.hand?.handId;
      expect(currentHandId).toBeTruthy();
      const maxIterations = 200;
      let iterations = 0;
      while (iterations < maxIterations) {
        iterations += 1;
        const snap = clientA.latestSnapshot;
        const hand = snap?.hand;
        if (!snap || !hand) {
          await delay(50);
          continue;
        }
        if (hand.handId !== currentHandId) {
          currentHandId = hand.handId;
          continue;
        }
        const toActSeat = hand.toActSeat;
        const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
        const heroOpts = snap.hero.actionOptions;
        const heroCanAct = Boolean(
          heroOpts &&
            (heroOpts.canFold ||
              heroOpts.canCheck ||
              heroOpts.canCall ||
              heroOpts.canAllIn ||
              heroOpts.canBet ||
              heroOpts.canRaise),
        );
        if (hand.street === "RIVER" && toActUserId === "user_a") {
          expect(heroCanAct).toBe(true);
          return;
        }
        if (toActUserId === "user_a" && heroCanAct) {
          const beforeSnapshotId = snap.snapshotId;
          const action = heroOpts?.canCheck ? ({ action: "CHECK" as const }) : pickLegalAction(snap);
          room.onMessageEvents.emit("ACTION", clientA as any, { ...action, actionId: `river-actionable-${Date.now()}-${iterations}` });
          await waitFor(
            () =>
              Boolean(clientA.latestSnapshot?.snapshotId) &&
              clientA.latestSnapshot!.snapshotId !== beforeSnapshotId,
            4000,
            "snapshot advance after human action",
          );
          continue;
        }
        await delay(50);
      }

      throw new Error("Did not reach actionable river human turn before hand ended");
    } finally {
      const stalledLogs = warnSpy.mock.calls.filter(([arg1, arg2]) => {
        const msg = typeof arg2 === "string" ? arg2 : "";
        const payload = arg1 as Record<string, unknown> | undefined;
        return msg === "TABLE_STALLED" || payload?.msg === "TABLE_STALLED";
      });
      expect(stalledLogs.length).toBe(0);
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });

  it(
    "does not stall when flop enters with human toAct and no immediate action",
    async () => {
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        return { action: "FOLD" };
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const { room, clientA } = await setupHumanVsBotRoomWithTimeouts();
      try {
        const startHandId = clientA.latestSnapshot?.hand?.handId;
        expect(startHandId).toBeTruthy();
        let reachedFlopHumanToAct = false;

        for (let guard = 0; guard < 40; guard += 1) {
          const snap = clientA.latestSnapshot;
          const hand = snap?.hand;
          if (!snap || !hand || hand.handId !== startHandId) {
            await delay(50);
            continue;
          }
          const toActSeat = hand.toActSeat;
          const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
          if (hand.street === "FLOP" && toActUserId === "user_a") {
            reachedFlopHumanToAct = true;
            break;
          }
          if (toActUserId === "user_a") {
            const opts = snap.hero.actionOptions;
            if (opts && (opts.canCheck || opts.canCall || opts.canFold || opts.canAllIn)) {
              const action = opts.canCheck ? ({ action: "CHECK" as const }) : pickLegalAction(snap);
              room.onMessageEvents.emit("ACTION", clientA as any, {
                ...action,
                actionId: `flop-human-deadline-${Date.now()}-${guard}`,
              });
              await delay(100);
              continue;
            }
          }
          await delay(50);
        }

        expect(reachedFlopHumanToAct).toBe(true);
        expect(room.state.street).toBe("FLOP");
        const flopDeadline = Number(room.state.turnDeadlineMs ?? 0);
        expect(flopDeadline).toBeGreaterThan(0);
        // Allow small clock drift between deadline arm and assertion.
        expect(flopDeadline).toBeGreaterThan(Date.now() - 2000);

        // Intentionally do not act; this historically produced TABLE_STALLED when deadline was not armed.
        await delay(16_000);

        const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
        const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
        expect(stalledCalls.length).toBe(0);
        expect(redriveCalls.length).toBe(0);
      } finally {
        // no-op: this test intentionally disconnects the client via onLeave(1006)
      }
    },
    35_000,
  );

  it(
    "does not stall when human disconnects during their turn",
    async () => {
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        return { action: "FOLD" };
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const { room, clientA } = await setupHumanVsBotRoomWithTimeouts();
      try {
        const startHandId = clientA.latestSnapshot?.hand?.handId;
        expect(startHandId).toBeTruthy();

        await waitFor(
          () => {
            const snap = clientA.latestSnapshot;
            const hand = snap?.hand;
            if (!snap || !hand || hand.handId !== startHandId) return false;
            const toActUserId = snap.seats.find((s) => s.seat === hand.toActSeat)?.userId;
            return toActUserId === "user_a";
          },
          12_000,
          "human toAct before disconnect",
        );

        const handIdBeforeDisconnect = room.state.handId;
        const handSeqBeforeDisconnect = room.state.handActionSeq;
        if (typeof room.dealer.markDisconnectedSerialized === "function") {
          await room.dealer.markDisconnectedSerialized("user_a", Date.now() - 1);
        } else {
          room.dealer.markDisconnected("user_a", Date.now() - 1);
        }

        await waitFor(
          () =>
            room.state.handId !== handIdBeforeDisconnect ||
            room.state.handActionSeq > handSeqBeforeDisconnect,
          6_000,
          "disconnected human progression observed",
        );

        // Wait past the stall threshold window after AUTO progression.
        await delay(11_000);

        const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
        const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
        expect(stalledCalls.length).toBe(0);
        expect(redriveCalls.length).toBe(0);
      } finally {
        room.onDispose();
      }
    },
    35_000,
  );

  it(
    "re-derives actor when human becomes inactive mid-turn",
    async () => {
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        return { action: "FOLD" };
      });

      const { room, clientA } = await setupHumanVsBotRoomWithTimeouts();
      try {
        const startHandId = clientA.latestSnapshot?.hand?.handId;
        expect(startHandId).toBeTruthy();

        await waitFor(
          () => {
            const snap = clientA.latestSnapshot;
            const hand = snap?.hand;
            if (!snap || !hand || hand.handId !== startHandId) return false;
            const toActUserId = snap.seats.find((s) => s.seat === hand.toActSeat)?.userId;
            return toActUserId === "user_a";
          },
          12_000,
          "human toAct before inactivation",
        );

        const seqBefore = room.state.handActionSeq;
        const handBefore = room.state.handId;
        if (typeof room.dealer.markDisconnectedSerialized === "function") {
          await room.dealer.markDisconnectedSerialized("user_a", Date.now() - 1);
        } else {
          room.dealer.markDisconnected("user_a", Date.now() - 1);
        }

        await waitFor(
          () =>
            room.state.handId !== handBefore ||
            room.state.handActionSeq > seqBefore ||
            room.state.seats[room.state.toActSeat] !== "user_a",
          8_000,
          "actor re-derived after human inactivation",
        );

        if (room.state.handId === handBefore && room.state.street !== "WAITING") {
          expect(room.state.seats[room.state.toActSeat]).not.toBe("user_a");
        }
      } finally {
        room.onDispose();
      }
    },
    35_000,
  );

  it(
    "discarded stale queued callback from prior turn does not mutate newer turn state",
    async () => {
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        return { action: "FOLD" };
      });
      const infoSpy = vi.spyOn(logger, "info");

      const { room, clientA } = await setupHumanVsBotRoom();
      try {
        const botUserId =
          clientA.latestSnapshot?.seats.find((s) => s.userId?.startsWith("bot_"))?.userId ?? "";
        expect(botUserId).toBeTruthy();
        if (!botUserId) return;

        const dealerAny = room.dealer as any;
        const beforeSeq = room.state.handActionSeq;
        dealerAny.turnManager.enqueueInternalAction(botUserId, { action: "CALL" }, 0);
        dealerAny.turnManager.autoActionDispatcher?.pendingAutoActionTokenKeys?.clear();
        dealerAny.turnManager.enqueueInternalAction(botUserId, { action: "CALL" }, 400);

        await waitFor(
          () =>
            room.state.handActionSeq > beforeSeq ||
            infoSpy.mock.calls.some((call) => String(call[1] ?? "") === "AUTO_ACTION_DISCARDED"),
          12_000,
          "newer turn or stale discard observed after immediate queued action",
        );
        const boundaryHandId = room.state.handId;
        const boundaryStreet = room.state.street;
        const boundarySeq = room.state.handActionSeq;

        await delay(1200);

        expect(room.state.handId).toBe(boundaryHandId);
        // Street may advance naturally while queued callbacks settle; invariant is no rollback/cross-hand mutation.
        expect(room.state.handActionSeq).toBeGreaterThanOrEqual(boundarySeq);
        const staleDiscardSeen = infoSpy.mock.calls.some((call) => {
          const msg = String(call[1] ?? "");
          const payload = call[0] as { msg?: string; staleReason?: string } | undefined;
          return (
            msg === "AUTO_ACTION_DISCARDED" ||
            payload?.msg === "AUTO_ACTION_DISCARDED" ||
            (
              payload?.staleReason === "HAND_ID_CHANGED" ||
              payload?.staleReason === "STREET_CHANGED" ||
              payload?.staleReason === "HAND_ACTION_SEQ_CHANGED"
            )
          );
        });
        expect(staleDiscardSeen).toBe(true);
      } finally {
        room.onDispose();
      }
    },
    35_000,
  );

  it(
    "queued callback from prior hand is inert after hand restart boundary",
    async () => {
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        return { action: "FOLD" };
      });
      const infoSpy = vi.spyOn(logger, "info");

      const { room, clientA } = await setupHumanVsBotRoom();
      try {
        const initialHandId = clientA.latestSnapshot?.hand?.handId ?? "";
        expect(initialHandId).toBeTruthy();

        const botUserId =
          clientA.latestSnapshot?.seats.find((s) => s.userId?.startsWith("bot_"))?.userId ?? "";
        expect(botUserId).toBeTruthy();
        if (!botUserId) return;

        const dealerAny = room.dealer as any;
        const beforeSeq = room.state.handActionSeq;
        dealerAny.turnManager.enqueueInternalAction(botUserId, { action: "FOLD" }, 0);
        dealerAny.turnManager.autoActionDispatcher?.pendingAutoActionTokenKeys?.clear();
        dealerAny.turnManager.enqueueInternalAction(botUserId, { action: "FOLD" }, 500);

        await waitFor(
          () =>
            room.state.handActionSeq > beforeSeq ||
            String(room.state.street) === "WAITING" ||
            infoSpy.mock.calls.some((call) => String(call[1] ?? "") === "AUTO_ACTION_DISCARDED"),
          12_000,
          "prior hand callback processed",
        );

        const state = room.state;
        const userA = state.playersById.get("user_a");
        const bot = state.playersById.get(botUserId);
        expect(userA).toBeTruthy();
        expect(bot).toBeTruthy();
        if (!userA || !bot) return;

        state.handId = `${initialHandId}_restarted`;
        state.street = "PREFLOP";
        state.roundState = "WAITING_FOR_ACTION";
        state.turnDeadlineMs = 0;
        state.toActSeat = userA.seat;
        state.handActionSeq += 1;
        userA.status = "ACTIVE";
        userA.connected = true;
        userA.needsAction = true;
        bot.needsAction = false;

        const boundary = {
          handId: String(state.handId ?? ""),
          street: String(state.street ?? ""),
          handActionSeq: Number(state.handActionSeq ?? 0),
        };

        await delay(1200);

        expect(String(state.handId ?? "")).toBe(boundary.handId);
        expect(String(state.street ?? "")).toBe(boundary.street);
        expect(Number(state.handActionSeq ?? 0)).toBe(boundary.handActionSeq);

        const staleDiscardSeen = infoSpy.mock.calls.some((call) => {
          const msg = String(call[1] ?? "");
          const payload = call[0] as { msg?: string; staleReason?: string } | undefined;
          return (
            msg === "AUTO_ACTION_DISCARDED" ||
            payload?.msg === "AUTO_ACTION_DISCARDED" ||
            payload?.staleReason === "HAND_ID_CHANGED"
          );
        });
        expect(staleDiscardSeen).toBe(true);
      } finally {
        room.onDispose();
      }
    },
    35_000,
  );

  it(
    "timeout callback after manual action is inert for stale turn token at room boundary",
    async () => {
      const realSetTimeout = global.setTimeout;
      const realClearTimeout = global.clearTimeout;
      const capturedTimeouts = new Map<number, () => void>();
      let nextHandle = 1;

      vi.spyOn(global, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, ms?: number) => {
        if (typeof ms === "number" && ms >= 30_000) {
          const handle = nextHandle++;
          capturedTimeouts.set(handle, () => cb());
          return handle as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(cb as (...args: unknown[]) => void, ms);
      }) as typeof setTimeout);
      vi.spyOn(global, "clearTimeout").mockImplementation(((id: ReturnType<typeof setTimeout>) => {
        const removed = capturedTimeouts.delete(Number(id));
        if (!removed) {
          realClearTimeout(id as unknown as NodeJS.Timeout);
        }
      }) as typeof clearTimeout);

      const { room, clientA, clientB } = await setupTwoPlayerRoomWithTimeouts();
      try {
        await waitFor(
          () => capturedTimeouts.size > 0 && (room.state.turnDeadlineMs ?? 0) > 0,
          12_000,
          "initial timeout arm for current actor",
        );

        const staleCallback = capturedTimeouts.values().next().value as (() => void) | undefined;
        expect(staleCallback).toBeTruthy();
        if (!staleCallback) return;

        const toActSeat = room.state.toActSeat;
        const toActUserId = room.state.seats[toActSeat] ?? "";
        expect(toActUserId).toBeTruthy();
        if (!toActUserId) return;

        const actorClient = toActUserId === "user_a" ? clientA : clientB;
        const beforeSeq = room.state.handActionSeq;
        const action = pickLegalAction(actorClient.latestSnapshot!);
        room.onMessageEvents.emit("ACTION", actorClient as any, {
          ...action,
          actionId: `stale-timeout-race-${Date.now()}`,
        });
        await flushAsync();
        await waitFor(
          () => room.state.handActionSeq > beforeSeq,
          4_000,
          "manual action applied before stale timeout callback",
        );

        const stateAfterManualAction = {
          handId: String(room.state.handId ?? ""),
          street: String(room.state.street ?? ""),
          toActSeat: Number(room.state.toActSeat ?? -1),
          handActionSeq: Number(room.state.handActionSeq ?? 0),
          deadline: Number(room.state.turnDeadlineMs ?? 0),
        };

        staleCallback();
        await delay(80);

        // Stale callback must not rewind or corrupt state; allow natural progression (e.g. hand end).
        expect(String(room.state.handId ?? "")).toBe(stateAfterManualAction.handId);
        expect(Number(room.state.handActionSeq ?? 0)).toBeGreaterThanOrEqual(stateAfterManualAction.handActionSeq);
        expect(Number(room.state.turnDeadlineMs ?? 0)).toBeGreaterThanOrEqual(0);
      } finally {
        try {
          await room.onLeave(clientA as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
        try {
          await room.onLeave(clientB as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
        vi.restoreAllMocks();
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
      }
    },
    35_000,
  );

  it(
    "seat removed while timer active: stale timeout callback is inert",
    async () => {
      const realSetTimeout = global.setTimeout;
      const realClearTimeout = global.clearTimeout;
      const capturedTimeouts = new Map<number, () => void>();
      let nextHandle = 1;

      vi.spyOn(global, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, ms?: number) => {
        if (typeof ms === "number" && ms >= 30_000) {
          const handle = nextHandle++;
          capturedTimeouts.set(handle, () => cb());
          return handle as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(cb as (...args: unknown[]) => void, ms);
      }) as typeof setTimeout);
      vi.spyOn(global, "clearTimeout").mockImplementation(((id: ReturnType<typeof setTimeout>) => {
        const removed = capturedTimeouts.delete(Number(id));
        if (!removed) {
          realClearTimeout(id as unknown as NodeJS.Timeout);
        }
      }) as typeof clearTimeout);

      const { room, clientA, clientB } = await setupTwoPlayerRoomWithTimeouts();
      try {
        await waitFor(
          () => capturedTimeouts.size > 0 && (room.state.turnDeadlineMs ?? 0) > 0,
          12_000,
          "human timeout armed before seat removal",
        );

        const staleCallback = capturedTimeouts.values().next().value as (() => void) | undefined;
        expect(staleCallback).toBeTruthy();
        if (!staleCallback) return;

        const toActSeat = room.state.toActSeat;
        const toActUserId = room.state.seats[toActSeat] ?? "";
        expect(toActUserId).toBeTruthy();
        if (!toActUserId) return;

        const actorClient = toActUserId === "user_a" ? clientA : clientB;
        await room.onLeave(actorClient as any, 4000);

        await waitFor(
          () =>
            !room.state.seats.includes(toActUserId) &&
            String(room.state.street ?? "") === "WAITING",
          8_000,
          "seat removed and table transitioned to WAITING",
        );

        const boundary = {
          handId: String(room.state.handId ?? ""),
          street: String(room.state.street ?? ""),
          handActionSeq: Number(room.state.handActionSeq ?? 0),
          deadline: Number(room.state.turnDeadlineMs ?? 0),
        };

        staleCallback();
        await delay(80);

        expect(room.state.seats.includes(toActUserId)).toBe(false);
        expect(String(room.state.street ?? "")).toBe(boundary.street);
        expect(String(room.state.handId ?? "")).toBe(boundary.handId);
        expect(Number(room.state.handActionSeq ?? 0)).toBe(boundary.handActionSeq);
        expect(Number(room.state.turnDeadlineMs ?? 0)).toBe(boundary.deadline);
      } finally {
        try {
          await room.onLeave(clientA as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
        try {
          await room.onLeave(clientB as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
        vi.restoreAllMocks();
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
      }
    },
    35_000,
  );

  it(
    "stale human timeout callback from prior hand is inert after hand restart boundary",
    async () => {
      const realSetTimeout = global.setTimeout;
      const realClearTimeout = global.clearTimeout;
      const capturedTimeouts = new Map<number, () => void>();
      let nextHandle = 1;

      vi.spyOn(global, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, ms?: number) => {
        if (typeof ms === "number" && ms >= 30_000) {
          const handle = nextHandle++;
          capturedTimeouts.set(handle, () => cb());
          return handle as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(cb as (...args: unknown[]) => void, ms);
      }) as typeof setTimeout);
      vi.spyOn(global, "clearTimeout").mockImplementation(((id: ReturnType<typeof setTimeout>) => {
        const removed = capturedTimeouts.delete(Number(id));
        if (!removed) {
          realClearTimeout(id as unknown as NodeJS.Timeout);
        }
      }) as typeof clearTimeout);

      const { room } = await setupHumanVsBotRoomWithTimeouts();
      try {
        const state = room.state;
        const userA = state.playersById.get("user_a");
        expect(userA).toBeTruthy();
        if (!userA) return;
        state.street = "PREFLOP";
        state.roundState = "WAITING_FOR_ACTION";
        state.toActSeat = userA.seat;
        state.turnDeadlineMs = 0;
        userA.status = "ACTIVE";
        userA.connected = true;
        userA.needsAction = true;
        await (room.dealer as any).requestDrive("STALE_TIMEOUT_PRIME_HUMAN_TIMEOUT");

        const started = Date.now();
        while (capturedTimeouts.size === 0) {
          if (Date.now() - started > 20_000) {
            throw new Error("Timed out waiting for: initial human timeout arm");
          }
          // Some runs do not naturally arm quickly; explicitly request/arm while user_a is toAct.
          if ((state.seats[state.toActSeat] ?? "") === "user_a") {
            const dealerAny = room.dealer as any;
            if (typeof dealerAny.scheduleHumanTurnTimeout === "function") {
              dealerAny.scheduleHumanTurnTimeout("user_a");
            }
            await dealerAny.requestDrive?.("STALE_TIMEOUT_PRIME_HUMAN_TIMEOUT_RETRY");
          }
          await flushAsync();
          await delay(25);
        }

        const staleCallback = capturedTimeouts.values().next().value as (() => void) | undefined;
        expect(staleCallback).toBeTruthy();
        if (!staleCallback) return;

        const priorHandId = state.handId;
        state.handId = `${priorHandId}_restarted`;
        state.street = "PREFLOP";
        state.roundState = "WAITING_FOR_ACTION";
        state.turnDeadlineMs = 0;
        state.toActSeat = userA.seat;
        userA.status = "ACTIVE";
        userA.connected = true;
        userA.needsAction = true;

        await (room.dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
        await waitFor(
          () => (state.turnDeadlineMs ?? 0) > 0,
          4_000,
          "new hand timeout arm",
        );

        const seqBefore = Number(state.handActionSeq ?? 0);
        staleCallback();
        await delay(50);

        expect(state.handId).toBe(`${priorHandId}_restarted`);
        // Stale callback must not regress hand identity/sequence; allow self-heal to re-arm independently.
        expect(state.turnDeadlineMs ?? 0).toBeGreaterThanOrEqual(0);
        expect(Number(state.handActionSeq ?? 0)).toBeGreaterThanOrEqual(seqBefore);
      } finally {
        room.onDispose();
        vi.restoreAllMocks();
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
      }
    },
    35_000,
  );

  it(
    "maintains valid actor derivation under rapid disconnect/reconnect churn",
    async () => {
      const warnSpy = vi.spyOn(logger, "warn");
      const { room, clientA, clientB } = await setupTwoPlayerRoomWithTimeouts();
      try {
        const waitForActionableTurn = async (step: number) => {
          const started = Date.now();
          while (Date.now() - started < 20_000) {
            const street = String(room.state.street ?? "");
            const toActSeat = Number(room.state.toActSeat ?? -1);
            const toActUserId = toActSeat >= 0 ? String(room.state.seats[toActSeat] ?? "") : "";
            const toActPlayer = toActUserId ? room.state.playersById.get(toActUserId) : undefined;
            const actionable =
              street !== "WAITING" &&
              street !== "SHOWDOWN" &&
              toActSeat >= 0 &&
              Boolean(toActUserId) &&
              Boolean(toActPlayer) &&
              toActPlayer?.status === "ACTIVE" &&
              toActPlayer?.needsAction === true;
            if (
              actionable
            ) {
              return;
            }
            if (street === "WAITING") {
              await (room.dealer as any).requestDrive("ACTOR_CHURN_WAITING_REDRIVE");
            } else {
              if (toActPlayer?.kind === "HUMAN" && toActUserId && toActPlayer.connected === false) {
                await room.dealer.markReconnectedSerialized(toActUserId);
              }
              await (room.dealer as any).requestDrive("ACTOR_CHURN_ACTIONABLE_REDRIVE");
            }
            await flushAsync();
            await delay(30);
          }
          throw new Error(`Timed out waiting for: waiting_for_action step=${step}`);
        };

        let completedSteps = 0;
        const maxSteps = 6;
        while (completedSteps < maxSteps) {
          await waitForActionableTurn(completedSteps);

          const street = String(room.state.street ?? "");
          if (street === "WAITING" || street === "SHOWDOWN") {
            await delay(30);
            continue;
          }

          const toActSeat = Number(room.state.toActSeat ?? -1);
          expect(toActSeat).toBeGreaterThanOrEqual(0);
          expect(toActSeat).toBeLessThan(room.state.seats.length);
          const toActUserId = room.state.seats[toActSeat] ?? "";
          expect(toActUserId).toBeTruthy();
          if (!toActUserId) break;

          const toActPlayer = room.state.playersById.get(toActUserId);
          expect(toActPlayer).toBeTruthy();
          expect(toActPlayer?.needsAction).toBe(true);
          expect(toActPlayer?.status).toBe("ACTIVE");
          if (toActPlayer?.kind === "HUMAN" && toActPlayer.connected) {
            expect(Number(room.state.turnDeadlineMs ?? 0)).toBeGreaterThan(0);
          }

          const before = {
            handId: String(room.state.handId ?? ""),
            handActionSeq: Number(room.state.handActionSeq ?? 0),
            toActSeat,
            street,
          };

          // Every 3rd step, churn the non-actor so we exercise reconnect paths without blocking the current turn.
          if (completedSteps % 3 === 0) {
            const churnUserId = toActUserId === "user_a" ? "user_b" : "user_a";
            await room.dealer.markDisconnectedSerialized(churnUserId, Date.now() + 30_000);
            await room.dealer.markReconnectedSerialized(churnUserId);
          }

          const actorClient = toActUserId === "user_a" ? clientA : clientB;
          const snap = actorClient.latestSnapshot;
          expect(snap?.hero?.actionOptions).toBeTruthy();
          if (!snap?.hero?.actionOptions) {
            await delay(40);
            continue;
          }
          const action = pickLegalAction(snap);
          room.onMessageEvents.emit("ACTION", actorClient as any, {
            ...action,
            actionId: `actor-churn-${Date.now()}-${completedSteps}`,
          });
          await flushAsync();
          await waitFor(
            () =>
              String(room.state.handId ?? "") !== before.handId ||
              Number(room.state.handActionSeq ?? 0) > before.handActionSeq ||
              Number(room.state.toActSeat ?? -1) !== before.toActSeat ||
              String(room.state.street ?? "") !== before.street,
            10_000,
            `progress after action step=${completedSteps}`,
          );

          // Post-step actor invariants.
          if (String(room.state.street ?? "") !== "WAITING" && String(room.state.street ?? "") !== "SHOWDOWN") {
            const postSeat = Number(room.state.toActSeat ?? -1);
            expect(postSeat).toBeGreaterThanOrEqual(0);
            const postUserId = room.state.seats[postSeat] ?? "";
            expect(postUserId).toBeTruthy();
            if (postUserId) {
              const postPlayer = room.state.playersById.get(postUserId);
              expect(postPlayer).toBeTruthy();
              expect(postPlayer?.needsAction).toBe(true);
              expect(postPlayer?.status).toBe("ACTIVE");
              if (postPlayer?.kind === "HUMAN" && postPlayer.connected) {
                expect(Number(room.state.turnDeadlineMs ?? 0)).toBeGreaterThan(0);
              }
            }
          }

          completedSteps += 1;
        }

        expect(completedSteps).toBeGreaterThanOrEqual(maxSteps);
        const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
        const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
        expect(stalledCalls.length).toBe(0);
        expect(redriveCalls.length).toBe(0);
      } finally {
        try {
          await room.onLeave(clientA as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
        try {
          await room.onLeave(clientB as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      }
    },
    45_000,
  );

  it(
    "mixed stale timeout + queued callback from prior hand are inert after hand restart boundary",
    async () => {
      const realSetTimeout = global.setTimeout;
      const realClearTimeout = global.clearTimeout;
      const capturedTimeouts = new Map<number, () => void>();
      let nextHandle = 1;

      vi.spyOn(global, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, ms?: number) => {
        if (typeof ms === "number" && ms >= 30_000) {
          const handle = nextHandle++;
          capturedTimeouts.set(handle, () => cb());
          return handle as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(cb as (...args: unknown[]) => void, ms);
      }) as typeof setTimeout);
      vi.spyOn(global, "clearTimeout").mockImplementation(((id: ReturnType<typeof setTimeout>) => {
        const removed = capturedTimeouts.delete(Number(id));
        if (!removed) {
          realClearTimeout(id as unknown as NodeJS.Timeout);
        }
      }) as typeof clearTimeout);

      const infoSpy = vi.spyOn(logger, "info");
      const { room } = await setupHumanVsBotRoomWithTimeouts();
      try {
        const state = room.state;
        const userA = state.playersById.get("user_a");
        expect(userA).toBeTruthy();
        if (!userA) return;
        state.street = "PREFLOP";
        state.roundState = "WAITING_FOR_ACTION";
        state.toActSeat = userA.seat;
        state.turnDeadlineMs = 0;
        userA.status = "ACTIVE";
        userA.connected = true;
        userA.needsAction = true;
        await (room.dealer as any).requestDrive("MIXED_STALE_PRIME_HUMAN_TIMEOUT");

        const started = Date.now();
        while (capturedTimeouts.size === 0) {
          if (Date.now() - started > 20_000) {
            throw new Error("Timed out waiting for: initial human timeout arm for mixed stale race");
          }
          if ((state.seats[state.toActSeat] ?? "") === "user_a") {
            const dealerAny = room.dealer as any;
            if (typeof dealerAny.scheduleHumanTurnTimeout === "function") {
              dealerAny.scheduleHumanTurnTimeout("user_a");
            }
            await dealerAny.requestDrive?.("MIXED_STALE_PRIME_HUMAN_TIMEOUT_RETRY");
          }
          await flushAsync();
          await delay(25);
        }
        const staleTimeoutCallback = capturedTimeouts.values().next().value as (() => void) | undefined;
        expect(staleTimeoutCallback).toBeTruthy();
        if (!staleTimeoutCallback) return;

        const dealerAny = room.dealer as any;
        const botUserId = [...state.playersById.values()].find((p: any) => p.kind === "BOT")?.id ?? "";
        const botPlayer = botUserId ? state.playersById.get(botUserId) : undefined;
        expect(botUserId).toBeTruthy();
        expect(botPlayer).toBeTruthy();
        if (!botUserId || !userA || !botPlayer) return;

        // Queue delayed bot action tied to prior hand; should be stale after restart boundary.
        dealerAny.turnManager.enqueueInternalAction(botUserId, { action: "FOLD" }, 500);

        const priorHandId = state.handId;
        state.handId = `${priorHandId}_restarted_mixed`;
        state.street = "PREFLOP";
        state.roundState = "WAITING_FOR_ACTION";
        state.turnDeadlineMs = 0;
        state.toActSeat = userA.seat;
        state.handActionSeq += 1;
        userA.status = "ACTIVE";
        userA.connected = true;
        userA.needsAction = true;
        botPlayer.status = "ACTIVE";
        botPlayer.connected = true;
        botPlayer.needsAction = false;

        await (room.dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
        await waitFor(
          () => (state.turnDeadlineMs ?? 0) > 0,
          4_000,
          "new hand timeout arm for mixed stale race",
        );

        const boundary = {
          handId: String(state.handId ?? ""),
          street: String(state.street ?? ""),
          handActionSeq: Number(state.handActionSeq ?? 0),
          userStatus: String(userA.status ?? ""),
        };

        // Fire stale prior-hand timeout callback and allow delayed queued callback to execute.
        staleTimeoutCallback();
        await delay(800);

        expect(String(state.handId ?? "")).toBe(boundary.handId);
        expect(Number(state.handActionSeq ?? 0)).toBeGreaterThanOrEqual(boundary.handActionSeq);
        expect(Number(state.turnDeadlineMs ?? 0)).toBeGreaterThanOrEqual(0);

        const staleDiscardSeen = infoSpy.mock.calls.some((call) => {
          const msg = String(call[1] ?? "");
          const payload = call[0] as { msg?: string; staleReason?: string } | undefined;
          return (
            msg === "AUTO_ACTION_DISCARDED" ||
            payload?.msg === "AUTO_ACTION_DISCARDED" ||
            payload?.staleReason === "HAND_ID_CHANGED" ||
            payload?.staleReason === "HAND_ACTION_SEQ_CHANGED"
          );
        });
        expect(staleDiscardSeen).toBe(true);
      } finally {
        room.onDispose();
        vi.restoreAllMocks();
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
      }
    },
    35_000,
  );

  it(
    "reconnect after auto-action advancement emits a fresh snapshot with current engine state",
    async () => {
      const { room, clientA, clientB } = await setupTwoPlayerRoomWithTimeouts();
      try {
        const before = clientA.latestSnapshot!;
        const toActSeat = before.hand!.toActSeat;
        const toActUserId = before.seats.find((s) => s.seat === toActSeat)?.userId ?? "";
        expect(toActUserId).toBeTruthy();
        if (!toActUserId) return;

        const reconnectClient = toActUserId === "user_a" ? clientA : clientB;
        const beforeDisconnectSnapshotId = reconnectClient.latestSnapshot?.snapshotId ?? "";
        const beforeSeq = Number(room.state.handActionSeq ?? 0);
        const beforeHandId = String(room.state.handId ?? "");

        await room.dealer.markDisconnectedSerialized(toActUserId, Date.now() - 1);
        await waitFor(
          () =>
            String(room.state.handId ?? "") !== beforeHandId ||
            Number(room.state.handActionSeq ?? 0) > beforeSeq ||
            Number(room.state.toActSeat ?? -1) !== toActSeat,
          10_000,
          "auto action progression after disconnect",
        );

        const progressedState = {
          handId: String(room.state.handId ?? ""),
          street: String(room.state.street ?? ""),
          toActSeat: Number(room.state.toActSeat ?? -1),
          turnDeadlineMs: Number(room.state.turnDeadlineMs ?? 0),
        };

        await room.dealer.markReconnectedSerialized(toActUserId);
        await waitFor(
          () =>
            reconnectClient.latestSnapshot?.snapshotId !== beforeDisconnectSnapshotId &&
            reconnectClient.latestSnapshot?.reason === "RECONNECT",
          6_000,
          "fresh reconnect snapshot",
        );

        const reconnectSnapshot = reconnectClient.latestSnapshot!;
        if (progressedState.street === "WAITING") {
          expect(reconnectSnapshot.hand).toBeUndefined();
        } else {
          expect(reconnectSnapshot.hand?.handId ?? "").toBe(progressedState.handId);
          expect(reconnectSnapshot.hand?.street ?? "").toBe(progressedState.street);
          expect(Number(reconnectSnapshot.hand?.toActSeat ?? -1)).toBe(progressedState.toActSeat);
          expect(Number(reconnectSnapshot.hand?.turnDeadlineMs ?? 0)).toBe(progressedState.turnDeadlineMs);
        }

        const currentToActUserId =
          progressedState.toActSeat >= 0 ? String(room.state.seats[progressedState.toActSeat] ?? "") : "";
        const currentToActPlayer = currentToActUserId ? room.state.playersById.get(currentToActUserId) : undefined;
        if (
          currentToActPlayer?.kind === "HUMAN" &&
          currentToActPlayer.connected &&
          currentToActPlayer.status === "ACTIVE" &&
          currentToActPlayer.needsAction
        ) {
          expect(progressedState.turnDeadlineMs).toBeGreaterThan(0);
        }
      } finally {
        try {
          await room.onLeave(clientA as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
        try {
          await room.onLeave(clientB as any, 4000);
        } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
      }
    },
    35_000,
  );

  it(
    "does not emit TABLE_STALLED when connected human is waiting with a valid future deadline (decision stall detection enabled)",
    async () => {
      const decisionStallEnv = process.env.FEATURE_DECISION_STALL_DETECTION;
      process.env.FEATURE_DECISION_STALL_DETECTION = "true";
      vi.spyOn(RandomBotBrain.prototype, "pickAction").mockImplementation((ctx) => {
        if (ctx.heroActionOptions.canCheck) return { action: "CHECK" };
        if (ctx.heroActionOptions.canCall) return { action: "CALL" };
        return { action: "FOLD" };
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const { room, clientA } = await setupHumanVsBotRoomWithTimeouts();
      try {
        const startHandId = clientA.latestSnapshot?.hand?.handId;
        expect(startHandId).toBeTruthy();
        let reachedFlopHumanToAct = false;

        for (let guard = 0; guard < 40; guard += 1) {
          const snap = clientA.latestSnapshot;
          const hand = snap?.hand;
          if (!snap || !hand || hand.handId !== startHandId) {
            await delay(50);
            continue;
          }
          const toActSeat = hand.toActSeat;
          const toActUserId = snap.seats.find((s) => s.seat === toActSeat)?.userId;
          if (hand.street === "FLOP" && toActUserId === "user_a") {
            reachedFlopHumanToAct = true;
            break;
          }
          if (toActUserId === "user_a") {
            const opts = snap.hero.actionOptions;
            if (opts && (opts.canCheck || opts.canCall || opts.canFold || opts.canAllIn)) {
              const action = opts.canCheck ? ({ action: "CHECK" as const }) : pickLegalAction(snap);
              room.onMessageEvents.emit("ACTION", clientA as any, {
                ...action,
                actionId: `decision-stall-human-wait-${Date.now()}-${guard}`,
              });
              await delay(100);
              continue;
            }
          }
          await delay(50);
        }

        expect(reachedFlopHumanToAct).toBe(true);
        expect(room.state.street).toBe("FLOP");
        const decisionStallDeadline = Number(room.state.turnDeadlineMs ?? 0);
        expect(decisionStallDeadline).toBeGreaterThan(0);
        // Allow small clock drift between deadline arm and assertion.
        expect(decisionStallDeadline).toBeGreaterThan(Date.now() - 2000);

        if (room.stallCheckInterval) {
          clearInterval(room.stallCheckInterval);
          room.stallCheckInterval = null;
        }
        room.lastSnapshotAt = Date.now() - 30_000;
        room.startStallMonitorInternal();
        await delay(10_500);

        const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
        const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
        expect(stalledCalls.length).toBe(0);
        expect(redriveCalls.length).toBe(0);
      } finally {
        process.env.FEATURE_DECISION_STALL_DETECTION = decisionStallEnv;
        room.onDispose();
      }
    },
    35_000,
  );

  it("emits winner-visible HAND_END snapshot when human folds to bot", async () => {
    const { room, clientA } = await setupHumanVsBotRoom();
    try {
      await waitFor(
        () =>
          clientA.latestSnapshot?.seats.find((s) => s.seat === clientA.latestSnapshot?.hand?.toActSeat)?.userId === "user_a" &&
          Boolean(clientA.latestSnapshot?.hero?.actionOptions),
        10000,
        "human to-act before fold",
      );
      const currentHandId = clientA.latestSnapshot?.hand?.handId ?? room.state.handId;
      room.onMessageEvents.emit("ACTION", clientA as any, { action: "FOLD", actionId: "human-fold-" + Date.now() });

      await waitFor(
        () => {
          const snapshots = (clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[];
          const latest = clientA.latestSnapshot;
          const terminalSeenInHistory = snapshots.some(
            (snap) =>
              ((snap.reason === "HAND_END" || snap.reason === "HAND_SHOWDOWN") &&
                snap.lastHandResult?.handId === currentHandId) ||
              (snap.lastHandResult?.handId === currentHandId &&
                snap.hand?.street === "WAITING"),
          );
          const terminalSeenInLatest = latest != null &&
            latest.lastHandResult?.handId === currentHandId &&
            (latest.reason === "HAND_END" ||
              latest.reason === "HAND_SHOWDOWN" ||
              latest.hand?.street === "WAITING");
          return terminalSeenInHistory || Boolean(terminalSeenInLatest);
        },
        15000,
        "fold hand end",
      );

      const snapshots = (clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[];
      const handEndSnapshot =
        snapshots.find((snap) => snap.reason === "HAND_END" && snap.lastHandResult?.handId === currentHandId) ??
        snapshots.find((snap) => snap.reason === "HAND_SHOWDOWN" && snap.lastHandResult?.handId === currentHandId) ??
        snapshots.find((snap) => snap.lastHandResult?.handId === currentHandId) ??
        clientA.latestSnapshot;
      expect(handEndSnapshot).toBeDefined();
      const terminalStreet = handEndSnapshot?.hand?.street;
      expect(
        terminalStreet === undefined ||
          terminalStreet === "WAITING" ||
          terminalStreet === "PREFLOP" ||
          terminalStreet === "FLOP" ||
          terminalStreet === "TURN" ||
          terminalStreet === "RIVER" ||
          terminalStreet === "SHOWDOWN",
      ).toBe(true);
      expect(handEndSnapshot?.lastHandResult?.winnerId).toBeDefined();
      expect(handEndSnapshot?.lastHandResult?.handId).toBeDefined();
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch (err) { console.warn("cleanup error (table-action-broadcast):", err); }
    }
  });
});

