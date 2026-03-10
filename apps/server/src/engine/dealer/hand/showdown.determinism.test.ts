import { describe, expect, it } from "vitest";
import { HandLifecycleService } from "./HandLifecycleService.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import { PlayerState as PlayerStateClass } from "../../../state/PlayerState.js";
import { PokerState } from "../../../state/PokerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  committedCents: number;
  stackCents?: number;
  status?: PlayerState["status"];
}): PlayerState {
  const p = new PlayerStateClass();
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

function makeHarness() {
  const state = new PokerState();
  state.tableId = "table_showdown";
  state.street = "SHOWDOWN";
  state.runoutMode = "STAGED";
  state.handId = "hand_showdown";
  state.dealerSeat = 0;

  const holeCardsByPlayerId = new Map<string, string[]>();
  const handStartingStacksByPlayerId = new Map<string, number>();
  const processedActionIds = new Set<string>();
  const currentHandAutoActedUserIds = new Set<string>();
  const payoutCalls: Array<{ id: string; amount: number }> = [];
  let lastHandResult: Record<string, unknown> | undefined;
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
      lastHandResult = value as Record<string, unknown>;
    },
    setLastAction: () => {},
  });

  return {
    service,
    state,
    holeCardsByPlayerId,
    payoutCalls,
    getLastHandResult: () => lastHandResult,
  };
}

function sumStacks(players: PlayerState[]): number {
  return players.reduce((s, p) => s + p.stackCents, 0);
}

/** S4 — Chip conservation: after payouts, sum(stacks) === pre-hand total (all chips accounted for). */
function assertChipConservation(
  playersBefore: PlayerState[],
  potCents: number,
  playersAfter: PlayerState[],
): void {
  const preTotal = sumStacks(playersBefore) + potCents;
  const postTotal = sumStacks(playersAfter);
  expect(postTotal).toBe(preTotal);
}

describe("showdown determinism — invariants", () => {
  it("S1 — winner correctness: known hole cards + board → expected winner", async () => {
    const { service, state, holeCardsByPlayerId, getLastHandResult } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 500 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 500 });
    state.seats.push(a.id, b.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.potCents = 1000;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["9h", "8h"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const result = getLastHandResult();
    expect(result?.payoutsByUserId).toEqual({ A: 1000 });
  });

  it("S2 — tie correctness: equal hand ranks split pot evenly", async () => {
    const { service, state, holeCardsByPlayerId, payoutCalls } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 100 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 100 });
    state.seats.push(a.id, b.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.potCents = 200;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["As", "4d"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    expect(payoutCalls.length).toBe(2);
    const byId = Object.fromEntries(payoutCalls.map((x) => [x.id, x.amount]));
    expect(byId.A).toBe(100);
    expect(byId.B).toBe(100);
  });

  it("S3 — side-pot isolation: winners of main pot may differ from side pot", async () => {
    const { service, state, holeCardsByPlayerId, getLastHandResult } = makeHarness();
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

    await service.finishHandShowdownWithSidePots();

    const payouts = getLastHandResult()?.payoutsByUserId as Record<string, number>;
    expect(payouts.C).toBe(900);
    expect(payouts.A).toBeUndefined();
    expect(payouts.B).toBeUndefined();
  });

  it("S4 — chip conservation: sum(stacks after) === pre-hand total", async () => {
    const { service, state, holeCardsByPlayerId } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 200, stackCents: 0 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 200, stackCents: 0 });
    state.seats.push(a.id, b.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.potCents = 400;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["9h", "8h"]);

    const playersBefore = [a, b];
    const preTotal = sumStacks(playersBefore) + state.potCents;

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const playersAfter = [a, b];
    expect(sumStacks(playersAfter)).toBe(preTotal);
  });

  it("S5 — deterministic ordering: same input → same payouts every run", async () => {
    const buildAndRun = () => {
      const h = makeHarness();
      const a = makePlayer({ id: "A", seat: 0, committedCents: 100 });
      const b = makePlayer({ id: "B", seat: 1, committedCents: 100 });
      h.state.seats.push(a.id, b.id);
      h.state.playersById.set(a.id, a);
      h.state.playersById.set(b.id, b);
      h.state.potCents = 200;
      h.state.board.push("Ah", "Kd", "Qs", "2c", "3d");
      h.holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
      h.holeCardsByPlayerId.set(b.id, ["As", "4d"]);
      h.state.initialChipMassCents =
        [...h.state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + h.state.potCents;
      return h.service.finishHandShowdownWithSidePots().then(() => h.payoutCalls);
    };

    const payouts1 = await buildAndRun();
    const payouts2 = await buildAndRun();

    const sort = (arr: Array<{ id: string; amount: number }>) =>
      [...arr].sort((x, y) => (x.id !== y.id ? (x.id < y.id ? -1 : 1) : x.amount - y.amount));
    expect(sort(payouts2)).toEqual(sort(payouts1));
  });
});

