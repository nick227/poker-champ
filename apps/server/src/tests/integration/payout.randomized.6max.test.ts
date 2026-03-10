import { describe, expect, it, vi } from "vitest";
import pokersolver from "pokersolver";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";
import { buildSidePots, splitPotCents } from "../../engine/rules/SidePotManager.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): unknown;
    winners(hands: unknown[]): unknown[];
  };
};

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

function seatOrderLeftOfDealer(state: PokerState): string[] {
  const out: string[] = [];
  for (let i = 1; i <= state.seats.length; i++) {
    const seat = (state.dealerSeat + i) % state.seats.length;
    const id = state.seats[seat];
    if (!id) continue;
    const p = state.playersById.get(id);
    if (p && p.status !== "OUT") out.push(id);
  }
  return out;
}

function pickRandomWeightedAction(
  rng: () => number,
  options: ReturnType<ActionOptionsService["buildHeroActionOptions"]>,
): ActionPayload {
  if (!options) return { action: "FOLD" };

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
  // Keep this 6-max oracle test deterministic/stable; all-in fuzzing is covered elsewhere.
  if (options.canAllIn && options.canCall) return { action: "CALL" };
  if (options.canFold) return { action: "FOLD" };
  return { action: "CHECK" };
}

describe("payout randomized 6-max accuracy", () => {
  it("matches precalculated payouts across randomized 6-player hands", async () => {
    const rng = mulberry32(602026);
    try {
      const state = new PokerState();
      state.tableId = "table_payout_fuzz_6max";
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

      const contributedByUserId = new Map<string, number>();
      const paidByUserId = new Map<string, number>();
      const persistence = {
        enabled: false,
        handHistory: null,
        postBlind: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          contributedByUserId.set(args.userId, (contributedByUserId.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance - args.amountCents;
        },
        debitBet: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          contributedByUserId.set(args.userId, (contributedByUserId.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance - args.amountCents;
        },
        creditPayout: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          paidByUserId.set(args.userId, (paidByUserId.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance + args.amountCents;
        },
        assertHandBalanced: async () => {},
      } as any;

      const dealer = new Dealer(state, persistence);
      (dealer as any).scheduleNextHand = () => {};
      const optionsService = new ActionOptionsService();

      const handsToPlay = 6;
      let handsPlayed = 0;
      let showdownHands = 0;
      let raiseOrBetCount = 0;

      for (let handNo = 1; handNo <= handsToPlay; handNo++) {
        const beforeContrib = new Map(contributedByUserId);
        const beforePaid = new Map(paidByUserId);
        const beforeStacks = new Map<string, number>();
        for (const [id, p] of state.playersById.entries()) beforeStacks.set(id, p.stackCents);

        await (dealer as any).startHand();
        if (state.street === "WAITING" || !state.handId) break;
        handsPlayed += 1;
        const trace: string[] = [`hand=${handNo}`, `handId=${state.handId}`];

        let guard = 0;
        while (state.street !== "WAITING") {
          guard += 1;
          if (guard >= 800) throw new Error(`Infinite loop: ${trace.join("|")}`);

          const toActId = state.seats[state.toActSeat];
          if (!toActId) throw new Error(`Missing toActId: ${trace.join("|")}`);
          const options = optionsService.buildHeroActionOptions(state, toActId);
          expect(options, `missing options for ${toActId}, ${trace.join("|")}`).toBeTruthy();
          const action = pickRandomWeightedAction(rng, options);
          if (action.action === "BET" || action.action === "RAISE") raiseOrBetCount += 1;
          trace.push(`${toActId}:${action.action}${action.amountCents ? `:${action.amountCents}` : ""}`);
          await dealer.handleAction(toActId, action);
        }

        const handResult = (dealer as any).lastHandResult as
          | {
              reason: "LAST_PLAYER" | "SHOWDOWN";
              winnerId?: string;
              board?: string[];
              payoutsByUserId: Record<string, number>;
              showdownHoleCardsByUserId?: Record<string, [string, string]>;
            }
          | undefined;
        expect(handResult, `missing hand result ${trace.join("|")}`).toBeDefined();

        const handContribByUser = new Map<string, number>();
        const handPayoutByUser = new Map<string, number>();
        for (const [id] of state.playersById.entries()) {
          handContribByUser.set(id, (contributedByUserId.get(id) ?? 0) - (beforeContrib.get(id) ?? 0));
          handPayoutByUser.set(id, (paidByUserId.get(id) ?? 0) - (beforePaid.get(id) ?? 0));
        }
        const handContrib = [...handContribByUser.values()].reduce((a, b) => a + b, 0);
        const handPayout = [...handPayoutByUser.values()].reduce((a, b) => a + b, 0);
        expect(handPayout, `conservation mismatch ${trace.join("|")}`).toBe(handContrib);

        const expectedByUser = new Map<string, number>();
        if (handResult?.reason === "LAST_PLAYER") {
          const winnerId = handResult.winnerId;
          if (!winnerId) throw new Error(`Missing winnerId for LAST_PLAYER ${trace.join("|")}`);
          expectedByUser.set(winnerId, handContrib);
        } else {
          showdownHands += 1;
          const board = handResult?.board ?? [];
          if (board.length !== 5) throw new Error(`Invalid showdown board ${trace.join("|")}`);

          const eligibleIds = new Set<string>(Object.keys(handResult?.showdownHoleCardsByUserId ?? {}));
          const pseudoPlayers = [...state.playersById.keys()].map((id) => {
            const p = new PlayerState();
            p.id = id;
            p.committedCents = handContribByUser.get(id) ?? 0;
            p.status = eligibleIds.has(id) ? "ACTIVE" : "FOLDED";
            return p;
          });
          const pots = buildSidePots(
            pseudoPlayers,
            pseudoPlayers.filter((p) => p.status === "ACTIVE"),
          );
          const seatOrder = seatOrderLeftOfDealer(state);

          const solved = new Map<string, unknown>();
          for (const id of eligibleIds) {
            const hole = (handResult?.showdownHoleCardsByUserId ?? {})[id];
            if (!hole) continue;
            solved.set(id, Hand.solve([hole[0], hole[1], ...board]));
          }

          for (const pot of pots) {
            if (pot.eligiblePlayerIds.length === 0) continue;
            const contenders = pot.eligiblePlayerIds.filter((id) => solved.has(id));
            if (contenders.length === 0) continue;
            const winners = Hand.winners(contenders.map((id) => solved.get(id)!));
            const winnerIds = contenders.filter((id) => winners.includes(solved.get(id)!));
            const split = splitPotCents(pot.amountCents, winnerIds, seatOrder);
            for (const [id, amount] of split.entries()) {
              expectedByUser.set(id, (expectedByUser.get(id) ?? 0) + amount);
            }
          }

          const expectedSumBeforeReconcile = [...expectedByUser.values()].reduce((a, b) => a + b, 0);
          if (expectedSumBeforeReconcile < handContrib && eligibleIds.size > 0) {
            const remainder = handContrib - expectedSumBeforeReconcile;
            const seatOrderIndex = new Map<string, number>();
            seatOrder.forEach((id, idx) => seatOrderIndex.set(id, idx));
            const fallbackRecipientId = [...eligibleIds].sort((a, b) => {
              const byCommit = (handContribByUser.get(b) ?? 0) - (handContribByUser.get(a) ?? 0);
              if (byCommit !== 0) return byCommit;
              const ai = seatOrderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
              const bi = seatOrderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
              return ai - bi;
            })[0];
            if (fallbackRecipientId) {
              expectedByUser.set(fallbackRecipientId, (expectedByUser.get(fallbackRecipientId) ?? 0) + remainder);
            }
          }
        }

        const expectedSum = [...expectedByUser.values()].reduce((a, b) => a + b, 0);
        expect(expectedSum, `expected sum mismatch ${trace.join("|")}`).toBe(handContrib);

        for (const [id, player] of state.playersById.entries()) {
          const actual = handPayoutByUser.get(id) ?? 0;
          const expected = expectedByUser.get(id) ?? 0;
          expect(actual, `payout mismatch user=${id} ${trace.join("|")}`).toBe(expected);

          const expectedEndingStack = (beforeStacks.get(id) ?? 0) - (handContribByUser.get(id) ?? 0) + actual;
          expect(player.stackCents, `stack mismatch user=${id} ${trace.join("|")}`).toBe(expectedEndingStack);
          expect(player.stackCents, `negative stack user=${id} ${trace.join("|")}`).toBeGreaterThanOrEqual(0);
        }
      }

      expect(handsPlayed).toBeGreaterThan(1);
      expect(raiseOrBetCount).toBeGreaterThan(2);
      expect(showdownHands).toBeGreaterThanOrEqual(1);
    } finally {
      // no-op
    }
  }, 180_000);
});

