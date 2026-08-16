import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@poker-champ/db";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { PokerRoom } from "./PokerRoom.js";

describe("cash-table economic idle lifecycle", () => {
  const previousIdleMs = process.env.POKER_ROOM_IDLE_DISPOSE_MS;
  const previousPersistentSeats = process.env.FEATURE_PERSISTENT_SEATS;
  let reconnectableCount = 0;
  let activeBalanceCount = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.POKER_ROOM_IDLE_DISPOSE_MS = "1800000";
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    reconnectableCount = 0;
    activeBalanceCount = 0;
    vi.spyOn(TableSeatSessionService, "countReconnectableSessionsForTable").mockImplementation(
      async () => reconnectableCount,
    );
    vi.spyOn((getPrisma() as any).playerBalance, "count").mockImplementation(
      async () => activeBalanceCount,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (previousIdleMs == null) delete process.env.POKER_ROOM_IDLE_DISPOSE_MS;
    else process.env.POKER_ROOM_IDLE_DISPOSE_MS = previousIdleMs;
    if (previousPersistentSeats == null) delete process.env.FEATURE_PERSISTENT_SEATS;
    else process.env.FEATURE_PERSISTENT_SEATS = previousPersistentSeats;
  });

  function buildRoom(id: string): PokerRoom {
    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = `room_${id}`;
    room.onCreate({
      tableConfig: {
        tableId: id,
        name: id,
        maxSeats: 6,
        smallBlindCents: 100,
        bigBlindCents: 200,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    return room;
  }

  it("preserves a switched-away table with a seated human beyond 30 minutes", async () => {
    reconnectableCount = 1;
    activeBalanceCount = 1;
    const room = buildRoom("switch_preserved") as any;
    room.computeHumanCount = () => 1;
    const disconnect = vi.spyOn(room, "requestDisconnect").mockResolvedValue(undefined);

    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(31 * 60_000);

    expect(disconnect).not.toHaveBeenCalled();
    expect(await room.canIdleDisposeInternal()).toBe(false);
    room.onDispose();
  });

  it("fails disposal when a durable balance remains without runtime players", async () => {
    activeBalanceCount = 1;
    const room = buildRoom("balance_preserved") as any;
    const disconnect = vi.spyOn(room, "requestDisconnect").mockResolvedValue(undefined);

    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(31 * 60_000);

    expect(disconnect).not.toHaveBeenCalled();
    expect(await room.canIdleDisposeInternal()).toBe(false);
    room.onDispose();
  });

  it("starts a fresh 30-minute window only when economic emptiness begins", async () => {
    reconnectableCount = 1;
    const room = buildRoom("fresh_window") as any;
    const disconnect = vi.spyOn(room, "requestDisconnect").mockResolvedValue(undefined);
    await room.reevaluateIdleLifecycleInternal();

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    reconnectableCount = 0;
    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(disconnect).toHaveBeenCalledTimes(1);
    room.onDispose();
  });

  it("rechecks authoritative state so a stale timer cannot dispose an active table", async () => {
    const room = buildRoom("stale_timer") as any;
    const disconnect = vi.spyOn(room, "requestDisconnect").mockResolvedValue(undefined);
    await room.reevaluateIdleLifecycleInternal();

    await vi.advanceTimersByTimeAsync(29 * 60_000);
    room.computeHumanCount = () => 1;
    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    expect(disconnect).not.toHaveBeenCalled();
    room.onDispose();
  });
});
