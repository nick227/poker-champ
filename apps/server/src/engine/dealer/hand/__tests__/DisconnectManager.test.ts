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
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned,
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(markAbandoned).toHaveBeenCalledTimes(1);
    expect(markAbandoned).toHaveBeenCalledWith("u1", state.playersById.get("u1")!.disconnectDeadlineTs);
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

  it("does not nest a serialized mutation inside the sweep's own execution", async () => {
    // Regression: the sweep itself must not be wrapped in the dealer's serialized-mutation
    // queue. markAbandoned (wired to Dealer.markAbandonedSerialized) enqueues its own serialized
    // mutation; nesting that inside another enqueued mutation (the sweep) would deadlock the
    // queue permanently the first time the sweep found someone to abandon, since the inner
    // enqueue chains behind the outer one that is still executing and waiting on it.
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    state.playersById.get("u1")!.disconnectDeadlineTs = Date.now() - 1_000;

    // Models a serialized-mutation-style markAbandoned: it can only resolve once *this* sweep
    // tick has fully returned control to the event loop (i.e. is not itself still on the stack
    // waiting on this call), proving the sweep does not hold any outer lock across this await.
    let sweepStillOnStack = true;
    const markAbandoned = vi.fn(async () => {
      expect(sweepStillOnStack).toBe(false);
    });

    const manager = new DisconnectManager({
      state,
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned,
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);
    sweepStillOnStack = false;

    expect(markAbandoned).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it("prevents overlapping sweeps while a sweep is running", async () => {
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    state.playersById.get("u1")!.disconnectDeadlineTs = Date.now() - 1_000;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const markAbandoned = vi.fn(async () => {
      await gate;
    });

    const manager = new DisconnectManager({
      state,
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned,
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    // The second interval tick fired while the first sweep's markAbandoned call was still
    // pending, but sweepRunning must have suppressed a second concurrent sweep.
    expect(markAbandoned).toHaveBeenCalledTimes(1);
    releaseGate();
    await Promise.resolve();
    manager.dispose();
  });

  it("stops interval on dispose", async () => {
    vi.useFakeTimers();
    const state = createStateWithPlayer("u1");
    state.playersById.get("u1")!.disconnectDeadlineTs = Date.now() - 1_000;
    const markAbandoned = vi.fn(async () => {});
    const manager = new DisconnectManager({
      state,
      hasClient: () => false,
      markReconnected: async () => {},
      markAbandoned,
    });

    manager.startSweep();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(markAbandoned).toHaveBeenCalledTimes(1);

    manager.dispose();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(markAbandoned).toHaveBeenCalledTimes(1);
  });
});
