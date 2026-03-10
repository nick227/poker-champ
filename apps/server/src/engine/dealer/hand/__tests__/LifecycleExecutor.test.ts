import { afterEach, describe, expect, it, vi } from "vitest";

import { LifecycleExecutor } from "../LifecycleExecutor.js";

function createDeps(overrides?: Partial<ConstructorParameters<typeof LifecycleExecutor>[0]>) {
  return {
    sendTableSnapshotToAll: vi.fn(async () => {}),
    isDisposed: vi.fn(() => false),
    flushSessionStatsOnly: vi.fn(),
    maybeActForBot: vi.fn(async () => {}),
    getLifecycleLogContext: vi.fn(() => ({ tableId: "table_test", handId: "hand_test", street: "PREFLOP" })),
    transitionToWaiting: vi.fn(),
    releasePendingSeats: vi.fn(async () => {}),
    scheduleNextHand: vi.fn(),
    runHandEndedAwards: vi.fn(async () => {}),
    onHandEndedAwardsFailed: vi.fn(),
    onLifecycleDeferredRemoval: vi.fn(),
    startHand: vi.fn(async () => {}),
    ensureHandAdvancingAfterPlayerRemoval: vi.fn(async () => {}),
    finishHandByLastStanding: vi.fn(async () => {}),
    advanceStreetOrShowdown: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("LifecycleExecutor", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("executes HAND_ENDED awards", async () => {
    const deps = createDeps();
    const executor = new LifecycleExecutor(deps);

    await executor.executeHandLifecyclePlans([
      {
        kind: "HAND_ENDED",
        reason: "SHOWDOWN",
        outcome: { potCents: 1_000, winnerId: "u1", payoutsByUserId: { u1: 1_000 } },
      },
    ] as any);

    expect(deps.runHandEndedAwards).toHaveBeenCalledTimes(1);
    expect(deps.onHandEndedAwardsFailed).not.toHaveBeenCalled();
  });

  it("swallows HAND_ENDED errors and reports callback failure", async () => {
    const err = new Error("awards failed");
    const deps = createDeps({
      runHandEndedAwards: vi.fn(async () => {
        throw err;
      }),
    });
    const executor = new LifecycleExecutor(deps);

    await executor.executeHandLifecyclePlans([
      {
        kind: "HAND_ENDED",
        reason: "LAST_PLAYER",
        outcome: { potCents: 500, payoutsByUserId: { u1: 500 } },
      },
    ] as any);

    expect(deps.onHandEndedAwardsFailed).toHaveBeenCalledTimes(1);
    expect(deps.onHandEndedAwardsFailed).toHaveBeenCalledWith(err);
  });

  it("dispatches EMIT_SNAPSHOT plans", async () => {
    const deps = createDeps();
    const executor = new LifecycleExecutor(deps);

    await executor.executeHandLifecyclePlans([
      { kind: "EMIT_SNAPSHOT", reason: "ACTION_ACCEPTED", actionId: "act_1" },
    ] as any);

    expect(deps.sendTableSnapshotToAll).toHaveBeenCalledTimes(1);
    expect(deps.sendTableSnapshotToAll).toHaveBeenCalledWith("ACTION_ACCEPTED", "act_1");
  });

  it("dispatches SCHEDULE_NEXT_HAND plans", async () => {
    const deps = createDeps();
    const executor = new LifecycleExecutor(deps);

    await executor.executeHandLifecyclePlans([
      { kind: "SCHEDULE_NEXT_HAND", reason: "end", delayMs: 250 },
    ] as any);

    expect(deps.scheduleNextHand).toHaveBeenCalledTimes(1);
    expect(deps.scheduleNextHand).toHaveBeenCalledWith("end", 250);
  });

  it("DELAY plan pauses before executing subsequent plans", async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const executor = new LifecycleExecutor(deps);

    const execution = executor.executeHandLifecyclePlans([
      { kind: "DELAY", ms: 100 },
      { kind: "MAYBE_AUTOMATE_TURN" },
    ] as any);

    await Promise.resolve();
    expect(deps.maybeActForBot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(99);
    expect(deps.maybeActForBot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await execution;

    expect(deps.maybeActForBot).toHaveBeenCalledTimes(1);
  });

  it("short-circuits hand plan execution when disposed", async () => {
    const deps = createDeps({
      isDisposed: vi.fn(() => true),
    });
    const executor = new LifecycleExecutor(deps);

    await executor.executeHandLifecyclePlans([
      { kind: "EMIT_SNAPSHOT", reason: "ACTION_ACCEPTED", actionId: "act_1" },
    ] as any);

    expect(deps.sendTableSnapshotToAll).not.toHaveBeenCalled();
    expect(deps.scheduleNextHand).not.toHaveBeenCalled();
    expect(deps.maybeActForBot).not.toHaveBeenCalled();
  });
});
