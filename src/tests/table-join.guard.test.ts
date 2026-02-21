import { describe, it, expect, vi, afterEach } from "vitest";
import { PokerRoom } from "../rooms/PokerRoom.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { Dealer } from "../engine/Dealer.js";

type FakeClient = {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
};

function makeClient(sessionId: string): FakeClient {
  return {
    sessionId,
    send: vi.fn(),
    leave: vi.fn(),
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await delay(20);
  }
}

describe("table join guardrails", () => {
  const persistentSeatsEnv = process.env.FEATURE_PERSISTENT_SEATS;
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.FEATURE_PERSISTENT_SEATS = persistentSeatsEnv;
  });

  function buildRoomWithDealerStub() {
    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_join_guard";
    room.onCreate({
      tableConfig: {
        tableId: "table_join_guard",
        name: "Join Guard Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const dealer = {
      hasPlayer: vi.fn().mockReturnValue(false),
      bindClient: vi.fn(),
      markReconnected: vi.fn(),
      restorePlayerFromSession: vi.fn().mockResolvedValue(undefined),
      addPlayer: vi.fn().mockResolvedValue(undefined),
      emitSnapshotToUser: vi.fn(),
      handleAction: vi.fn().mockResolvedValue(undefined),
    };
    room.dealer = dealer;
    return { room, dealer };
  }

  it("sets blinds on room from tableConfig when creating table", () => {
    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_blinds";
    room.onCreate({
      tableConfig: {
        tableId: "table_blinds",
        name: "Blinds Check",
        maxSeats: 6,
        smallBlindCents: 75,
        bigBlindCents: 150,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    expect(room.state.smallBlindCents).toBe(75);
    expect(room.state.bigBlindCents).toBe(150);
  });

  it("joins table when buyInCents is provided", async () => {
    const client = makeClient("join_ok");
    const { room, dealer } = buildRoomWithDealerStub();

    await room.onJoin(
      client as any,
      { buyInCents: 5000 },
      { userId: "user_ok", username: "alice" },
    );

    expect(dealer.addPlayer).toHaveBeenCalledWith("user_ok", "alice", 5000);
    expect(client.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({
        version: 1,
        roomId: "room_join_guard",
        playerId: "user_ok",
        tableId: "table_join_guard",
        joinMode: "NEW",
      }),
    );
  });

  it("treats LEFT seat-session as non-rejoin and uses normal buy-in path", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();

    const client = makeClient("join_left_session");
    const { room, dealer } = buildRoomWithDealerStub();

    await room.onJoin(
      client as any,
      { buyInCents: 5000 },
      { userId: "user_left", username: "lefty" },
    );

    expect(dealer.addPlayer).toHaveBeenCalledWith("user_left", "lefty", 5000);
    expect(client.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({
        version: 1,
        playerId: "user_left",
        joinMode: "NEW",
      }),
    );
  });

  it("rejects join when buyInCents is missing", async () => {
    const client = makeClient("join_missing_buyin");
    const { room, dealer } = buildRoomWithDealerStub();

    await room.onJoin(
      client as any,
      {} as any,
      { userId: "user_fail", username: "bob" },
    );

    expect(dealer.addPlayer).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({
        version: 1,
        code: "MISSING_BUY_IN_CENTS",
      }),
    );
    expect(client.leave).toHaveBeenCalled();
  });

  it("table → lobby → table: only one live session, old session gets SESSION_REPLACED and does not reconnect", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_rejoin";
    room.onCreate({
      tableConfig: {
        tableId: "table_rejoin",
        name: "Rejoin Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const client1 = makeClient("session_table_first");
    const client2 = makeClient("session_table_second");

    await room.onJoin(
      client1 as any,
      { buyInCents: 5000 },
      { userId: "user_same", username: "alice" },
    );
    expect(client1.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({ roomId: "room_rejoin", playerId: "user_same", joinMode: "NEW" }),
    );
    expect(client1.leave).not.toHaveBeenCalled();

    await room.onJoin(
      client2 as any,
      { buyInCents: 5000 },
      { userId: "user_same", username: "alice" },
    );
    expect(client1.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({ code: "SESSION_REPLACED", message: "Session replaced by a newer connection." }),
    );
    expect(client1.leave).toHaveBeenCalledWith(4000);
    expect(client2.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({ userId: "user_same", joinMode: "RESTORE" }),
    );
    expect(client2.leave).not.toHaveBeenCalled();

    const boundClient = room.dealer.getClient("user_same");
    expect(boundClient).toBe(client2);
    expect(boundClient).not.toBe(client1);
  });

  it("restores persisted seat session without requiring buyInCents", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    const findSpy = vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue({
      tableId: "table_join_guard",
      userId: "user_rejoin",
      seat: 2,
      stackCentsSnapshot: 4900,
      buyInCents: 5000,
      state: "SEATED_SITTING_OUT",
    });
    const touchSpy = vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();

    const client = makeClient("join_rejoin");
    const { room, dealer } = buildRoomWithDealerStub();

    await room.onJoin(client as any, {} as any, { userId: "user_rejoin", username: "charlie" });

    expect(findSpy).toHaveBeenCalledWith({ tableId: "table_join_guard", userId: "user_rejoin" });
    expect(dealer.restorePlayerFromSession).toHaveBeenCalledWith("user_rejoin", "charlie", 2, 4900);
    expect(dealer.addPlayer).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({
        version: 1,
        userId: "user_rejoin",
        joinMode: "RESTORE",
      }),
    );
    expect(touchSpy).toHaveBeenCalled();
  });

  it("handles repeated joins idempotently for same table/user", async () => {
    const clientA = makeClient("join_repeat_a");
    const clientB = makeClient("join_repeat_b");
    const { room, dealer } = buildRoomWithDealerStub();

    dealer.hasPlayer.mockReturnValue(false);

    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: "user_repeat", username: "dana" });
    dealer.hasPlayer.mockReturnValue(true);
    await room.onJoin(clientB as any, {} as any, { userId: "user_repeat", username: "dana" });

    expect(dealer.addPlayer).toHaveBeenCalledTimes(1);
    expect(clientB.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({
        version: 1,
        userId: "user_repeat",
        joinMode: "RESTORE",
      }),
    );
  });

  it("runs soft TTL cleanup and releases disconnected in-memory seat", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    const reapSpy = vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [
        {
          id: "ssn_1",
          tableId: "table_join_guard",
          userId: "user_expired",
          seat: 1,
          stackCentsSnapshot: 3000,
          state: "SEATED_SITTING_OUT",
          disconnectAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
        },
      ],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();

    const client = makeClient("join_cleanup");
    const { room, dealer } = buildRoomWithDealerStub();
    dealer.removePlayer = vi.fn().mockResolvedValue(undefined);
    dealer.hasPlayer.mockImplementation((id: string) => id === "user_expired");

    await room.onJoin(
      client as any,
      { buyInCents: 5000 },
      { userId: "user_ok", username: "alice" },
    );

    expect(reapSpy).toHaveBeenCalled();
    expect(dealer.removePlayer).toHaveBeenCalledWith("user_expired");
  });

  it("runs soft TTL cleanup and force-cashouts non-present player", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [
        {
          id: "ssn_2",
          tableId: "table_join_guard",
          userId: "user_stale",
          seat: 3,
          stackCentsSnapshot: 2400,
          state: "SEATED_SITTING_OUT",
          disconnectAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
        },
      ],
      hardDeletedCount: 1,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    const cashOutSpy = vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });

    const client = makeClient("join_cashout_cleanup");
    const { room, dealer } = buildRoomWithDealerStub();
    dealer.hasPlayer.mockReturnValue(false);

    await room.onJoin(
      client as any,
      { buyInCents: 5000 },
      { userId: "user_ok", username: "alice" },
    );

    expect(cashOutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_stale",
        tableId: "table_join_guard",
        amountCents: 2400,
      }),
    );
  });

  it("bootstraps compatible persisted seats as disconnected and allows session restore join", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([
      {
        id: "ssn_restore_1",
        tableId: "table_join_guard",
        userId: "user_boot",
        seat: 0,
        stackCentsSnapshot: 4200,
        buyInCents: 5000,
        state: "SEATED_ACTIVE",
        handIdSnapshot: null,
        schemaVersion: 1,
        disconnectAt: null,
        lastSeenAt: new Date(),
      },
    ]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    const restoreSpy = vi.spyOn(Dealer.prototype, "restorePlayerFromSession");

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_join_guard";
    room.onCreate({
      tableConfig: {
        tableId: "table_join_guard",
        name: "Join Guard Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    await waitFor(() => restoreSpy.mock.calls.length > 0, 2000, "boot seat restore");
    expect(restoreSpy).toHaveBeenCalledWith(
      "user_boot",
      expect.any(String),
      0,
      4200,
      { connected: false, sittingOut: true },
    );

    const client = makeClient("join_boot_restore");
    await room.onJoin(client as any, {} as any, { userId: "user_boot", username: "eve" });
    expect(client.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({
        version: 1,
        userId: "user_boot",
        joinMode: "RESTORE",
      }),
    );
  });

  it("force-cashouts and marks LEFT on bootstrap version mismatch", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([
      {
        id: "ssn_restore_mismatch",
        tableId: "table_join_guard",
        userId: "user_mismatch",
        seat: 1,
        stackCentsSnapshot: 3100,
        buyInCents: 5000,
        state: "SEATED_SITTING_OUT",
        handIdSnapshot: null,
        schemaVersion: 99,
        disconnectAt: new Date(),
        lastSeenAt: new Date(),
      },
    ]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    const cashOutSpy = vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_join_guard";
    room.onCreate({
      tableConfig: {
        tableId: "table_join_guard",
        name: "Join Guard Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    await waitFor(() => cashOutSpy.mock.calls.length > 0, 2000, "mismatch cashout");
    expect(cashOutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_mismatch",
        tableId: "table_join_guard",
        amountCents: 3100,
      }),
    );
    expect(markLeftSpy).toHaveBeenCalledWith({ id: "ssn_restore_mismatch" });
  });
});
