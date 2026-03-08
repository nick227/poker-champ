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
      await waitFor(() => {
        const snap = clientA.latestSnapshot;
        if (!snap?.hand) return false;
        const toActSeat = snap.hand.toActSeat;
        const toAct = snap.seats.find((s) => s.seat === toActSeat);
        return Boolean(toAct && !toAct.isBot && (toAct.userId === "user_a" || toAct.userId === "user_b"));
      }, 8000, "human to-act seat");

      const before = clientA.latestSnapshot!;
      const toActSeat = before.hand!.toActSeat;
      const toAct = before.seats.find((s) => s.seat === toActSeat);
      expect(toAct && !toAct.isBot).toBeTruthy();
      const toActUserId = toAct?.userId;
      expect(toActUserId === "user_a" || toActUserId === "user_b").toBe(true);

      if (typeof room.dealer.markDisconnectedSerialized === "function") {
        await room.dealer.markDisconnectedSerialized(String(toActUserId), Date.now() - 1);
      } else {
        room.dealer.markDisconnected(String(toActUserId), Date.now() - 1);
      }
      const connectedUserId = toActUserId === "user_a" ? "user_b" : "user_a";
      await waitFor(
        () => Boolean((room.dealer as any).currentHandAutoActedUserIds?.has?.(String(toActUserId))),
        5000,
        "disconnected user auto-acted this hand",
      );

      await (room.dealer as any).applyDisconnectedAutoActionCapForHand();

      await waitFor(
        () => room.state.playersById.get(String(toActUserId))?.status === "ABANDONED",
        5000,
        "disconnected user abandoned",
      );

      const seatStatus = room.state.playersById.get(String(toActUserId))?.status;
      expect(seatStatus).toBe("ABANDONED");
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

  it(
    "CHURN-SOFT-RESTORE-MIDHAND: hero soft-exits/restores mid-hand while other human continues; no hang, auto-action, clean bind, stable bots",
    { timeout: 45000 },
    async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({ softExpired: [], hardDeletedCount: 0 });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    const markSittingOutSpy = vi.spyOn(TableSeatSessionService, "markSittingOut").mockResolvedValue();

    const { room, clientA, clientB } = await setupRoomWithHumansAndBots();
    const diagnostics = attachDiagnosticDenylistCollector(room);
    const heroUserId = "user_a";
    const heroRestoreClient = makeClient("sess_a_restore_midhand");
    try {
      const before = clientA.latestSnapshot!;
      const handIdBefore = before.hand?.handId ?? "";
      const botIdsBefore = before.seats.filter((s) => s.isBot && s.userId).map((s) => String(s.userId)).sort();
      const seqBefore = before.snapshotSeq;

      // Soft exit (non-consented) while hand is active.
      const leavePromise = room.onLeave(clientA as any, 1001);
      const snapshotsBeforeLeave = clientB.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      // Keep gameplay moving from the connected human while hero is away.
      for (let i = 0; i < 4; i += 1) {
        const snap = clientB.latestSnapshot;
        if (!snap?.hand?.handId || snap.hand.handId !== handIdBefore || snap.lastHandResult?.handId) break;
        const toActUserId = snap.seats.find((s) => s.seat === snap.hand?.toActSeat)?.userId;
        if (toActUserId === "user_b") {
          const action = { ...pickLegalAction(snap), actionId: `soft-midhand-play-${i}-${Date.now()}` };
          room.onMessageEvents.emit("ACTION", clientB as any, action);
        }
        await delay(120);
      }

      // Auto-check/fold should trigger while hero is disconnected.
      await waitFor(
        () => {
          const snaps = ((clientB.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[]).slice(snapshotsBeforeLeave);
          return snaps.some((s) => s.lastAction?.origin === "AUTO" && s.lastAction?.actorUserId === heroUserId);
        },
        10000,
        "auto action while hero disconnected",
      );
      expect(markSittingOutSpy).toHaveBeenCalled();

      // Immediate restore while the table is still progressing.
      await room.onJoin(heroRestoreClient as any, { buyInCents: 5000 }, { userId: heroUserId, username: "alice" });
      await Promise.race([leavePromise, delay(2500)]);

      expect(heroRestoreClient.sentByType.SESSION_RESTORED?.length ?? 0).toBeGreaterThan(0);
      expect(room.dealer.getClient(heroUserId)).toBe(heroRestoreClient as any);

      // No hang: stream progresses and either current hand ends or hand/seq advances.
      await waitFor(
        () => {
          const latest = heroRestoreClient.latestSnapshot;
          if (!latest) return false;
          const progressed = latest.snapshotSeq > seqBefore;
          const handAdvanced =
            Boolean(latest.lastHandResult?.handId) ||
            (latest.hand?.handId ?? "") !== handIdBefore ||
            (latest.hand?.actionCount ?? 0) > (before.hand?.actionCount ?? 0);
          return progressed && handAdvanced;
        },
        12000,
        "post-restore progression without hang",
      );

      const after = heroRestoreClient.latestSnapshot!;
      const botIdsAfter = after.seats.filter((s) => s.isBot && s.userId).map((s) => String(s.userId)).sort();
      expect(botIdsAfter).toEqual(botIdsBefore);
      assertSnapshotChurnInvariants(after);
      expect(diagnostics.findings).toEqual([]);
    } finally {
      diagnostics.detach();
      try {
        await room.onLeave(heroRestoreClient as any, 4000);
      } catch {}
      try {
        await room.onLeave(clientB as any, 4000);
      } catch {}
    }
  });

  it("CHURN-DELETE-RACE: grace-window disconnect + delete + reconnect attempt returns TABLE_GONE and clears bots/sessions", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({ softExpired: [], hardDeletedCount: 0 });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    const markSittingOutSpy = vi.spyOn(TableSeatSessionService, "markSittingOut").mockResolvedValue();
    const markAllLeftSpy = vi.spyOn(TableSeatSessionService, "markAllLeftForTable").mockResolvedValue();

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_delete_race";
    room.onCreate({
      tableConfig: {
        tableId: "table_delete_race",
        name: "Delete Race Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const clientA = makeClient("sess_delete_a");
    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    room.onMessageEvents.emit("ADD_BOT", clientA as any, { botId: "chaos_carl", buyInCents: 5000 });
    await waitFor(
      () => (clientA.latestSnapshot?.seats.filter((s) => s.isBot).length ?? 0) >= 1,
      6000,
      "bot seated before delete race",
    );

    // Simulate active grace window: disconnected but not abandoned.
    room.dealer.unbindClient("user_a");
    room.dealer.markDisconnected("user_a", Date.now() + 60_000);
    await TableSeatSessionService.markSittingOut({
      tableId: room.state.tableId,
      userId: "user_a",
      stackCentsSnapshot: room.state.playersById.get("user_a")?.stackCents ?? 0,
      handIdSnapshot: room.state.handId || undefined,
    });
    await delay(50);
    room.updateMetadataCounts();
    expect(markSittingOutSpy).toHaveBeenCalled();
    // Lobby presence count should reflect active bindings, not seated participants.
    expect(room.computeConnectedHumanCount()).toBe(0);

    // Creator delete sequence: lock, session cleanup, disconnect.
    const lock = room.beginDeleteIfNoConnectedHumans();
    expect(lock.ok).toBe(true);
    await TableSeatSessionService.markAllLeftForTable({ tableId: room.state.tableId });
    const disconnectSpy = vi.spyOn(room, "disconnect").mockImplementation(() => {});
    await room.requestDisconnect();

    // Reconnect attempt during delete must be rejected with TABLE_GONE.
    const reconnectClient = makeClient("sess_delete_reconnect");
    await room.onJoin(reconnectClient as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    const errorMessages = reconnectClient.sentByType.ERROR ?? [];
    expect(errorMessages.length).toBeGreaterThan(0);
    expect(errorMessages).toContainEqual(
      expect.objectContaining({
        version: 1,
        code: "TABLE_GONE",
      }),
    );

    expect(markAllLeftSpy).toHaveBeenCalledWith({ tableId: "table_delete_race" });
    expect(disconnectSpy).toHaveBeenCalled();
    expect([...room.state.playersById.values()].filter((p: any) => p.kind === "BOT")).toHaveLength(0);
    expect(room.computeConnectedHumanCount()).toBe(0);
  });
});
