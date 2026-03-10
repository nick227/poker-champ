import { describe, expect, it, vi } from "vitest";
import pokersolver from "pokersolver";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): unknown;
    winners(hands: unknown[]): unknown[];
  };
};

type WeightedProfile = {
  foldRate: number;
  raiseRate: number;
  allInRate: number;
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

function getSeatOrderLeftOfDealer(state: PokerState): string[] {
  const order: string[] = [];
  for (let i = 1; i <= state.seats.length; i++) {
    const seat = (state.dealerSeat + i) % state.seats.length;
    const id = state.seats[seat];
    if (!id) continue;
    const player = state.playersById.get(id);
    if (player && player.status !== "OUT") order.push(id);
  }
  return order;
}

function splitTiePotWithOddChip(
  potCents: number,
  winnerIds: string[],
  seatOrderLeftOfDealer: string[],
): Map<string, number> {
  const payouts = new Map<string, number>();
  if (potCents <= 0 || winnerIds.length === 0) return payouts;

  const base = Math.floor(potCents / winnerIds.length);
  let remainder = potCents - base * winnerIds.length;
  for (const id of winnerIds) payouts.set(id, base);

  if (remainder > 0) {
    const winners = new Set(winnerIds);
    for (const id of seatOrderLeftOfDealer) {
      if (remainder <= 0) break;
      if (!winners.has(id)) continue;
      payouts.set(id, (payouts.get(id) ?? 0) + 1);
      remainder -= 1;
    }
  }

  return payouts;
}

function pickAction(
  rng: () => number,
  options: ReturnType<ActionOptionsService["buildHeroActionOptions"]>,
  profile: WeightedProfile,
): ActionPayload {
  if (!options) return { action: "FOLD" };

  if (options.canAllIn && rng() < profile.allInRate) {
    return { action: "ALL_IN" };
  }

  if (options.canRaise && rng() < profile.raiseRate) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    const raiseTo = randomIntInclusive(rng, min, max);
    return { action: "RAISE", amountCents: raiseTo };
  }

  if (options.canBet && rng() < profile.raiseRate) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    const betTo = randomIntInclusive(rng, min, max);
    return { action: "BET", amountCents: betTo };
  }

  if (options.canFold && rng() < profile.foldRate) return { action: "FOLD" };
  if (options.canCall) return { action: "CALL" };
  if (options.canCheck) return { action: "CHECK" };
  if (options.canAllIn) return { action: "ALL_IN" };
  if (options.canFold) return { action: "FOLD" };

  return { action: "CHECK" };
}

