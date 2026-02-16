import { afterEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "../rooms/PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { TableSnapshotLogService } from "../engine/persistence/TableSnapshotLogService.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

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

  it("rejects out-of-turn action with NOT_YOUR_TURN", async () => {
    const { room, clientA, clientB } = await setupTwoPlayerRoom();
    try {
      const toActSeat = clientA.latestSnapshot!.hand!.toActSeat;
      const toActUserId = clientA.latestSnapshot!.seats.find((s) => s.seat === toActSeat)?.userId;
      const wrongClient = toActUserId === "user_a" ? clientB : clientA;

      room.onMessageEvents.emit("ACTION", wrongClient as any, { action: "FOLD" });
      await waitFor(() => (wrongClient.sentByType.ERROR?.length ?? 0) > 0, 2000, "error message");

      const lastError = (wrongClient.sentByType.ERROR ?? []).at(-1) as any;
      expect(lastError.code).toBe("NOT_YOUR_TURN");
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
      const action = pickLegalAction(actor.latestSnapshot!);

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

      const progressed =
        afterA.hand?.handId !== beforeA.hand?.handId ||
        (afterA.hand?.actionCount ?? 0) > (beforeA.hand?.actionCount ?? 0) ||
        Boolean(afterA.lastHandResult?.handId);
      expect(progressed).toBe(true);
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

      const afterDisconnectCountA = clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0;
      const beforeHandId = before.hand?.handId ?? "";

      await waitFor(
        () =>
          (clientA.sentByType.TABLE_SNAPSHOT?.length ?? 0) > afterDisconnectCountA ||
          Boolean(clientA.latestSnapshot?.lastHandResult?.handId) ||
          (clientA.latestSnapshot?.hand?.handId ?? "") !== beforeHandId ||
          (clientA.latestSnapshot?.hand?.actionCount ?? 0) !== beforeActionCount,
        4000,
        "auto-action progression",
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

      await waitFor(
        () =>
          Boolean(clientA.latestSnapshot?.lastHandResult?.handId) ||
          (clientA.latestSnapshot?.hand?.handId ?? "") !== (before.hand?.handId ?? ""),
        5000,
        "hand resolution after auto-action",
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
});
