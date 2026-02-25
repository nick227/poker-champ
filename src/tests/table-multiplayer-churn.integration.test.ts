import { afterEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "../rooms/PokerRoom.js";
import type { DealerDiagnosticEvent, DealerDiagnosticType } from "../engine/Dealer.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getActionableToActSeatFindingFromSnapshot, getSnapshotMoneyFindings } from "../engine/invariants/churnInvariantContract.js";

vi.setConfig({ testTimeout: 30000 });

type FakeClient = {
  sessionId: string;
  leave: () => void;
  send: (type: string, payload: unknown) => void;
  sentByType: Record<string, unknown[]>;
  latestSnapshot: TableSnapshotPayload | null;
};

const DIAGNOSTIC_DENYLIST: DealerDiagnosticType[] = [
  "QUEUED_AUTO_ACTION_FAILED",
  "QUEUE_RECOVERY_AFTER_FAILURE",
  "ACTION_FAILED",
];

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
    await delay(30);
  }
}

function pickLegalAction(snapshot: TableSnapshotPayload): { action: "FOLD" | "CHECK" | "CALL" | "ALL_IN" } {
  const opts = snapshot.hero.actionOptions;
  if (!opts) return { action: "FOLD" };
  if (opts.canCheck) return { action: "CHECK" };
  if (opts.canCall) return { action: "CALL" };
  if (opts.canFold) return { action: "FOLD" };
  if (opts.canAllIn) return { action: "ALL_IN" };
  return { action: "FOLD" };
}

function sumPayouts(result: TableSnapshotPayload["lastHandResult"] | undefined): number {
  return Object.values(result?.payoutsByUserId ?? {}).reduce((sum, value) => sum + value, 0);
}

function assertSnapshotChurnInvariants(snapshot: TableSnapshotPayload): void {
  expect(getSnapshotMoneyFindings(snapshot)).toEqual([]);
  expect(getActionableToActSeatFindingFromSnapshot(snapshot)).toBeNull();
  if (snapshot.lastHandResult) {
    expect(sumPayouts(snapshot.lastHandResult)).toBe(snapshot.lastHandResult.potCents);
  }
}

async function settleHandToWaiting(
  room: any,
  clientsByUserId: Record<string, FakeClient | undefined>,
  maxSteps = 36,
): Promise<void> {
  for (let i = 0; i < maxSteps && room.state.street !== "WAITING"; i += 1) {
    const toActUserId = String(room.state.seats?.[room.state.toActSeat] ?? "");
    const actorClient = clientsByUserId[toActUserId];
    const actorSnapshot = actorClient?.latestSnapshot;
    if (actorClient && actorSnapshot?.hand?.handId === room.state.handId && !actorSnapshot.lastHandResult?.handId) {
      const action = { ...pickLegalAction(actorSnapshot), actionId: `settle-${i}-${Date.now()}` };
      room.onMessageEvents.emit("ACTION", actorClient as any, action);
    }
    await delay(120);
  }
  await waitFor(() => room.state.street === "WAITING", 10000, "hand settles to WAITING");
}

