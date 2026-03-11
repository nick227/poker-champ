import { afterEach, describe, expect, it, vi } from "vitest";

describe("Turn timeout config", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("honors TURN_TIMEOUT_TOTAL_MS env override for scheduled human timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("TURN_TIMEOUT_TOTAL_MS", "50");
    vi.resetModules();

    const { PokerState } = await import("../../../../state/PokerState.js");
    const { PlayerState } = await import("../../../../state/PlayerState.js");
    const { TurnManager } = await import("../TurnManager.js");
    const { TURN_TIMEOUT_TOTAL_MS } = await import("../../timing.js");

    expect(TURN_TIMEOUT_TOTAL_MS).toBe(50);

    const state = new PokerState();
    for (let i = 0; i < state.maxSeats; i += 1) state.seats.push("");

    const player = new PlayerState();
    player.id = "u1";
    player.userId = "u1";
    player.kind = "HUMAN";
    player.seat = 0;
    player.status = "ACTIVE";
    player.needsAction = true;
    player.connected = true;
    state.playersById.set("u1", player);
    state.seats[0] = "u1";
    state.handId = "hand_timeout_cfg";
    state.street = "PREFLOP";
    state.toActSeat = 0;
    state.handActionSeq = 1;
    state.roundCurrentBetCents = 100;

    const setPlayerSittingOutInternal = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal,
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    expect(state.turnDeadlineMs).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(49);
    await turnManager.getActionQueue();
    expect(setPlayerSittingOutInternal).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await turnManager.getActionQueue();
    expect(setPlayerSittingOutInternal).toHaveBeenCalledTimes(1);
    expect(state.turnDeadlineMs).toBe(0);
  });
});

