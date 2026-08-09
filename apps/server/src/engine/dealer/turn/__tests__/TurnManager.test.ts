import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerState } from "../../../../state/PlayerState.js";
import { PokerState } from "../../../../state/PokerState.js";
import { PokerError } from "../../../errors.js";
import { TURN_TIMEOUT_TOTAL_MS } from "../../timing.js";
import { TurnManager } from "../TurnManager.js";

function createActionableState(userId = "u1"): PokerState {
  const state = new PokerState();
  state.roundState = "WAITING_FOR_ACTION";
  for (let i = 0; i < state.maxSeats; i += 1) state.seats.push("");

  const player = new PlayerState();
  player.id = userId;
  player.userId = userId;
  player.kind = "HUMAN";
  player.seat = 0;
  player.status = "ACTIVE";
  player.needsAction = true;
  player.connected = false;
  player.roundBetCents = 0;
  state.playersById.set(userId, player);
  state.seats[0] = userId;

  state.handId = "hand_1";
  state.street = "PREFLOP";
  state.handActionSeq = 1;
  state.toActSeat = 0;
  state.roundCurrentBetCents = 100;
  return state;
}

describe("TurnManager", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("queues player actions serially", async () => {
    const state = createActionableState();
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });
    const order: string[] = [];
    const releaseRef: { call: (() => void) | null } = { call: null };
    const firstGate = new Promise<void>((resolve) => {
      releaseRef.call = () => resolve();
    });

    const first = turnManager.enqueuePlayerAction(async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });
    const second = turnManager.enqueuePlayerAction(async () => {
      order.push("second");
    });

    await vi.waitFor(() => {
      expect(order).toEqual(["first-start"]);
    });
    releaseRef.call?.();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("rejects enqueue work after dispose", async () => {
    const state = createActionableState();
    const work = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => true,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });

    await turnManager.enqueuePlayerAction(work);
    await turnManager.enqueueSerializedStateMutation(work);

    expect(work).not.toHaveBeenCalled();
  });

  it("clears a previous pending timeout when turn token changes", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const state = createActionableState();
    const setPlayerSittingOutInternal = vi.fn(async () => {}),
      driveGame = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal,
      driveGame,
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    state.handActionSeq += 1;
    turnManager.scheduleHumanTurnTimeout("u1");

    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_TOTAL_MS);
    await turnManager.getActionQueue();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(setPlayerSittingOutInternal).toHaveBeenCalledTimes(1);
  });

  it("keeps exactly one live timeout handle when the same actor is armed twice rapidly", () => {
    const state = createActionableState();
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const handles = new Map<number, () => void>();
    let nextHandle = 1;

    vi.spyOn(globalThis, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, _ms?: number) => {
      const handle = nextHandle++;
      handles.set(handle, () => cb());
      return handle as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id: ReturnType<typeof setTimeout>) => {
      const removed = handles.delete(Number(id));
      if (!removed) {
        realClearTimeout(id as unknown as NodeJS.Timeout);
      }
    }) as typeof clearTimeout);

    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    const firstDeadline = state.turnDeadlineMs;

    turnManager.scheduleHumanTurnTimeout("u1");

    expect(firstDeadline).toBeGreaterThan(0);
    expect(state.turnDeadlineMs).toBe(firstDeadline);
    expect(handles.size).toBe(1);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

    turnManager.clearPendingHumanTurnTimeout();
    expect(handles.size).toBe(0);
    expect(state.turnDeadlineMs).toBe(0);

    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  });

  it("ignores stale timeout token when state has advanced", async () => {
    vi.useFakeTimers();
    const state = createActionableState();
    const setPlayerSittingOutInternal = vi.fn(async () => {}),
      driveGame = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal,
      driveGame,
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    state.toActSeat = 1;

    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_TOTAL_MS);
    await turnManager.getActionQueue();

    expect(setPlayerSittingOutInternal).not.toHaveBeenCalled();
  });

  it("sets deadline on arm and consumes it before executing timeout auto-action", async () => {
    vi.useFakeTimers();
    const state = createActionableState();
    let deadlineAtCallback = -1;
    const setPlayerSittingOutInternal = vi.fn(async () => {
      deadlineAtCallback = state.turnDeadlineMs;
    });
    const driveGame = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal,
      driveGame,
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    expect(state.turnDeadlineMs).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_TOTAL_MS);
    await turnManager.getActionQueue();

    expect(setPlayerSittingOutInternal).toHaveBeenCalledTimes(1);
    expect(deadlineAtCallback).toBe(0);
    expect(state.turnDeadlineMs).toBe(0);
  });

  it("simulated event-loop pause: overdue timeout still fires once and clears deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = createActionableState();
    let callbackNow = 0;
    const setPlayerSittingOutInternal = vi.fn(async () => {
      callbackNow = Date.now();
    });
    const driveGame = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal,
      driveGame,
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    const armedDeadline = state.turnDeadlineMs;
    expect(armedDeadline).toBeGreaterThan(0);

    // Simulate a paused event loop by jumping wall clock beyond the deadline,
    // then flushing pending timers; timeout callback must remain correct.
    vi.setSystemTime(new Date(armedDeadline + 5_000));
    await vi.runOnlyPendingTimersAsync();
    await turnManager.getActionQueue();

    expect(setPlayerSittingOutInternal).toHaveBeenCalledTimes(1);
    expect(callbackNow).toBeGreaterThan(armedDeadline);
    expect(state.turnDeadlineMs).toBe(0);

    await vi.runOnlyPendingTimersAsync();
    await turnManager.getActionQueue();
    expect(setPlayerSittingOutInternal).toHaveBeenCalledTimes(1);
  });

  it("clears deadline when pending timeout is cancelled", () => {
    const state = createActionableState();
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });

    turnManager.scheduleHumanTurnTimeout("u1");
    expect(state.turnDeadlineMs).toBeGreaterThan(0);

    turnManager.clearPendingHumanTurnTimeout();
    expect(state.turnDeadlineMs).toBe(0);
  });

  it("honors delayed internal action scheduling", async () => {
    vi.useFakeTimers();
    const state = createActionableState();
    const handleInternalAction = vi.fn(async () => {});
    const driveGame = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction,
      setPlayerSittingOutInternal: async () => {},
      driveGame,
    });

    turnManager.enqueueInternalAction("u1", { action: "FOLD" }, 250);

    await vi.advanceTimersByTimeAsync(249);
    expect(handleInternalAction).not.toHaveBeenCalled();
    expect(driveGame).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await turnManager.getActionQueue();

    expect(handleInternalAction).toHaveBeenCalledTimes(1);
    expect(handleInternalAction).toHaveBeenCalledWith("u1", { action: "FOLD" });
    expect(driveGame).toHaveBeenCalledTimes(1);
    expect(driveGame).toHaveBeenCalledWith("AUTO_ACTION_EXECUTED");
  });

  it("continues dealer progression after human timeout auto sit-out", async () => {
    vi.useFakeTimers();
    const state = createActionableState();
    const callOrder: string[] = [];
    const setPlayerSittingOutInternal = vi.fn(async () => {
      callOrder.push("setPlayerSittingOutInternal");
    });
    const driveGame = vi.fn(async (reason: string) => {
      callOrder.push(`driveGame:${reason}`);
    });
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal,
      driveGame,
    });

    turnManager.scheduleHumanTurnTimeout("u1");

    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_TOTAL_MS);
    await turnManager.getActionQueue();

    expect(setPlayerSittingOutInternal).toHaveBeenCalledTimes(1);
    expect(driveGame).toHaveBeenCalledTimes(1);
    expect(driveGame).toHaveBeenCalledWith("HUMAN_TIMEOUT_AUTO_SIT_OUT");
    expect(callOrder).toEqual([
      "setPlayerSittingOutInternal",
      "driveGame:HUMAN_TIMEOUT_AUTO_SIT_OUT",
    ]);
  });

  it("does not enqueue a duplicate auto-action for the same decision point while one is already pending", async () => {
    // Regression coverage: maybeActForBot is called on every drive (ticks, retries,
    // the engine's own natural churn), and while a previously-enqueued auto-action
    // for a disconnected player hasn't executed yet, a naive caller re-enqueues a
    // duplicate every time it's called. Each duplicate captures its own turn token;
    // in production, by the time an earlier one reaches beforeStart, real intervening
    // game activity has usually already changed handActionSeq, so most of a flood of
    // duplicates get discarded as stale instead of any single attempt getting an
    // uncontested chance to land -- which is what caused a real BOT_OVERDUE stall
    // (soak-test discovered) that no amount of extra retrying fixed, only closing the
    // duplicate-enqueue gap at the source did. Calling enqueueInternalAction twice in
    // a row for the exact same decision point (same state, no await in between) must
    // only ever actually apply the action once.
    const state = createActionableState();
    const handleInternalAction = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction,
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });

    turnManager.enqueueInternalAction("u1", { action: "FOLD" });
    turnManager.enqueueInternalAction("u1", { action: "FOLD" });

    await turnManager.getActionQueue();

    expect(handleInternalAction).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh auto-action once the decision point actually changes", async () => {
    // The dedup guard must not outlive its decision point: once real state progress
    // makes it a genuinely new turn (different handActionSeq), a new auto-action for
    // the same player must not be blocked by the earlier, now-resolved one.
    const state = createActionableState();
    const handleInternalAction = vi.fn(async () => {});
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 50,
      isDisposed: () => false,
      emitDiagnostic: () => {},
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction,
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });

    turnManager.enqueueInternalAction("u1", { action: "FOLD" });
    await turnManager.getActionQueue();
    expect(handleInternalAction).toHaveBeenCalledTimes(1);

    state.handActionSeq += 1;
    turnManager.enqueueInternalAction("u1", { action: "FOLD" });
    await turnManager.getActionQueue();

    expect(handleInternalAction).toHaveBeenCalledTimes(2);
  });

  it("emits QUEUE_FULL, rejects overflow enqueue, and continues queue processing", async () => {
    const state = createActionableState();
    const diagnostics: Array<Record<string, unknown>> = [];
    const turnManager = new TurnManager({
      state,
      maxQueueDepth: 1,
      isDisposed: () => false,
      emitDiagnostic: (event) => diagnostics.push(event as unknown as Record<string, unknown>),
      buildDiagnosticContext: (context) => context ?? {},
      handleInternalAction: async () => {},
      setPlayerSittingOutInternal: async () => {},
      driveGame: async () => {},
    });
    const order: string[] = [];
    const releaseRef: { call: (() => void) | null } = { call: null };
    const firstGate = new Promise<void>((resolve) => {
      releaseRef.call = () => resolve();
    });

    const first = turnManager.enqueuePlayerAction(async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });

    await vi.waitFor(() => {
      expect(order).toEqual(["first-start"]);
    });

    try {
      turnManager.enqueuePlayerAction(async () => {
        order.push("overflow");
      });
      throw new Error("Expected queue overflow");
    } catch (err) {
      expect(err).toBeInstanceOf(PokerError);
      expect((err as PokerError).code).toBe("QUEUE_FULL");
    }

    releaseRef.call?.();
    await first;
    await turnManager.enqueuePlayerAction(async () => {
      order.push("third");
    });

    expect(order).toEqual(["first-start", "first-end", "third"]);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warn",
        type: "QUEUE_FULL",
        code: "QUEUE_FULL",
      }),
    );
  });
});
