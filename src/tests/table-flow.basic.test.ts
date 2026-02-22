import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@colyseus/core", async () => {
  const actual = await vi.importActual<typeof import("@colyseus/core")>("@colyseus/core");
  return {
    ...actual,
    matchMaker: {
      ...actual.matchMaker,
      createRoom: vi.fn(),
      query: vi.fn(),
    },
  };
});

import { matchMaker } from "@colyseus/core";
import { LobbyRoom } from "../lobby/LobbyRoom.js";
import { PokerRoom } from "../rooms/PokerRoom.js";

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

function flushAsyncHandlers() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("basic table flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a table from lobby and returns table/room ids", async () => {
    const room = new LobbyRoom() as any;
    const client = makeClient("c1");
    const mockedMatchMaker = matchMaker as any;

    mockedMatchMaker.createRoom.mockResolvedValueOnce({ roomId: "room_test_1" });
    mockedMatchMaker.query.mockResolvedValueOnce([]);
    mockedMatchMaker.query.mockResolvedValueOnce([
      {
        roomId: "room_test_1",
        clients: 0,
        maxClients: 6,
        metadata: {
          tableId: "table_test_1",
          name: "Test Table",
          maxSeats: 6,
          smallBlindCents: 50,
          bigBlindCents: 100,
          minBuyInCents: 2000,
          maxBuyInCents: 20000,
          visibility: "PUBLIC",
          createdAt: Date.now(),
        },
      },
    ]);

    room.onCreate();
    room.onMessageEvents.emit("CREATE_TABLE", client as any, {
      name: "Test Table",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      visibility: "PUBLIC",
    });
    await flushAsyncHandlers();

    expect(client.send).toHaveBeenCalledWith(
      "TABLE_CREATED",
      expect.objectContaining({ roomId: "room_test_1" }),
    );
  });

  it("joins a table from lobby and returns connection info", async () => {
    const room = new LobbyRoom() as any;
    const client = makeClient("c2");
    const mockedMatchMaker = matchMaker as any;
    mockedMatchMaker.query.mockResolvedValueOnce([
      {
        roomId: "room_join_1",
        clients: 3,
        maxClients: 6,
        metadata: {
          tableId: "table_join_1",
          name: "Joinable Table",
          maxSeats: 6,
          smallBlindCents: 50,
          bigBlindCents: 100,
          minBuyInCents: 2000,
          maxBuyInCents: 20000,
          visibility: "PUBLIC",
          createdAt: Date.now(),
        },
      },
    ]);

    room.onCreate();
    room.onMessageEvents.emit("JOIN_TABLE", client as any, {
      tableId: "table_join_1",
    });
    await flushAsyncHandlers();

    expect(client.send).toHaveBeenCalledWith("TABLE_JOIN_INFO", {
      tableId: "table_join_1",
      roomId: "room_join_1",
    });
  });

  it("joins poker table and forwards player ACTION to dealer", async () => {
    const room = new PokerRoom() as any;
    const client = makeClient("session_1");

    // Avoid Room listing internals during unit tests.
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_poker_1";

    room.onCreate({
      tableConfig: {
        tableId: "table_poker_1",
        name: "Poker Table",
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
      addPlayer: vi.fn().mockResolvedValue(undefined),
      emitSnapshotToUser: vi.fn(),
      handleAction: vi.fn().mockResolvedValue(undefined),
    };
    room.dealer = dealer;

    await room.onJoin(
      client as any,
      { buyInCents: 5000 },
      { userId: "user_1", username: "alice" },
    );

    expect(dealer.addPlayer).toHaveBeenCalledWith("user_1", "alice", 5000);
    expect(client.send).toHaveBeenCalledWith("WELCOME", {
      version: 1,
      roomId: "room_poker_1",
      playerId: "user_1",
      tableId: "table_poker_1",
      joinMode: "NEW",
    });

    room.userIdBySessionId.set("session_1", "user_1");
    const actionId = "flow-test-" + Date.now();
    room.onMessageEvents.emit("ACTION", client as any, { action: "FOLD", actionId });
    await flushAsyncHandlers();

    expect(dealer.handleAction).toHaveBeenCalledWith("user_1", { action: "FOLD" }, actionId);
  });

  it("rejects ACTION without actionId", async () => {
    const room = new PokerRoom() as any;
    const client = makeClient("session_2");
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = "room_poker_2";
    room.onCreate({
      tableConfig: {
        tableId: "table_poker_2",
        name: "Poker Table",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    room.dealer = { handleAction: vi.fn(), hasPlayer: vi.fn().mockReturnValue(true), bindClient: vi.fn(), markReconnected: vi.fn(), addPlayer: vi.fn(), emitSnapshotToUser: vi.fn() };
    await room.onJoin(client as any, { buyInCents: 5000 }, { userId: "user_2", username: "bob" });
    room.userIdBySessionId.set("session_2", "user_2");

    room.onMessageEvents.emit("ACTION", client as any, { action: "FOLD" });
    await flushAsyncHandlers();

    expect(room.dealer.handleAction).not.toHaveBeenCalled();
    const errors = (client.send as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "ERROR");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.[1]?.code).toBe("BAD_MESSAGE");
    expect(errors[0]?.[1]?.message).toContain("actionId");
  });
});
