import { describe, expect, it, vi } from "vitest";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";
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

function pickRandomWeightedActionWithAllIns(
  rng: () => number,
  options: ReturnType<ActionOptionsService["buildHeroActionOptions"]>,
): ActionPayload {
  if (!options) return { action: "FOLD" };
  if (options.canAllIn && rng() < 0.12) return { action: "ALL_IN" };
  if (options.canRaise && rng() < 0.34) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    return { action: "RAISE", amountCents: randomIntInclusive(rng, min, max) };
  }
  if (options.canBet && rng() < 0.30) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    return { action: "BET", amountCents: randomIntInclusive(rng, min, max) };
  }
  if (options.canFold && rng() < 0.18) return { action: "FOLD" };
  if (options.canCall) return { action: "CALL" };
  if (options.canCheck) return { action: "CHECK" };
  if (options.canAllIn) return { action: "ALL_IN" };
  if (options.canFold) return { action: "FOLD" };
  return { action: "CHECK" };
}

describe.skip("known bug repro: 6-max all-in toAct invariant", () => {
  it("reproduces toActSeat invariant failure with deterministic seed/trace", async () => {
    const rng = mulberry32(602026);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
    );

    try {
      const state = new PokerState();
      state.tableId = "table_known_bug_allin_toact";
      state.maxSeats = 6;
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.minBuyInCents = 200;
      state.maxBuyInCents = 200000;
      state.street = "WAITING";
      for (let i = 0; i < 6; i++) {
        const id = `u${i + 1}`;
        state.seats.push(id);
        state.playersById.set(id, makePlayer(id, i, randomIntInclusive(rng, 2500, 12000)));
      }

      const persistence = {
        enabled: false,
        handHistory: null,
        postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
        debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
        creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
        assertHandBalanced: async () => {},
      } as any;

      const dealer = new Dealer(state, persistence);
      (dealer as any).scheduleNextHand = () => {};
      const optionsService = new ActionOptionsService();

      const handLimit = 6;
      const trace: string[] = [];

      for (let hand = 1; hand <= handLimit; hand++) {
        await (dealer as any).startHand();
        if (state.street === "WAITING") break;
        trace.push(`HAND:${hand}:${state.handId}`);

        let guard = 0;
        while (state.street !== "WAITING") {
          guard += 1;
          if (guard > 800) {
            throw new Error(`Guard overflow before repro. Trace=${trace.join("|")}`);
          }
          const toActId = state.seats[state.toActSeat];
          if (!toActId) throw new Error(`Missing toAct before repro. Trace=${trace.join("|")}`);
          const options = optionsService.buildHeroActionOptions(state, toActId);
          const action = pickRandomWeightedActionWithAllIns(rng, options);
          trace.push(`${toActId}:${action.action}${action.amountCents ? `:${action.amountCents}` : ""}`);
          try {
            await dealer.handleAction(toActId, action);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("BETTING_INVARIANT_VIOLATION: toActSeat must reference an eligible ACTIVE player")) {
              expect(message).toContain("toActSeat must reference an eligible ACTIVE player");
              return;
            }
            throw new Error(`Unexpected error while reproducing bug: ${message}. Trace=${trace.join("|")}`);
          }
        }
      }

      throw new Error(`Did not reproduce known all-in invariant bug. Trace=${trace.join("|")}`);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  }, 120_000);
});