async function setupRoomWithHumansAndBots() {
  (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
  (CashierService as any).processCashGameCashOut = async () => ({ success: true });

  const room = new PokerRoom() as any;
  room.setMetadata = async () => {};
  room.roomId = "room_multiplayer_churn_integration";
  room.onCreate({
    tableConfig: {
      tableId: "table_multiplayer_churn_integration",
      name: "Multiplayer Churn Integration",
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

  room.onMessageEvents.emit("ADD_BOT", clientA as any, { botId: "chaos_carl", buyInCents: 5000 });
  room.onMessageEvents.emit("ADD_BOT", clientA as any, { botId: "nash_nate", buyInCents: 5000 });

  await waitFor(() => Boolean(clientA.latestSnapshot?.hand?.handId), 6000, "active hand");
  await waitFor(
    () => (clientA.latestSnapshot?.seats.filter((s) => s.isBot).length ?? 0) >= 2,
    6000,
    "two bots seated",
  );

  return { room, clientA, clientB };
}

async function setupRoomWithHumansOnly() {
  (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
  (CashierService as any).processCashGameCashOut = async () => ({ success: true });

  const room = new PokerRoom() as any;
  room.setMetadata = async () => {};
  room.roomId = "room_multiplayer_churn_integration";
  room.onCreate({
    tableConfig: {
      tableId: "table_multiplayer_churn_integration",
      name: "Multiplayer Churn Integration",
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

  await waitFor(() => Boolean(clientA.latestSnapshot?.hand?.handId), 6000, "active hand");

  return { room, clientA, clientB };
}

function attachDiagnosticDenylistCollector(room: any): { findings: string[]; detach: () => void } {
  const findings: string[] = [];
  if (typeof room.dealer?.addDiagnosticListener !== "function") {
    return { findings, detach: () => {} };
  }
  const detach = room.dealer.addDiagnosticListener(
    (event: DealerDiagnosticEvent) => {
      if (DIAGNOSTIC_DENYLIST.includes(event.type)) {
        findings.push(`${event.type}:${event.code ?? "none"}`);
      }
    },
  );
  return { findings, detach };
}

describe("table multiplayer churn integration", () => {
  const autoActionCapEnv = process.env.AUTO_ACTION_HAND_CAP;
  const persistentSeatsEnv = process.env.FEATURE_PERSISTENT_SEATS;

  afterEach(() => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = CashierService.processCashGameBuyIn;
    (CashierService as any).processCashGameCashOut = CashierService.processCashGameCashOut;
    process.env.AUTO_ACTION_HAND_CAP = autoActionCapEnv;
    process.env.FEATURE_PERSISTENT_SEATS = persistentSeatsEnv;
  });

  it("CHURN-B01/B03: disconnected to-act user auto-actions and reaches abandoned after cap without deadlock", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    process.env.AUTO_ACTION_HAND_CAP = "1";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({ softExpired: [], hardDeletedCount: 0 });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    const markSittingOutSpy = vi.spyOn(TableSeatSessionService, "markSittingOut").mockResolvedValue();

    const { room, clientA, clientB } = await setupRoomWithHumansAndBots();
    const diagnostics = attachDiagnosticDenylistCollector(room);
    try {
      const before = clientA.latestSnapshot!;
      const toActSeat = before.hand!.toActSeat;
      const toActUserId = before.seats.find((s) => s.seat === toActSeat)?.userId;
      expect(toActUserId).toBeTruthy();

      room.dealer.markDisconnected(String(toActUserId), Date.now() + 60_000);
      const connectedUserId = String(toActUserId) === "user_a" ? "user_b" : "user_a";
      const connectedClient = connectedUserId === "user_a" ? clientA : clientB;

      const startHandId = before.hand?.handId ?? "";
      for (let i = 0; i < 16; i += 1) {
        const snap = connectedClient.latestSnapshot;
        if (!snap) break;
        const sameHand = snap.hand?.handId === startHandId;
        if (!sameHand || snap.hand?.street === "WAITING" || snap.lastHandResult?.handId) break;

        const connectedSeat = snap.seats.find((s) => s.userId === connectedUserId)?.seat;
        const canActNow = connectedSeat !== undefined && snap.hand?.toActSeat === connectedSeat;
        if (canActNow) {
          const action = { ...pickLegalAction(snap), actionId: `act-${i}-${Date.now()}` };
          room.onMessageEvents.emit("ACTION", connectedClient as any, action);
        }
        await delay(140);
      }

      await waitFor(
        () => Boolean(clientA.latestSnapshot?.seats.find((s) => s.userId === toActUserId && s.status === "ABANDONED")),
        10000,
        "disconnected user abandoned",
      );

      const seat = clientA.latestSnapshot!.seats.find((s) => s.userId === toActUserId);
      expect(seat?.status).toBe("ABANDONED");
      expect(markSittingOutSpy).toHaveBeenCalled();
      assertSnapshotChurnInvariants(clientA.latestSnapshot!);
      expect(diagnostics.findings).toEqual([]);
    } finally {
      diagnostics.detach();
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
    }
  });

  it("CHURN-B04/B05: bot and human added mid-hand are seated now and dealt in next hand", async () => {
    const { room, clientA, clientB } = await setupRoomWithHumansOnly();
    const diagnostics = attachDiagnosticDenylistCollector(room);
    const clientC = makeClient("sess_c");
    try {
      const handBefore = clientA.latestSnapshot?.hand?.handId;
      expect(handBefore).toBeTruthy();

      await room.onJoin(clientC as any, { buyInCents: 5000 }, { userId: "user_c", username: "charlie" });
      room.onMessageEvents.emit("ADD_BOT", clientA as any, { botId: "tiltie_trent", buyInCents: 5000 });

      await waitFor(
        () => Boolean(clientA.latestSnapshot?.seats.find((s) => s.userId === "user_c")),
        5000,
        "human mid-hand seat visible",
      );
      await waitFor(
        () => (clientA.latestSnapshot?.seats.filter((s) => s.isBot).length ?? 0) >= 1,
        5000,
        "bot mid-hand seat visible",
      );

      const seatC = clientA.latestSnapshot!.seats.find((s) => s.userId === "user_c");
      expect(seatC?.status).toBe("ABANDONED");

      await settleHandToWaiting(room, { user_a: clientA, user_b: clientB, user_c: clientC });
      await room.dealer.forceAdvanceToNextHandForTest();
      await waitFor(
        () => Boolean(clientA.latestSnapshot?.hand?.handId) && clientA.latestSnapshot?.hand?.handId !== handBefore,
        6000,
        "forced next hand start",
      );

      const seatCAfter = clientA.latestSnapshot!.seats.find((s) => s.userId === "user_c");
      expect(seatCAfter?.status).toBe("ACTIVE");
      assertSnapshotChurnInvariants(clientA.latestSnapshot!);
      expect(diagnostics.findings).toEqual([]);
    } finally {
      diagnostics.detach();
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientC as any, 4000);
      } catch {}
    }
  });

  it("CHURN-B02/B06/B07: reconnect path with mixed humans+bots keeps hand progression and payout invariants", async () => {
    const { room, clientA, clientB } = await setupRoomWithHumansAndBots();
    const diagnostics = attachDiagnosticDenylistCollector(room);
    try {
      const reasons: string[] = [];
      const startSeq = clientA.latestSnapshot?.snapshotSeq ?? 0;
      const seenSeq: number[] = [];

      const originalSend = clientA.send;
      clientA.send = (type: string, payload: unknown) => {
        originalSend(type, payload);
        if (type === "TABLE_SNAPSHOT") {
          const snap = payload as TableSnapshotPayload;
          reasons.push(snap.reason);
          seenSeq.push(snap.snapshotSeq);
        }
      };

      const disconnectUserId = "user_a";
      room.dealer.markDisconnected(disconnectUserId, Date.now() + 60_000);
      await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: disconnectUserId, username: "alice" });

      for (let i = 0; i < 28; i += 1) {
        const snapA = clientA.latestSnapshot;
        const snapB = clientB.latestSnapshot;
        const toActUserIdA = snapA?.hand ? snapA.seats.find((s) => s.seat === snapA.hand?.toActSeat)?.userId : undefined;
        const actor = toActUserIdA === "user_b" ? clientB : clientA;
        const actorSnap = actor.latestSnapshot;
        if (!actorSnap?.hand?.handId) break;

        const action = { ...pickLegalAction(actorSnap), actionId: `prog-${i}-${Date.now()}` };
        room.onMessageEvents.emit("ACTION", actor as any, action);

        if (snapA?.lastHandResult?.handId || snapB?.lastHandResult?.handId) break;
        await delay(120);
      }

      await waitFor(
        () => Boolean(clientA.latestSnapshot?.lastHandResult?.handId) || Boolean(clientB.latestSnapshot?.lastHandResult?.handId),
        12000,
        "hand reaches terminal result",
      );

      const final = clientA.latestSnapshot!;
      assertSnapshotChurnInvariants(final);
      expect(final.snapshotSeq).toBeGreaterThan(startSeq);

      for (let i = 1; i < seenSeq.length; i += 1) {
        expect(seenSeq[i]!).toBeGreaterThan(seenSeq[i - 1]!);
      }
      expect(reasons.includes("HAND_END") || reasons.includes("HAND_SHOWDOWN")).toBe(true);
      expect(diagnostics.findings).toEqual([]);
    } finally {
      diagnostics.detach();
      try {
        await room.onLeave(clientA as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
    }
  });
});
