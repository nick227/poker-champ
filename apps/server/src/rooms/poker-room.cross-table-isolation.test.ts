import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { PokerRoom } from "./PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { awardService } from "../awards/index.js";

vi.setConfig({ testTimeout: 20_000 });

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

function latestLastHandResultSnapshot(client: FakeClient): TableSnapshotPayload | undefined {
  const snapshots = (client.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[];
  return [...snapshots].reverse().find((snapshot) => Boolean(snapshot.lastHandResult?.handId));
}

async function setupTwoPlayerRoom(options: {
  suffix: string;
  withTimeouts?: boolean;
  firstUserId: string;
  secondUserId: string;
}) {
  (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
  (CashierService as any).processCashGameCashOut = async () => ({ success: true });

  const room = new PokerRoom() as any;
  room.setMetadata = async () => {};
  room.roomId = `room_cross_table_${options.suffix}`;
  room.onCreate({
    tableConfig: {
      tableId: `table_cross_table_${options.suffix}`,
      name: `Cross Table ${options.suffix}`,
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      visibility: "PUBLIC",
      createdAt: Date.now(),
    },
  });

  if (!options.withTimeouts) {
    (room.dealer as { scheduleHumanTurnTimeout?: (userId: string) => void }).scheduleHumanTurnTimeout = () => {};
  }

  const clientA = makeClient(`sess_${options.suffix}_a`);
  const clientB = makeClient(`sess_${options.suffix}_b`);

  await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: options.firstUserId, username: options.firstUserId });
  await room.onJoin(clientB as any, { buyInCents: 5000 }, { userId: options.secondUserId, username: options.secondUserId });

  await waitFor(() => Boolean(clientA.latestSnapshot) && Boolean(clientB.latestSnapshot), 4_000, `${options.suffix}: initial snapshots`);
  await waitFor(
    () => Boolean(clientA.latestSnapshot?.hand?.handId) && Boolean(clientB.latestSnapshot?.hand?.handId),
    4_000,
    `${options.suffix}: active hand`,
  );

  return { room, clientA, clientB };
}

