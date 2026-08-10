import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerState } from "../../../../state/PlayerState.js";
import { PokerState } from "../../../../state/PokerState.js";
import { HandContext } from "../../HandContext.js";
import { NEXT_HAND_DELAY_MS } from "../../timing.js";
import { HandOrchestrator } from "../HandOrchestrator.js";

function createState(): PokerState {
  const state = new PokerState();
  for (let i = 0; i < state.maxSeats; i += 1) state.seats.push("");
  state.street = "WAITING";
  state.toActSeat = -1;
  return state;
}

function addSeatedPlayer(state: PokerState, userId: string, seat: number): void {
  const player = new PlayerState();
  player.id = userId;
  player.userId = userId;
  player.seat = seat;
  player.status = "ACTIVE";
  state.playersById.set(userId, player);
  state.seats[seat] = userId;
}

describe("HandOrchestrator", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("scheduleNextHand only schedules once for duplicate calls", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const state = createState();
    const enqueueSerializedStateMutation = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: {
        startHand: async () => [],
        advanceStreetOrShowdown: async () => [],
        finishHandByLastStanding: async () => [],
        finishHandShowdownWithSidePots: async () => [],
      } as any,
      clearPendingHumanTurnTimeout: () => {},
      createHandContext: () => new HandContext(),
      setCurrentHand: () => {},
      getCurrentHand: () => null,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans: async () => {},
      requestDrive: async () => {},
      enqueueSerializedStateMutation,
      sendTableSnapshotToAll: async () => {},
      isDisposed: () => false,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    orchestrator.scheduleNextHand("test", 25);
    orchestrator.scheduleNextHand("test", 25);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(25);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(2);
  });

  it("dispose cancels both announce and start timers", async () => {
    vi.useFakeTimers();
    const state = createState();
    const enqueueSerializedStateMutation = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const sendTableSnapshotToAll = vi.fn(async () => {});
    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: {
        startHand: async () => [],
        advanceStreetOrShowdown: async () => [],
        finishHandByLastStanding: async () => [],
        finishHandShowdownWithSidePots: async () => [],
      } as any,
      clearPendingHumanTurnTimeout: () => {},
      createHandContext: () => new HandContext(),
      setCurrentHand: () => {},
      getCurrentHand: () => null,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans: async () => {},
      requestDrive: async () => {},
      enqueueSerializedStateMutation,
      sendTableSnapshotToAll,
      isDisposed: () => false,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    orchestrator.scheduleNextHand("test", 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(1);

    orchestrator.dispose();
    await vi.advanceTimersByTimeAsync(NEXT_HAND_DELAY_MS + 20);

    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(1);
    expect(sendTableSnapshotToAll).toHaveBeenCalledTimes(1);
  });

  it("resets schedule when disposed room is detected in timer callback", async () => {
    vi.useFakeTimers();
    const state = createState();
    let disposed = true;
    const enqueueSerializedStateMutation = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: {
        startHand: async () => [],
        advanceStreetOrShowdown: async () => [],
        finishHandByLastStanding: async () => [],
        finishHandShowdownWithSidePots: async () => [],
      } as any,
      clearPendingHumanTurnTimeout: () => {},
      createHandContext: () => new HandContext(),
      setCurrentHand: () => {},
      getCurrentHand: () => null,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans: async () => {},
      requestDrive: async () => {},
      enqueueSerializedStateMutation,
      sendTableSnapshotToAll: async () => {},
      isDisposed: () => disposed,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    orchestrator.scheduleNextHand("first", 0);
    await vi.advanceTimersByTimeAsync(0);

    disposed = false;
    orchestrator.scheduleNextHand("second", 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(enqueueSerializedStateMutation).toHaveBeenCalledTimes(2);
  });

  it("startHand clears pending turn timeout before lifecycle execution", async () => {
    const state = createState();
    addSeatedPlayer(state, "u1", 0);
    addSeatedPlayer(state, "u2", 1);
    const clearPendingHumanTurnTimeout = vi.fn();
    const executeHandLifecyclePlans = vi.fn(async () => {});
    let currentHand: HandContext | null = null;
    const handLifecycleService = {
      startHand: vi.fn(async () => {
        state.street = "PREFLOP";
        return [{ kind: "EMIT_SNAPSHOT", reason: "HAND_START" } as any];
      }),
      advanceStreetOrShowdown: async () => [],
      finishHandByLastStanding: async () => [],
      finishHandShowdownWithSidePots: async () => [],
    };
    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: handLifecycleService as any,
      clearPendingHumanTurnTimeout,
      createHandContext: () => new HandContext(),
      setCurrentHand: (hand) => {
        currentHand = hand;
      },
      getCurrentHand: () => currentHand,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans,
      requestDrive: async () => {},
      enqueueSerializedStateMutation: async (work) => work(),
      sendTableSnapshotToAll: async () => {},
      isDisposed: () => false,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    await orchestrator.startHand();

    expect(clearPendingHumanTurnTimeout).toHaveBeenCalledTimes(1);
    expect(handLifecycleService.startHand).toHaveBeenCalledTimes(1);
    expect(executeHandLifecyclePlans).toHaveBeenCalledTimes(1);
  });

  it("requests drive to reconcile tournament when fewer than two players are ready", async () => {
    vi.useFakeTimers();
    const state = createState();
    state.tournamentMode = true;
    addSeatedPlayer(state, "human_1", 0);
    const requestDrive = vi.fn(async () => {});
    const enqueueSerializedStateMutation = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: {
        startHand: async () => [],
        advanceStreetOrShowdown: async () => [],
        finishHandByLastStanding: async () => [],
        finishHandShowdownWithSidePots: async () => [],
      } as any,
      clearPendingHumanTurnTimeout: () => {},
      createHandContext: () => new HandContext(),
      setCurrentHand: () => {},
      getCurrentHand: () => null,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans: async () => {},
      requestDrive,
      enqueueSerializedStateMutation,
      sendTableSnapshotToAll: async () => {},
      isDisposed: () => false,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    orchestrator.scheduleNextHand("HAND_END", 2500);
    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(0);

    expect(requestDrive).toHaveBeenCalledWith("NEXT_HAND_TOURNAMENT_RECONCILE");
  });

  it("transitionToWaiting resets roundState to HAND_COMPLETE", () => {
    const state = createState();
    state.street = "RIVER";
    state.roundState = "WAITING_FOR_ACTION";
    let currentHand: HandContext | null = new HandContext();

    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: {
        startHand: async () => [],
        advanceStreetOrShowdown: async () => [],
        finishHandByLastStanding: async () => [],
        finishHandShowdownWithSidePots: async () => [],
      } as any,
      clearPendingHumanTurnTimeout: () => {},
      createHandContext: () => new HandContext(),
      setCurrentHand: (hand) => {
        currentHand = hand;
      },
      getCurrentHand: () => currentHand,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans: async () => {},
      requestDrive: async () => {},
      enqueueSerializedStateMutation: async (work) => work(),
      sendTableSnapshotToAll: async () => {},
      isDisposed: () => false,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    orchestrator.transitionToWaiting();

    expect(state.street).toBe("WAITING");
    expect(state.roundState).toBe("HAND_COMPLETE");
    expect(currentHand).toBeNull();
  });

  it("transitionToWaiting settles ALL_IN seats to ACTIVE/OUT from stacks", () => {
    const state = createState();
    state.street = "SHOWDOWN";
    addSeatedPlayer(state, "hero", 0);
    addSeatedPlayer(state, "bot", 1);
    state.playersById.get("hero")!.status = "ALL_IN";
    state.playersById.get("hero")!.stackCents = 5000;
    state.playersById.get("bot")!.status = "ALL_IN";
    state.playersById.get("bot")!.stackCents = 0;
    state.playersById.get("bot")!.roundBetCents = 200;

    const orchestrator = new HandOrchestrator({
      state,
      handLifecycleService: {
        startHand: async () => [],
        advanceStreetOrShowdown: async () => [],
        finishHandByLastStanding: async () => [],
        finishHandShowdownWithSidePots: async () => [],
      } as any,
      clearPendingHumanTurnTimeout: () => {},
      createHandContext: () => new HandContext(),
      setCurrentHand: () => {},
      getCurrentHand: () => null,
      initPreflopFlagsForHand: () => {},
      executeHandLifecyclePlans: async () => {},
      requestDrive: async () => {},
      enqueueSerializedStateMutation: async (work) => work(),
      sendTableSnapshotToAll: async () => {},
      isDisposed: () => false,
      getLastHandResult: () => undefined,
      getOnHandEndedAwards: () => undefined,
      getDealtHumanUserIds: () => [],
      recordSessionHandResult: () => {},
      getSessionState: () => ({ sessionId: "s1", sessionHands: 0, consecutiveWins: 0 }),
    });

    orchestrator.transitionToWaiting();

    expect(state.playersById.get("hero")?.status).toBe("ACTIVE");
    expect(state.playersById.get("bot")?.status).toBe("OUT");
    expect(state.playersById.get("bot")?.roundBetCents).toBe(0);
  });
});
