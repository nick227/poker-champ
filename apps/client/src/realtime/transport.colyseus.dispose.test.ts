import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@colyseus/sdk";
import { lobby } from "@poker-champ/sdk";
import { createRealtimeSession } from "@/realtime/transport";

const mockLeave = vi.fn();
const mockRoom = {
  leave: mockLeave,
  sessionId: "test-session-1",
  roomId: "room-1",
  onMessage: vi.fn(),
  onError: vi.fn(),
  onLeave: vi.fn(),
};

let resolveJoin: (room: typeof mockRoom) => void;
const joinPromise = new Promise<typeof mockRoom>((res) => {
  resolveJoin = res;
});

vi.mock("@colyseus/sdk", () => ({
  Client: vi.fn().mockImplementation(() => ({
    joinById: () => joinPromise,
    joinOrCreate: () => joinPromise,
    reconnect: () => joinPromise,
  })),
}));

vi.mock("@poker-champ/sdk", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    lobby: { listTables: vi.fn() },
  };
});

describe("Colyseus transport double-mount prevention", () => {
  beforeEach(() => {
    mockLeave.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("late join resolve after dispose: no CONNECTED dispatched, room.leave(4001) called", async () => {
    const onMessage = vi.fn();
    const session = createRealtimeSession({
      transport: "colyseus",
      url: "wss://test",
      roomId: "room-1",
      joinOptions: { tableId: "table-2" },
      onMessage,
    });

    session.disconnect(false);
    resolveJoin(mockRoom);

    await joinPromise;
    await Promise.resolve();
    await Promise.resolve();

    expect(onMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "CONNECTED" }));
    expect(mockLeave).toHaveBeenCalledWith(4001);
  });

  it("dispose during preflight resolveRoomIdByTableId await: no join afterward", async () => {
    let resolveListTables: (v: { tables: any[] }) => void;
    const listTablesPromise = new Promise<{ tables: any[] }>((res) => {
      resolveListTables = res;
    });
    vi.mocked(lobby.listTables).mockReturnValue(listTablesPromise);
    vi.mocked(Client).mockClear();

    const session = createRealtimeSession({
      transport: "colyseus",
      url: "wss://test",
      roomId: "t1",
      joinOptions: { tableId: "t1" },
      onMessage: vi.fn(),
    });

    session.disconnect(false);
    resolveListTables!({ tables: [] });

    await listTablesPromise;
    await Promise.resolve();
    await Promise.resolve();

    expect(Client).not.toHaveBeenCalled();
  });
});
