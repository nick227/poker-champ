import { describe, expect, it, vi } from "vitest";
import type { ActionPayload } from "@poker-champ/api-types";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/services/ActionOptionsService.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

function makePlayer(id: string, seat: number, stackCents: number): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = "HUMAN";
  p.name = id;
  p.seat = seat;
  p.status = "ACTIVE";
  p.stackCents = stackCents;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = false;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

function pickRandomLegalAction(
  rng: () => number,
  options: ReturnType<ActionOptionsService["buildHeroActionOptions"]>,
): ActionPayload {
  if (!options) return { action: "FOLD" };
  const legal: ActionPayload[] = [];
  if (options.canFold) legal.push({ action: "FOLD" });
  if (options.canCheck) legal.push({ action: "CHECK" });
  if (options.canCall) legal.push({ action: "CALL" });
  if (options.canBet) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    legal.push({ action: "BET", amountCents: randomIntInclusive(rng, min, max) });
  }
  if (options.canRaise) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    legal.push({ action: "RAISE", amountCents: randomIntInclusive(rng, min, max) });
  }
  if (options.canAllIn) legal.push({ action: "ALL_IN" });
  if (legal.length === 0) return { action: "FOLD" };
  return legal[randomIntInclusive(rng, 0, legal.length - 1)]!;
}

function sumStacks(state: PokerState): number {
  return [...state.playersById.values()].reduce((sum, p) => sum + p.stackCents, 0);
}

describe("dealer fuzz invariants (ci)", () => {
  it("seeded random walk preserves money and non-negative stacks", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0 as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    );

    try {
    const seeds = [20260305];
    const actionBudgetPerSeed = 40;

    for (const seed of seeds) {
      const rng = mulberry32(seed);
      const state = new PokerState();
      state.tableId = `table_fuzz_ci_${seed}`;
      state.maxSeats = 4;
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.minBuyInCents = 200;
      state.maxBuyInCents = 20000;
      state.seats.push("u1", "u2", "u3", "u4");
      state.street = "WAITING";

      state.playersById.set("u1", makePlayer("u1", 0, 5000));
      state.playersById.set("u2", makePlayer("u2", 1, 5000));
      state.playersById.set("u3", makePlayer("u3", 2, 5000));
      state.playersById.set("u4", makePlayer("u4", 3, 5000));

      const initialChipMass = sumStacks(state);
      const dealer = new Dealer(state, {
        enabled: false,
        handHistory: null,
        postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
        debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
        creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
        creditRefund: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
        assertHandBalanced: async () => {},
      } as any);
      (dealer as any).scheduleNextHand = () => {};
      (dealer as any).scheduleHumanTurnTimeout = () => {};

      const optionsService = new ActionOptionsService();

      for (let step = 0; step < actionBudgetPerSeed; step += 1) {
        const activeWithChips = [...state.playersById.values()].filter((p) => p.status !== "OUT" && p.stackCents > 0);
        if (state.street === "WAITING") {
          if (activeWithChips.length < 2) break;
          await (dealer as any).startHand();
        }

        const toActId = state.seats[state.toActSeat];
        if (!toActId) break;
        const options = optionsService.buildHeroActionOptions(state, toActId);
        const action = pickRandomLegalAction(rng, options);
        await dealer.handleAction(toActId, action);

        const stacksOnly = sumStacks(state);
        expect(stacksOnly).toBeLessThanOrEqual(initialChipMass);
        expect(state.potCents).toBeGreaterThanOrEqual(0);

        if (state.street === "PREFLOP" || state.street === "FLOP" || state.street === "TURN" || state.street === "RIVER") {
          expect(stacksOnly + state.potCents).toBeLessThanOrEqual(initialChipMass);
        }

        for (const player of state.playersById.values()) {
          expect(player.stackCents).toBeGreaterThanOrEqual(0);
        }
      }
    }
    } finally {
      setTimeoutSpy.mockRestore();
    }
  }, 120_000);
});