describe("poker room cross-table isolation", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;
  const snapshotLogEnv = process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE;

  afterEach(() => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = snapshotLogEnv;
  });

  it("room dispose clears only its own armed human timeout and does not affect other rooms", async () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "false";
    vi.spyOn(awardService, "processHandEndAwards").mockResolvedValue();

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

    const roomAContext = await setupTwoPlayerRoom({
      suffix: "timer_a",
      withTimeouts: true,
      firstUserId: "timer_a_1",
      secondUserId: "timer_a_2",
    });
    const roomBContext = await setupTwoPlayerRoom({
      suffix: "timer_b",
      withTimeouts: true,
      firstUserId: "timer_b_1",
      secondUserId: "timer_b_2",
    });

    try {
      await waitFor(
        () => capturedTimeouts.size >= 2 && Number(roomAContext.room.state.turnDeadlineMs ?? 0) > 0 && Number(roomBContext.room.state.turnDeadlineMs ?? 0) > 0,
        4_000,
        "two room-scoped human timeouts armed",
      );

      const entries = [...capturedTimeouts.entries()];
      const roomATimeout = entries[0];
      expect(roomATimeout).toBeTruthy();
      if (!roomATimeout) return;

      const [roomAHandle, roomAStaleCallback] = roomATimeout;
      const roomBStateBefore = {
        handId: String(roomBContext.room.state.handId ?? ""),
        toActSeat: Number(roomBContext.room.state.toActSeat ?? -1),
        turnDeadlineMs: Number(roomBContext.room.state.turnDeadlineMs ?? 0),
      };

      roomAContext.room.onDispose();

      expect(capturedTimeouts.has(roomAHandle)).toBe(false);

      roomAStaleCallback();
      await delay(50);

      expect(String(roomBContext.room.state.handId ?? "")).toBe(roomBStateBefore.handId);
      expect(Number(roomBContext.room.state.toActSeat ?? -1)).toBe(roomBStateBefore.toActSeat);
      expect(Number(roomBContext.room.state.turnDeadlineMs ?? 0)).toBe(roomBStateBefore.turnDeadlineMs);
      expect(Number(roomBContext.room.state.turnDeadlineMs ?? 0)).toBeGreaterThan(0);
    } finally {
      roomBContext.room.onDispose();
      vi.restoreAllMocks();
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    }
  });

  it("keeps lastHandResult scoped to the room that completed the hand", async () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "false";
    vi.spyOn(awardService, "processHandEndAwards").mockResolvedValue();

    const roomAContext = await setupTwoPlayerRoom({
      suffix: "result_a",
      firstUserId: "result_a_1",
      secondUserId: "result_a_2",
    });
    const roomBContext = await setupTwoPlayerRoom({
      suffix: "result_b",
      firstUserId: "result_b_1",
      secondUserId: "result_b_2",
    });

    try {
      const roomAActorUserId = String(roomAContext.room.state.seats[roomAContext.room.state.toActSeat] ?? "");
      const roomBActorUserId = String(roomBContext.room.state.seats[roomBContext.room.state.toActSeat] ?? "");
      expect(roomAActorUserId).toBe("result_a_2");
      expect(roomBActorUserId).toBe("result_b_2");

      await roomAContext.room.dealer.handleAction(roomAActorUserId, { action: "FOLD" }, `cross-result-a-${Date.now()}`);
      await roomBContext.room.dealer.handleAction(roomBActorUserId, { action: "FOLD" }, `cross-result-b-${Date.now()}`);

      await waitFor(
        () =>
          latestLastHandResultSnapshot(roomAContext.clientA)?.lastHandResult?.winnerId === "result_a_1" &&
          latestLastHandResultSnapshot(roomBContext.clientA)?.lastHandResult?.winnerId === "result_b_1",
        4_000,
        "room-scoped lastHandResult snapshots",
      );

      const roomAResult = latestLastHandResultSnapshot(roomAContext.clientA)?.lastHandResult;
      const roomBResult = latestLastHandResultSnapshot(roomBContext.clientA)?.lastHandResult;

      expect(roomAResult?.winnerId).toBe("result_a_1");
      expect(roomBResult?.winnerId).toBe("result_b_1");
      expect(roomAResult?.winnerId).not.toBe(roomBResult?.winnerId);
      expect(roomAResult?.handId).not.toBe(roomBResult?.handId);
    } finally {
      roomAContext.room.onDispose();
      roomBContext.room.onDispose();
    }
  });

  it("accepting an action in one room does not advance handActionSeq in another room", async () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "false";
    vi.spyOn(awardService, "processHandEndAwards").mockResolvedValue();

    const roomAContext = await setupTwoPlayerRoom({
      suffix: "action_a",
      firstUserId: "action_a_1",
      secondUserId: "action_a_2",
    });
    const roomBContext = await setupTwoPlayerRoom({
      suffix: "action_b",
      firstUserId: "action_b_1",
      secondUserId: "action_b_2",
    });

    try {
      const roomAActorUserId = String(roomAContext.room.state.seats[roomAContext.room.state.toActSeat] ?? "");
      const roomBStateBefore = {
        handId: String(roomBContext.room.state.handId ?? ""),
        handActionSeq: Number(roomBContext.room.state.handActionSeq ?? 0),
      };

      await roomAContext.room.dealer.handleAction(roomAActorUserId, { action: "FOLD" }, `cross-action-a-${Date.now()}`);
      await waitFor(
        () =>
          String(roomAContext.room.state.handId ?? "") !== roomBStateBefore.handId ||
          Number(roomAContext.room.state.handActionSeq ?? 0) > 0 ||
          roomAContext.clientA.latestSnapshot?.lastHandResult?.handId != null,
        4_000,
        "room A action progression",
      );

      expect(String(roomBContext.room.state.handId ?? "")).toBe(roomBStateBefore.handId);
      expect(Number(roomBContext.room.state.handActionSeq ?? 0)).toBe(roomBStateBefore.handActionSeq);
    } finally {
      roomAContext.room.onDispose();
      roomBContext.room.onDispose();
    }
  });
});
