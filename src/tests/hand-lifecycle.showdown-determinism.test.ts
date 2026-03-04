import { describe, expect, it } from "vitest";
import { HandLifecycleService } from "../engine/dealer/services/HandLifecycleService.js";
import { PlayerState } from "../state/PlayerState.js";
import { PokerState } from "../state/PokerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  committedCents: number;
  stackCents?: number;
  status?: PlayerState["status"];
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.status = input.status ?? "ALL_IN";
  p.stackCents = input.stackCents ?? 0;
  p.roundBetCents = input.committedCents;
  p.committedCents = input.committedCents;
  p.needsAction = false;
  p.connected = true;
  return p;
}

function makeLifecycleHarness() {
  const state = new PokerState();
  state.tableId = "table_showdown_determinism";
  state.street = "SHOWDOWN";
  state.runoutMode = "STAGED";
  state.handId = "hand_showdown_determinism";
  state.dealerSeat = 0;

  const holeCardsByPlayerId = new Map<string, string[]>();
  const handStartingStacksByPlayerId = new Map<string, number>();
  const processedActionIds = new Set<string>();
  const currentHandAutoActedUserIds = new Set<string>();
  const payoutCalls: Array<{ id: string; amount: number }> = [];
  let lastHandResult: any | undefined;
  let disbursedCents = 0;

  const service = new HandLifecycleService({
    state,
    persistence: {
      enabled: false,
      assertHandBalanced: async () => {},
    } as any,
    settlementService: {
      creditPayoutToPlayer: async (player: PlayerState, amountCents: number) => {
        player.stackCents += amountCents;
        disbursedCents += amountCents;
        payoutCalls.push({ id: player.id, amount: amountCents });
      },
      finalizePersistedHand: async () => {},
      getCurrentHandPotDisbursedCents: () => disbursedCents,
    } as any,
    getHoleCardsByPlayerId: () => holeCardsByPlayerId,
    getHandStartingStacksByPlayerId: () => handStartingStacksByPlayerId,
    currentHandAutoActedUserIds,
    getProcessedActionIds: () => processedActionIds,
    applyDisconnectedAutoActionCapForHand: async () => {},
    setLastHandResult: (value) => {
      lastHandResult = value;
    },
    setLastAction: () => {},
  });

  return { service, state, holeCardsByPlayerId, payoutCalls, getLastHandResult: () => lastHandResult };
}

describe("HandLifecycleService showdown determinism", () => {
  it("pays entire uneven side-pot ladder to the same winner deterministically", async () => {
    const { service, state, holeCardsByPlayerId, payoutCalls, getLastHandResult } = makeLifecycleHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 100 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 300 });
    const c = makePlayer({ id: "C", seat: 2, committedCents: 500 });
    state.seats.push(a.id, b.id, c.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.playersById.set(c.id, c);
    state.potCents = 900;
    state.board.push("2c", "3d", "4h", "5s", "9d");

    holeCardsByPlayerId.set(a.id, ["As", "Ad"]);
    holeCardsByPlayerId.set(b.id, ["Kh", "Kd"]);
    holeCardsByPlayerId.set(c.id, ["6c", "7c"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;
    const plans = await service.finishHandShowdownWithSidePots();

    expect(payoutCalls).toEqual([{ id: "C", amount: 900 }]);
    expect(getLastHandResult()?.payoutsByUserId).toEqual({ C: 900 });
    expect(getLastHandResult()?.showdownHoleCardsByUserId).toEqual({
      A: ["As", "Ad"],
      B: ["Kh", "Kd"],
      C: ["6c", "7c"],
    });
    expect(plans.some((p) => p.kind === "HAND_ENDED" && p.reason === "SHOWDOWN")).toBe(true);
  });

  it("splits odd chips by seat order left of dealer and remains deterministic", async () => {
    const { service, state, holeCardsByPlayerId, payoutCalls, getLastHandResult } = makeLifecycleHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 101 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 101 });
    const c = makePlayer({ id: "C", seat: 2, committedCents: 300 });
    state.seats.push(a.id, b.id, c.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.playersById.set(c.id, c);
    state.potCents = 502;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");

    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["As", "4d"]);
    holeCardsByPlayerId.set(c.id, ["9h", "8h"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const sortedPayouts = [...payoutCalls].sort((x, y) => x.id.localeCompare(y.id));
    expect(sortedPayouts).toEqual([
      { id: "A", amount: 151 },
      { id: "B", amount: 152 },
      { id: "C", amount: 199 },
    ]);
    expect(getLastHandResult()?.payoutsByUserId).toEqual({ A: 151, B: 152, C: 199 });
    expect(getLastHandResult()?.showdownHoleCardsByUserId).toEqual({
      A: ["Ac", "4c"],
      B: ["As", "4d"],
      C: ["9h", "8h"],
    });
  });
});

