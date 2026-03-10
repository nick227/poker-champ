import { describe, it, expect, vi, afterEach } from "vitest";
import { CloseCode } from "@colyseus/core";
import { PokerRoom } from "./PokerRoom.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { Dealer } from "../engine/Dealer.js";
import { PlayerState } from "../state/PlayerState.js";

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
      getClient: vi.fn(),
      markReconnected: vi.fn(),
      restorePlayerFromSession: vi.fn().mockResolvedValue(undefined),
      addPlayer: vi.fn().mockResolvedValue(undefined),
      removePlayer: vi.fn().mockResolvedValue(undefined),
      emitSnapshotToUser: vi.fn(),
      handleAction: vi.fn().mockResolvedValue(undefined),
    };
    room.dealer = dealer;
    return { room, dealer };
  }

  function buildRoomWithRealDealer(tableId: string, roomId: string) {
    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = roomId;
    room.onCreate({
      tableConfig: {
        tableId,
        name: "Rejoin Guard Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    return room;
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
    expect(client1.leave).toHaveBeenCalledWith(4001);
    expect(client2.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({ userId: "user_same", joinMode: "RESTORE" }),
    );
    expect(client2.leave).not.toHaveBeenCalled();

    const boundClient = room.dealer.getClient("user_same");
    expect(boundClient).toBe(client2);
    expect(boundClient).not.toBe(client1);
  });

  it("ignores stale consented close after restore and keeps restored seat/stack", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_stale_close_restore";
    room.onCreate({
      tableConfig: {
        tableId: "table_stale_close_restore",
        name: "Stale Close Restore",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const client1 = makeClient("session_stale_close_1");
    const client2 = makeClient("session_stale_close_2");

    await room.onJoin(client1 as any, { buyInCents: 5000 }, { userId: "user_stale_close", username: "alice" });
    const stackBefore = room.state.playersById.get("user_stale_close")?.stackCents;

    await room.onJoin(client2 as any, { buyInCents: 5000 }, { userId: "user_stale_close", username: "alice" });
    await room.onLeave(client1 as any, CloseCode.CONSENTED);

    expect(markLeftSpy).not.toHaveBeenCalled();
    expect(room.dealer.getClient("user_stale_close")).toBe(client2);
    expect(room.state.playersById.get("user_stale_close")?.stackCents).toBe(stackBefore);
  });

  it("hard leave marks LEFT and blocks restore until a fresh NEW join", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_hard_leave_blocks_restore";
    room.onCreate({
      tableConfig: {
        tableId: "table_hard_leave_blocks_restore",
        name: "Hard Leave Blocks Restore",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const client1 = makeClient("session_hard_leave_1");
    await room.onJoin(client1 as any, { buyInCents: 5000 }, { userId: "user_hard_leave", username: "bob" });

    await room.onLeave(client1 as any, CloseCode.CONSENTED);
    expect(markLeftSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: "table_hard_leave_blocks_restore", userId: "user_hard_leave" }),
    );
    expect(room.state.playersById.has("user_hard_leave")).toBe(false);

    const noBuyInClient = makeClient("session_hard_leave_2");
    await room.onJoin(noBuyInClient as any, {} as any, { userId: "user_hard_leave", username: "bob" });
    expect(noBuyInClient.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({ code: "MISSING_BUY_IN_CENTS" }),
    );

    const freshJoinClient = makeClient("session_hard_leave_3");
    await room.onJoin(freshJoinClient as any, { buyInCents: 5000 }, { userId: "user_hard_leave", username: "bob" });
    expect(freshJoinClient.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({ playerId: "user_hard_leave", joinMode: "NEW" }),
    );
  });

  it("churn loop: repeated soft exit and immediate restore keeps seat/stack and never flips to NEW", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markSittingOut").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_soft_churn_restore";
    room.onCreate({
      tableConfig: {
        tableId: "table_soft_churn_restore",
        name: "Soft Churn Restore",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const userId = "user_soft_churn";
    const username = "alice";
    const firstClient = makeClient("session_soft_churn_0");
    await room.onJoin(firstClient as any, { buyInCents: 5000 }, { userId, username });
    expect(firstClient.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({ playerId: userId, joinMode: "NEW" }),
    );

    const initialSeat = room.state.playersById.get(userId)?.seat;
    const initialStack = room.state.playersById.get(userId)?.stackCents;
    const initialBotIds = [...room.state.playersById.values()]
      .filter((p: any) => p.kind === "BOT")
      .map((p: any) => p.id)
      .sort();

    let activeClient = firstClient;
    const iterations = 25;
    for (let i = 1; i <= iterations; i += 1) {
      const reconnectClient = makeClient(`session_soft_churn_${i}`);
      const leavePromise = room.onLeave(activeClient as any, 1001);
      await room.onJoin(reconnectClient as any, { buyInCents: 5000 }, { userId, username });
      await leavePromise;

      expect(reconnectClient.send).toHaveBeenCalledWith(
        "SESSION_RESTORED",
        expect.objectContaining({ userId, joinMode: "RESTORE" }),
      );
      expect(reconnectClient.send).not.toHaveBeenCalledWith(
        "WELCOME",
        expect.objectContaining({ playerId: userId }),
      );
      expect(room.state.playersById.get(userId)?.seat).toBe(initialSeat);
      expect(room.state.playersById.get(userId)?.stackCents).toBe(initialStack);
      const botIds = [...room.state.playersById.values()]
        .filter((p: any) => p.kind === "BOT")
        .map((p: any) => p.id)
        .sort();
      expect(botIds).toEqual(initialBotIds);

      activeClient = reconnectClient;
    }
  });

  it("soft exit and restore does not leave player stuck sitting out", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue(null);
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markSittingOut").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });

    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_soft_restore_not_sitout";
    room.onCreate({
      tableConfig: {
        tableId: "table_soft_restore_not_sitout",
        name: "Soft Restore Not Sitout",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const userId = "user_restore_not_sitout";
    const c1 = makeClient("session_restore_not_sitout_1");
    await room.onJoin(c1 as any, { buyInCents: 5000 }, { userId, username: "alice" });

    const leavePromise = room.onLeave(c1 as any, 1001);
    const c2 = makeClient("session_restore_not_sitout_2");
    await room.onJoin(c2 as any, { buyInCents: 5000 }, { userId, username: "alice" });
    await leavePromise;

    expect(c2.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({ userId, joinMode: "RESTORE" }),
    );
    const player = room.state.playersById.get(userId);
    expect(player).toBeTruthy();
    expect(player.sittingOutUntilNextHand).toBe(false);
    expect(player.connected).toBe(true);
    expect(player.status).toBe("ACTIVE");
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

  it("applies join buy-in override for in-room zero-stack player instead of restoring with zero", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    const buyInSpy = vi.spyOn(CashierService, "processCashGameBuyIn");
    buyInSpy.mockResolvedValue({ success: true, newTableBalance: 5000 });

    const room = buildRoomWithRealDealer("table_join_buyin_override", "room_join_buyin_override");
    const client1 = makeClient("session_join_override_1");
    const userId = "user_join_override";

    await room.onJoin(client1 as any, { buyInCents: 5000 }, { userId, username: "alice" });
    const p1 = room.state.playersById.get(userId);
    expect(p1).toBeTruthy();
    p1.stackCents = 0;
    p1.status = "OUT";
    p1.sittingOutUntilNextHand = true;

    const client2 = makeClient("session_join_override_2");
    await room.onJoin(client2 as any, { buyInCents: 7000 }, { userId, username: "alice" });

    const after = room.state.playersById.get(userId);
    expect(after).toBeTruthy();
    expect(after.stackCents).toBe(7000);
    expect(after.status).toBe("ACTIVE");
    expect(client2.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({ userId, joinMode: "RESTORE" }),
    );

    expect(buyInSpy).toHaveBeenCalledWith(expect.objectContaining({ userId, tableId: "table_join_buyin_override", amountCents: 5000 }));
    expect(buyInSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        tableId: "table_join_buyin_override",
        amountCents: 7000,
        externalRef: expect.stringMatching(/^join_buyin_table_join_buyin_override_user_join_override_/),
      }),
    );
  });

  it("does not apply join buy-in override when player is zero-stack but not OUT", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    const buyInSpy = vi.spyOn(CashierService, "processCashGameBuyIn");
    buyInSpy.mockResolvedValue({ success: true, newTableBalance: 5000 });

    const room = buildRoomWithRealDealer("table_join_override_guard", "room_join_override_guard");
    const userId = "user_join_override_guard";
    const c1 = makeClient("session_join_override_guard_1");
    const c2 = makeClient("session_join_override_guard_2");

    await room.onJoin(c1 as any, { buyInCents: 5000 }, { userId, username: "alice" });

    const player = room.state.playersById.get(userId);
    expect(player).toBeTruthy();
    player.stackCents = 0;
    player.status = "ALL_IN";
    room.state.street = "PREFLOP";

    await room.onJoin(c2 as any, { buyInCents: 7000 }, { userId, username: "alice" });

    expect(buyInSpy).toHaveBeenCalledTimes(1);
    expect(player.stackCents).toBe(0);
  });

  it("treats persisted zero-stack session as NEW join when buyInCents is provided", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue({
      tableId: "table_join_guard",
      userId: "user_rejoin_zero",
      seat: 2,
      stackCentsSnapshot: 0,
      buyInCents: 5000,
      state: "SEATED_SITTING_OUT",
    });
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();

    const client = makeClient("join_rejoin_zero");
    const { room, dealer } = buildRoomWithDealerStub();

    await room.onJoin(client as any, { buyInCents: 7000 }, { userId: "user_rejoin_zero", username: "charlie" });

    expect(markLeftSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: "table_join_guard", userId: "user_rejoin_zero", reason: "JOIN_WITH_BUYIN_OVERRIDE" }),
    );
    expect(dealer.restorePlayerFromSession).not.toHaveBeenCalled();
    expect(dealer.addPlayer).toHaveBeenCalledWith("user_rejoin_zero", "charlie", 7000);
    expect(client.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({
        version: 1,
        playerId: "user_rejoin_zero",
        joinMode: "NEW",
      }),
    );
  });

  it("does not convert persisted zero-stack restore to NEW join outside waiting state", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
    vi.spyOn(TableSeatSessionService, "markLeftBySessionId").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "touchConnected").mockResolvedValue();
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "findRejoinableSession").mockResolvedValue({
      tableId: "table_join_guard",
      userId: "user_rejoin_zero_restore",
      seat: 2,
      stackCentsSnapshot: 0,
      buyInCents: 5000,
      state: "SEATED_SITTING_OUT",
    });
    vi.spyOn(TableSeatSessionService, "upsertActiveSeat").mockResolvedValue();

    const client = makeClient("join_rejoin_zero_restore");
    const { room, dealer } = buildRoomWithDealerStub();
    room.state.street = "PREFLOP";

    await room.onJoin(client as any, { buyInCents: 7000 }, { userId: "user_rejoin_zero_restore", username: "charlie" });

    expect(markLeftSpy).not.toHaveBeenCalled();
    expect(dealer.restorePlayerFromSession).toHaveBeenCalledWith("user_rejoin_zero_restore", "charlie", 2, 0);
    expect(dealer.addPlayer).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({
        version: 1,
        userId: "user_rejoin_zero_restore",
        joinMode: "RESTORE",
      }),
    );
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
      expect.objectContaining({ connected: false, sittingOut: true, reconnectTimeoutMs: expect.any(Number) }),
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

  it("rejects joins with TABLE_GONE while room is deleting", async () => {
    const client = makeClient("join_deleting");
    const { room, dealer } = buildRoomWithDealerStub();

    const lock = room.beginDeleteIfNoConnectedHumans();
    expect(lock.ok).toBe(true);

    await room.onJoin(
      client as any,
      { buyInCents: 5000 },
      { userId: "user_delete_guard", username: "grace" },
    );

    expect(dealer.addPlayer).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({
        version: 1,
        code: "TABLE_GONE",
      }),
    );
    expect(client.leave).toHaveBeenCalled();
  });

  it("beginDeleteIfNoConnectedHumans denies lock when connected humans are bound", () => {
    const { room, dealer } = buildRoomWithDealerStub();
    const human = new PlayerState();
    human.id = "user_connected";
    human.userId = "user_connected";
    human.kind = "HUMAN";
    room.state.playersById.set(human.id, human);

    dealer.getClient = vi.fn((id: string) => (id === "user_connected" ? ({ sessionId: "sess_live" } as any) : undefined));

    const lock = room.beginDeleteIfNoConnectedHumans();
    expect(lock.ok).toBe(false);
    expect(lock.reason).toBe("CONNECTED_HUMANS_PRESENT");
    expect(lock.connectedHumanCount).toBe(1);
  });

  it("REJOIN returns REJOIN_FAILED_NOT_SEATED when session is not bound", async () => {
    const room = buildRoomWithRealDealer("table_rejoin_not_seated", "room_rejoin_not_seated");
    const client = makeClient("sess_rejoin_not_seated");

    room.onMessageEvents.emit("REJOIN", client as any, {});
    await delay(0);

    expect(client.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({
        version: 1,
        code: "REJOIN_FAILED_NOT_SEATED",
      }),
    );
  });

  it("JOIN_TABLE seats a bound, non-seated user without lobby round-trip", async () => {
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });

    const room = buildRoomWithRealDealer("table_join_table_recovery", "room_join_table_recovery");
    const client = makeClient("sess_join_table_recovery");
    const userId = "user_join_table_recovery";

    room.userIdBySessionId.set(client.sessionId, userId);
    room.dealer.bindClient(userId, client as any);

    room.onMessageEvents.emit("JOIN_TABLE", client as any, { buyInCents: 5000 });
    await waitFor(
      () => client.send.mock.calls.some((call: unknown[]) => call[0] === "WELCOME"),
      1500,
      "JOIN_TABLE welcome message",
    );

    expect(room.state.playersById.has(userId)).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      "WELCOME",
      expect.objectContaining({
        version: 1,
        playerId: userId,
        tableId: "table_join_table_recovery",
        joinMode: "NEW",
      }),
    );
  });

  it("REJOIN returns REJOIN_FAILED_OUT_OF_CHIPS for seated user with zero stack", async () => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    const room = buildRoomWithRealDealer("table_rejoin_ooc", "room_rejoin_ooc");
    const client = makeClient("sess_rejoin_ooc");
    await room.onJoin(client as any, { buyInCents: 5000 }, { userId: "user_rejoin_ooc", username: "alice" });

    const player = room.state.playersById.get("user_rejoin_ooc");
    expect(player).toBeTruthy();
    player.stackCents = 0;
    player.status = "OUT";
    player.sittingOutUntilNextHand = true;

    room.onMessageEvents.emit("REJOIN", client as any, {});
    await delay(0);

    expect(client.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({
        version: 1,
        code: "REJOIN_FAILED_OUT_OF_CHIPS",
      }),
    );
  });

  it("REJOIN returns REJOIN_FAILED_TABLE_GONE when room is deleting", async () => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    const room = buildRoomWithRealDealer("table_rejoin_gone", "room_rejoin_gone");
    const client = makeClient("sess_rejoin_gone");
    await room.onJoin(client as any, { buyInCents: 5000 }, { userId: "user_rejoin_gone", username: "alice" });

    (room as any).isDeleting = true;
    room.onMessageEvents.emit("REJOIN", client as any, {});
    await delay(0);

    expect(client.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({
        version: 1,
        code: "REJOIN_FAILED_TABLE_GONE",
      }),
    );
  });

  it("REJOIN clears sitting out for seated user with chips", async () => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    const room = buildRoomWithRealDealer("table_rejoin_ok", "room_rejoin_ok");
    const client = makeClient("sess_rejoin_ok");
    const userId = "user_rejoin_ok";
    await room.onJoin(client as any, { buyInCents: 5000 }, { userId, username: "alice" });

    await room.dealer.setPlayerSittingOut(userId, true);
    const before = room.state.playersById.get(userId);
    expect(before?.status === "ABANDONED" || before?.sittingOutUntilNextHand).toBe(true);

    const setSpy = vi.spyOn(room.dealer, "setPlayerSittingOut");
    room.onMessageEvents.emit("REJOIN", client as any, {});
    await delay(0);

    expect(setSpy).toHaveBeenCalledWith(userId, false);
    const after = room.state.playersById.get(userId);
    expect(after).toBeTruthy();
    expect(after.stackCents).toBeGreaterThan(0);
    expect(after.sittingOutUntilNextHand).toBe(false);
  });
});
