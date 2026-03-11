import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "./PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { TableSnapshotLogService } from "../engine/persistence/TableSnapshotLogService.js";
import { RandomBotBrain } from "../engine/bots/BotBrain.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { logger } from "../lib/logger.js";

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

vi.setConfig({ testTimeout: 20000 });

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
      await waitFor(() => (wrongClient.sentByType.ERROR?.length ?? 0) > errorCountBefore, 2000, "error message");

      const errorCodes = ((wrongClient.sentByType.ERROR ?? []) as any[]).map((e) => e?.code);
      expect(errorCodes).toContain("NOT_YOUR_TURN");
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
      await waitFor(() => (actor.sentByType.ERROR?.length ?? 0) > errorCountBefore, 2000, "hand mismatch error");

      const lastError = ((actor.sentByType.ERROR ?? []) as any[]).at(-1);
      expect(lastError?.code).toBe("HAND_NOT_STARTED");
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
      const converged =
        Boolean(afterA.hand?.handId) &&
        Boolean(afterB.hand?.handId) &&
        (
          Boolean(afterA.lastHandResult?.handId) ||
          afterA.hand?.street !== beforeA.hand?.street ||
          (afterA.hand?.actionCount ?? 0) !== (beforeA.hand?.actionCount ?? 0) ||
          !actorStillToAct
        );
      expect(converged).toBe(true);
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
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
            
            if (snapshots.length > 0) {
              const last = snapshots[snapshots.length - 1];
              process.stdout.write(`\n[TEST_SNOOP] Reason: ${last.reason}, Street: ${last.hand?.street}, Board: ${last.hand?.board?.length}\n`);
            }

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
      } catch {}
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
      } catch {}
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
      const startHandId = clientA.latestSnapshot?.hand?.handId;
      expect(startHandId).toBeTruthy();
      let guard = 0;
      while (guard < 30) {
        guard += 1;
        const snap = clientA.latestSnapshot;
        const hand = snap?.hand;
        if (!snap || !hand) {
          await delay(50);
          continue;
        }
        if (hand.handId !== startHandId) break;
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
          room.onMessageEvents.emit("ACTION", clientA as any, { ...action, actionId: `river-actionable-${Date.now()}-${guard}` });
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
      } catch {}
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
        expect(room.state.turnDeadlineMs).toBeGreaterThan(Date.now());

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
      const beforeCount = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      room.onMessageEvents.emit("ACTION", clientA as any, { action: "FOLD", actionId: "human-fold-" + Date.now() });

      await waitFor(
        () => {
          const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
          return snapshots.some(
            (snap) =>
              snap.reason === "HAND_END" ||
              snap.reason === "HAND_SHOWDOWN" ||
              Boolean(snap.lastHandResult?.handId),
          );
        },
        8000,
        "fold hand end",
      );

      const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
      const handEndSnapshot =
        snapshots.find((snap) => snap.reason === "HAND_END") ??
        snapshots.find((snap) => snap.reason === "HAND_SHOWDOWN") ??
        snapshots.find((snap) => Boolean(snap.lastHandResult?.handId));
      expect(handEndSnapshot).toBeDefined();
      const terminalStreet = handEndSnapshot?.hand?.street;
      expect(
        terminalStreet === undefined ||
          terminalStreet === "WAITING" ||
          terminalStreet === "PREFLOP" ||
          terminalStreet === "SHOWDOWN",
      ).toBe(true);
      expect(handEndSnapshot?.lastHandResult?.winnerId).toBeDefined();
      expect(handEndSnapshot?.lastHandResult?.handId).toBeDefined();
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
    }
  });
});
