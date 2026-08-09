/**
 * Session-generation fencing for the Colyseus transport across a reconnect cycle.
 *
 * Scenario under test: generation 1 (the initial join) succeeds, then drops and a generation 2
 * reconnect attempt is scheduled and succeeds. A straggling callback from generation 1 (a stale,
 * superseded room) then fires late — simulating a delayed event arriving after a newer attempt
 * has already taken over. This must be a no-op: it must not be forwarded to the consumer and
 * must not disturb the state of the now-active generation 2 room.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeSession } from "@/realtime/transport";

type MessageHandler = (type: string | number, payload: unknown) => void;
type ErrorHandler = (code: number, message?: string) => void;
type LeaveHandler = (code?: number) => void;

function createMockRoom(id: string) {
  let messageHandler: MessageHandler | null = null;
  let errorHandler: ErrorHandler | null = null;
  let leaveHandler: LeaveHandler | null = null;

  return {
    roomId: id,
    sessionId: `${id}-session`,
    reconnectionToken: `${id}-token`,
    leave: vi.fn(),
    onMessage: vi.fn((_type: string, cb: MessageHandler) => {
      messageHandler = cb;
    }),
    onError: vi.fn((cb: ErrorHandler) => {
      errorHandler = cb;
    }),
    onLeave: vi.fn((cb: LeaveHandler) => {
      leaveHandler = cb;
    }),
    fireMessage: (type: string, payload?: unknown) => messageHandler?.(type, payload),
    fireError: (code: number, message?: string) => errorHandler?.(code, message),
    fireLeave: (code?: number) => leaveHandler?.(code),
  };
}

type MockRoom = ReturnType<typeof createMockRoom>;

let joinByIdResolvers: Array<(room: MockRoom) => void> = [];
let reconnectResolvers: Array<(room: MockRoom) => void> = [];

vi.mock("@colyseus/sdk", () => ({
  Client: vi.fn().mockImplementation(() => ({
    joinById: () =>
      new Promise<MockRoom>((resolve) => {
        joinByIdResolvers.push(resolve);
      }),
    joinOrCreate: () =>
      new Promise<MockRoom>((resolve) => {
        joinByIdResolvers.push(resolve);
      }),
    reconnect: () =>
      new Promise<MockRoom>((resolve) => {
        reconnectResolvers.push(resolve);
      }),
  })),
}));

vi.mock("@poker-champ/sdk", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    lobby: { listTables: vi.fn().mockResolvedValue({ tables: [] }) },
  };
});

describe("Colyseus transport session-generation fencing across reconnect", () => {
  beforeEach(() => {
    joinByIdResolvers = [];
    reconnectResolvers = [];
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ignores late callbacks from a superseded room after a newer reconnect attempt has already succeeded", async () => {
    const onMessage = vi.fn();
    createRealtimeSession({
      transport: "colyseus",
      url: "wss://test",
      roomId: "room-1",
      joinOptions: { tableId: "t1" },
      onMessage,
    });

    // Generation 1 joins successfully.
    expect(joinByIdResolvers).toHaveLength(1);
    const room1 = createMockRoom("room-1");
    joinByIdResolvers[0](room1);
    await Promise.resolve();
    await Promise.resolve();

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "CONNECTED" }));
    onMessage.mockClear();

    // room1 drops unexpectedly (not consented, not a session-replace) -> reconnect scheduled.
    room1.fireLeave(1006);
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "DISCONNECTED" }));
    onMessage.mockClear();

    // The scheduled reconnect fires -> generation 2 attempt starts (uses the reconnection token
    // captured from generation 1's successful join).
    await vi.runOnlyPendingTimersAsync();
    expect(reconnectResolvers).toHaveLength(1);

    // Generation 2 succeeds with a fresh room.
    const room2 = createMockRoom("room-1");
    reconnectResolvers[0](room2);
    await Promise.resolve();
    await Promise.resolve();

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "CONNECTED" }));
    onMessage.mockClear();

    // A stray/late event from room1 (generation 1) arrives after generation 2 already won.
    // Must be a no-op: not forwarded, and must not disturb the active generation 2 session.
    room1.fireMessage("STATE_UPDATE", { source: "stale" });
    room1.fireLeave(1006);

    expect(onMessage).not.toHaveBeenCalled();

    // The active (generation 2) room is unaffected — a real message from it still comes through.
    room2.fireMessage("STATE_UPDATE", { source: "current" });
    expect(onMessage).toHaveBeenCalledWith({ type: "STATE_UPDATE", payload: { source: "current" } });
  });
});