describe("payout randomized heads-up accuracy", () => {
  it("matches precalculated payouts across randomized full hands with raises/all-ins", async () => {
    const runs = 12;
    const profiles: WeightedProfile[] = [
      { foldRate: 0.08, raiseRate: 0.62, allInRate: 0.1 },
      { foldRate: 0.2, raiseRate: 0.45, allInRate: 0.2 },
      { foldRate: 0.05, raiseRate: 0.25, allInRate: 0.42 },
    ];

    let raiseCount = 0;
    let allInCount = 0;
    let showdownCount = 0;

    try {
      for (let seed = 1; seed <= runs; seed++) {
        const rng = mulberry32(seed);
        const profile = profiles[seed % profiles.length]!;

        const state = new PokerState();
        state.tableId = `table_payout_fuzz_${seed}`;
        state.maxSeats = 2;
        state.smallBlindCents = 50;
        state.bigBlindCents = 100;
        state.minBuyInCents = 200;
        state.maxBuyInCents = 100000;
        state.seats.push("u1", "u2");
        state.street = "WAITING";

        const stack1 = randomIntInclusive(rng, 200, 5000);
        const stack2 = randomIntInclusive(rng, 200, 5000);
        const p1 = makePlayer("u1", 0, stack1);
        const p2 = makePlayer("u2", 1, stack2);
        state.playersById.set("u1", p1);
        state.playersById.set("u2", p2);

        const openingStacks = new Map<string, number>([
          ["u1", stack1],
          ["u2", stack2],
        ]);

        const contributedByUserId = new Map<string, number>();
        const paidByUserId = new Map<string, number>();
        const trace: string[] = [];

        const persistence = {
          enabled: false,
          handHistory: null,
          postBlind: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
            contributedByUserId.set(args.userId, (contributedByUserId.get(args.userId) ?? 0) + args.amountCents);
            trace.push(`${args.userId}:POST_BLIND:${args.amountCents}`);
            return args.currentBalance - args.amountCents;
          },
          debitBet: async (args: { userId: string; currentBalance: number; amountCents: number; action: string }) => {
            contributedByUserId.set(args.userId, (contributedByUserId.get(args.userId) ?? 0) + args.amountCents);
            trace.push(`${args.userId}:${args.action}:${args.amountCents}`);
            return args.currentBalance - args.amountCents;
          },
          creditPayout: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
            paidByUserId.set(args.userId, (paidByUserId.get(args.userId) ?? 0) + args.amountCents);
            trace.push(`${args.userId}:PAYOUT:${args.amountCents}`);
            return args.currentBalance + args.amountCents;
          },
          assertHandBalanced: async () => {},
        } as any;

        const dealer = new Dealer(state, persistence);
        (dealer as any).scheduleNextHand = () => {};

        const optionsService = new ActionOptionsService();
        await (dealer as any).startHand();

        let guard = 0;
        while (state.street !== "WAITING" && guard < 300) {
          guard += 1;
          const toActId = state.seats[state.toActSeat];
          if (!toActId) break;

          const options = optionsService.buildHeroActionOptions(state, toActId);
          const action = pickAction(rng, options, profile);
          if (action.action === "RAISE" || action.action === "BET") raiseCount += 1;
          if (action.action === "ALL_IN") allInCount += 1;
          trace.push(`TURN:${toActId}:${action.action}${action.amountCents ? `:${action.amountCents}` : ""}`);

          await dealer.handleAction(toActId, action);
        }

        expect(guard, `seed=${seed} trace=${trace.join("|")}`).toBeLessThan(300);
        expect(state.street, `seed=${seed} trace=${trace.join("|")}`).toBe("WAITING");

        const handResult = (dealer as any).lastHandResult as
          | { reason: "LAST_PLAYER" | "SHOWDOWN"; payoutsByUserId: Record<string, number>; winnerId?: string; board: string[] }
          | undefined;
        expect(handResult, `seed=${seed} trace=${trace.join("|")}`).toBeDefined();

        const expectedPot = (contributedByUserId.get("u1") ?? 0) + (contributedByUserId.get("u2") ?? 0);
        const actualPaid = (paidByUserId.get("u1") ?? 0) + (paidByUserId.get("u2") ?? 0);
        expect(actualPaid, `seed=${seed} trace=${trace.join("|")}`).toBe(expectedPot);
        expect(state.potCents, `seed=${seed} trace=${trace.join("|")}`).toBe(expectedPot);

        const c1 = contributedByUserId.get("u1") ?? 0;
        const c2 = contributedByUserId.get("u2") ?? 0;
        const expectedPayout = new Map<string, number>();
        if (handResult?.reason === "LAST_PLAYER") {
          const winnerId = handResult.winnerId;
          if (!winnerId) throw new Error(`Missing winner in LAST_PLAYER seed=${seed}`);
          expectedPayout.set(winnerId, expectedPot);
        } else {
          showdownCount += 1;
          const board = handResult?.board ?? [];
          const h1 = (handResult as any)?.showdownHoleCardsByUserId?.u1 ?? [];
          const h2 = (handResult as any)?.showdownHoleCardsByUserId?.u2 ?? [];
          if (h1.length !== 2 || h2.length !== 2 || board.length !== 5) {
            throw new Error(`Invalid showdown cards seed=${seed} board=${board.join(",")} h1=${h1.join(",")} h2=${h2.join(",")}`);
          }

          const s1 = Hand.solve([...h1, ...board]);
          const s2 = Hand.solve([...h2, ...board]);
          const winners = Hand.winners([s1, s2]);
          const winnerIds: string[] = [];
          if (winners.includes(s1)) winnerIds.push("u1");
          if (winners.includes(s2)) winnerIds.push("u2");

          const contestedMainPot = Math.min(c1, c2) * 2;
          const sidePotUncontested = Math.abs(c1 - c2);
          if (sidePotUncontested > 0) {
            const sideWinnerId = c1 > c2 ? "u1" : "u2";
            expectedPayout.set(sideWinnerId, (expectedPayout.get(sideWinnerId) ?? 0) + sidePotUncontested);
          }

          const split = splitTiePotWithOddChip(contestedMainPot, winnerIds, getSeatOrderLeftOfDealer(state));
          for (const [id, amount] of split.entries()) {
            expectedPayout.set(id, (expectedPayout.get(id) ?? 0) + amount);
          }
        }

        const actualMap = new Map<string, number>([
          ["u1", paidByUserId.get("u1") ?? 0],
          ["u2", paidByUserId.get("u2") ?? 0],
        ]);
        const expectedMap = new Map<string, number>([
          ["u1", expectedPayout.get("u1") ?? 0],
          ["u2", expectedPayout.get("u2") ?? 0],
        ]);
        expect(
          Object.fromEntries(actualMap),
          `seed=${seed} profile=${JSON.stringify(profile)} reason=${handResult?.reason} c1=${c1} c2=${c2} expected=${JSON.stringify(Object.fromEntries(expectedMap))} trace=${trace.join("|")}`,
        ).toEqual(Object.fromEntries(expectedMap));

        for (const id of ["u1", "u2"]) {
          const player = state.playersById.get(id)!;
          const expectedEndingStack =
            (openingStacks.get(id) ?? 0) -
            (contributedByUserId.get(id) ?? 0) +
            (paidByUserId.get(id) ?? 0);
          expect(player.stackCents, `seed=${seed} user=${id} trace=${trace.join("|")}`).toBe(expectedEndingStack);
          expect(player.stackCents, `seed=${seed} user=${id} trace=${trace.join("|")}`).toBeGreaterThanOrEqual(0);
        }
      }
    } finally {
      // no-op
    }

    expect(raiseCount).toBeGreaterThan(4);
    expect(allInCount).toBeGreaterThan(2);
    expect(showdownCount).toBeGreaterThan(2);
  }, 90_000);
});

