import { afterEach, describe, expect, it, vi } from "vitest";
import { CashierService } from "../../../economy/CashierService.js";
import { PokerRoom } from "../../../../rooms/PokerRoom.js";
import { snapshotMetrics } from "../snapshotMetrics.js";

vi.setConfig({ testTimeout: 15000 });

type FakeClient = {
  sessionId: string;
  leave: () => void;
  send: (type: string, payload: unknown) => void;
};

function makeClient(sessionId: string): FakeClient {
  return {
    sessionId,
    leave: () => {},
    send: () => {},
  };
}

describe("snapshotMetrics load simulation", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  afterEach(() => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
  });

  it("equityRefreshes ≪ snapshotsEmitted under repeated emits with same hand state", async () => {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = "room_metrics_load";
    room.onCreate({
      tableConfig: {
        tableId: "table_metrics_load",
        name: "Metrics Load Test",
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

    await new Promise((r) => setTimeout(r, 500));
    expect(room.dealer).toBeDefined();
    const snapshotService = (room.dealer as any).snapshotService;
    expect(snapshotService).toBeDefined();

    snapshotMetrics.reset();
    const emitCount = 50;

    for (let i = 0; i < emitCount; i++) {
      snapshotService.emitToAll("ACTION_ACCEPTED");
    }

    expect(snapshotMetrics.snapshotsEmitted).toBe(emitCount * 2);
    expect(snapshotMetrics.equityRefreshes).toBeLessThan(snapshotMetrics.snapshotsEmitted);
    expect(snapshotMetrics.equityRefreshes).toBeLessThanOrEqual(emitCount);
  });
});
