import { afterEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "../rooms/PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { TableSnapshotLogService } from "../engine/persistence/TableSnapshotLogService.js";
import { RandomBotBrain } from "../engine/bots/BotBrain.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

vi.setConfig({ testTimeout: 15000 });

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

    const clientA = makeClient("sess_human");
    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    room.onMessageEvents.emit("ADD_BOT", clientA as any, { name: "Bot", buyInCents: 5000, botId: "chaos_carl" });

    await waitFor(() => Boolean(clientA.latestSnapshot?.hand?.handId), 4000, "active hand human vs bot");
    await waitFor(() => (clientA.latestSnapshot?.seats.some((s) => s.isBot) ?? false), 4000, "bot seated");

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

      room.dealer.markDisconnected(String(toActUserId), Date.now() + 60_000);

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

  it("marks disconnected player as sitting out after auto-action cap", async () => {
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

      room.dealer.markDisconnected(String(toActUserId), Date.now() + 60_000);
      const connectedUserId = String(toActUserId) === "user_a" ? "user_b" : "user_a";
      const connectedClient = connectedUserId === "user_a" ? clientA : clientB;

      const startHandId = before.hand?.handId ?? "";
      // Deterministically drive the hand to completion so auto-action cap can be applied.
      for (let i = 0; i < 12; i++) {
        const snap = connectedClient.latestSnapshot;
        if (!snap) break;
        const handId = snap.hand?.handId ?? "";
        if (!handId || handId !== startHandId || Boolean(snap.lastHandResult?.handId)) break;

        const connectedSeat = snap.seats.find((s) => s.userId === connectedUserId)?.seat;
        const canActNow = connectedSeat !== undefined && snap.hand?.toActSeat === connectedSeat;
        if (canActNow) {
          const action = { ...pickLegalAction(snap), actionId: `act-${i}-${Date.now()}` };
          room.onMessageEvents.emit("ACTION", connectedClient as any, action);
        }
        await delay(120);
      }

      await waitFor(
        () =>
          Boolean(clientA.latestSnapshot?.seats.find((s) => s.userId === toActUserId && s.status === "ABANDONED")) &&
          markSittingOutSpy.mock.calls.length > 0,
        10000,
        "auto-action cap sit-out",
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
        const initial = clientA.latestSnapshot!;
        expect(initial.hand?.street).toBe("PREFLOP");
        const toActUserId = initial.seats.find((s) => s.seat === initial.hand?.toActSeat)?.userId;
        expect(toActUserId).toBe("user_a");

        const beforeCount = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
        await room.dealer.handleAction("user_a", { action: "ALL_IN" });

        await waitFor(
          () => {
            const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
            const reasons = snapshots.map((snap) => snap.reason);
            const runoutCount = reasons.filter((reason) => reason === "RUNOUT_STAGE").length;
            const hasTerminal = reasons.includes("HAND_END") || reasons.includes("HAND_SHOWDOWN");
            return runoutCount >= 3 && hasTerminal;
          },
          20000,
          "runout to hand end",
        );

      const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
      const reasons = snapshots.map((snap) => snap.reason);

      const actionAcceptedIdx = reasons.indexOf("ACTION_ACCEPTED");
      expect(actionAcceptedIdx).toBeGreaterThanOrEqual(0);
      const runoutIdxs = reasons
        .map((reason, idx) => ({ reason, idx }))
        .filter((entry) => entry.reason === "RUNOUT_STAGE")
        .map((entry) => entry.idx);
      expect(runoutIdxs.length).toBe(3);
      const handEndIdx = reasons.indexOf("HAND_END");
      const handShowdownIdx = reasons.indexOf("HAND_SHOWDOWN");
      const terminalIdx = handEndIdx >= 0 ? handEndIdx : handShowdownIdx;
      expect(terminalIdx).toBeGreaterThan(runoutIdxs[2]!);
      expect(runoutIdxs[0]!).toBeGreaterThan(actionAcceptedIdx);

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

  it("emits winner-visible HAND_END snapshot when human folds to bot", async () => {
    const { room, clientA } = await setupHumanVsBotRoom();
    try {
      const initial = clientA.latestSnapshot!;
      expect(initial.hand?.street).toBe("PREFLOP");
      const startingHandId = initial.hand?.handId;
      const toActUserId = initial.seats.find((s) => s.seat === initial.hand?.toActSeat)?.userId;
      expect(toActUserId).toBe("user_a");

      const beforeCount = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      await room.dealer.handleAction("user_a", { action: "FOLD" });

      await waitFor(
        () => {
          const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
          return snapshots.some((snap) => snap.reason === "HAND_END");
        },
        8000,
        "fold hand end",
      );

      const snapshots = ((clientA.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(beforeCount);
      const handEndSnapshot = snapshots.find((snap) => snap.reason === "HAND_END");
      expect(handEndSnapshot).toBeDefined();
      expect(handEndSnapshot?.hand?.street).toBe("PREFLOP");
      expect(handEndSnapshot?.lastHandResult?.winnerId).toBeDefined();
      expect(handEndSnapshot?.lastHandResult?.handId).toBeDefined();

      await waitFor(
        () =>
          Boolean(clientA.latestSnapshot?.hand?.handId) &&
          clientA.latestSnapshot?.hand?.handId !== startingHandId,
        12000,
        "next hand auto-start after fold",
      );
    } finally {
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
    }
  });
});
