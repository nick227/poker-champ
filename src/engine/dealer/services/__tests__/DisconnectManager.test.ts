import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerState } from "../../../../state/PlayerState.js";
import { PokerState } from "../../../../state/PokerState.js";
import { DisconnectManager } from "../DisconnectManager.js";

function createStateWithPlayer(userId = "u1"): PokerState {
  const state = new PokerState();
  for (let i = 0; i < state.maxSeats; i += 1) state.seats.push("");
  const player = new PlayerState();
  player.id = userId;
  player.userId = userId;
  player.seat = 0;
  player.status = "ABANDONED";
  player.connected = false;
  state.playersById.set(userId, player);
  state.seats[0] = userId;
  return state;
}

describe("DisconnectManager", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks expired disconnected players abandoned", async () => {
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    state.playersById.get("u1")!.disconnectDeadlineTs = Date.now() - 1_000;
    const markAbandoned = vi.fn(async () => {});

    const manager = new DisconnectManager({
      state,
      enqueueSerializedStateMutation: (work) => work(),
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned,
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(markAbandoned).toHaveBeenCalledTimes(1);
    expect(markAbandoned).toHaveBeenCalledWith("u1");
    manager.dispose();
  });

  it("marks expired connected players reconnected", async () => {
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    state.playersById.get("u1")!.disconnectDeadlineTs = Date.now() - 1_000;
    const markReconnected = vi.fn(async () => {});
    const markAbandoned = vi.fn(async () => {});

    const manager = new DisconnectManager({
      state,
      enqueueSerializedStateMutation: (work) => work(),
      hasClient: () => true,
      markReconnected,
      markAbandoned,
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(markReconnected).toHaveBeenCalledTimes(1);
    expect(markReconnected).toHaveBeenCalledWith("u1");
    expect(markAbandoned).not.toHaveBeenCalled();
    manager.dispose();
  });

  it("prevents overlapping sweeps while a sweep is running", async () => {
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    const releaseRef: { call: (() => void) | null } = { call: null };
    const gate = new Promise<void>((resolve) => {
      releaseRef.call = () => resolve();
    });
    const enqueueSerializedStateMutation = vi.fn(async (work: () => Promise<void>) => {
      await gate;
      await work();
    });

    const manager = new DisconnectManager({
      state,
      enqueueSerializedStateMutation,
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned: async () => {},
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(1);
    releaseRef.call?.();
    await Promise.resolve();
    manager.dispose();
  });

  it("stops interval on dispose", async () => {
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    const enqueueSerializedStateMutation = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const manager = new DisconnectManager({
      state,
      enqueueSerializedStateMutation,
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned: async () => {},
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(1);

    manager.dispose();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(1);
  });
});