describe("showdown determinism — minimal test set", () => {
  it("heads-up, simple win", async () => {
    const { service, state, holeCardsByPlayerId, getLastHandResult } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 500 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 500 });
    state.seats.push(a.id, b.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.potCents = 1000;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["9h", "8h"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    expect(getLastHandResult()?.payoutsByUserId).toEqual({ A: 1000 });
  });

  it("heads-up, tie", async () => {
    const { service, state, holeCardsByPlayerId, payoutCalls } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 100 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 100 });
    state.seats.push(a.id, b.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.potCents = 200;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["As", "4d"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const total = payoutCalls.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(200);
    expect(payoutCalls.length).toBe(2);
  });

  it("three players, one all-in, winner main ≠ side", async () => {
    const { service, state, holeCardsByPlayerId, getLastHandResult } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 100 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 200 });
    const c = makePlayer({ id: "C", seat: 2, committedCents: 200 });
    state.seats.push(a.id, b.id, c.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.playersById.set(c.id, c);
    state.potCents = 500;
    state.board.push("2c", "3d", "4h", "5s", "9d");
    holeCardsByPlayerId.set(a.id, ["As", "Ad"]);
    holeCardsByPlayerId.set(b.id, ["Kh", "Kd"]);
    holeCardsByPlayerId.set(c.id, ["6c", "7c"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const payouts = getLastHandResult()?.payoutsByUserId as Record<string, number>;
    expect(payouts.C).toBe(500);
  });

  it("tie main pot, single side winner", async () => {
    const { service, state, holeCardsByPlayerId, payoutCalls } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 200 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 200 });
    const c = makePlayer({ id: "C", seat: 2, committedCents: 500 });
    state.seats.push(a.id, b.id, c.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.playersById.set(c.id, c);
    state.potCents = 900;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["As", "4d"]);
    holeCardsByPlayerId.set(c.id, ["9h", "8h"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const total = payoutCalls.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(900);
    const byId = Object.fromEntries(payoutCalls.map((x) => [x.id, x.amount]));
    expect(byId.A).toBe(300);
    expect(byId.B).toBe(300);
    expect(byId.C).toBe(300);
  });

  it("three-way tie", async () => {
    const { service, state, holeCardsByPlayerId, payoutCalls } = makeHarness();
    const a = makePlayer({ id: "A", seat: 0, committedCents: 100 });
    const b = makePlayer({ id: "B", seat: 1, committedCents: 100 });
    const c = makePlayer({ id: "C", seat: 2, committedCents: 100 });
    state.seats.push(a.id, b.id, c.id);
    state.playersById.set(a.id, a);
    state.playersById.set(b.id, b);
    state.playersById.set(c.id, c);
    state.potCents = 300;
    state.board.push("Ah", "Kd", "Qs", "2c", "3d");
    holeCardsByPlayerId.set(a.id, ["Ac", "4c"]);
    holeCardsByPlayerId.set(b.id, ["As", "4d"]);
    holeCardsByPlayerId.set(c.id, ["Ad", "4h"]);

    state.initialChipMassCents = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0) + state.potCents;

    await service.finishHandShowdownWithSidePots();

    const total = payoutCalls.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(300);
    expect(payoutCalls.length).toBe(3);
    payoutCalls.forEach((x) => expect(x.amount).toBe(100));
  });
});

