import { describe, expect, it, vi } from "vitest";
import type { ActionPayload } from "../messages/schemas.js";
import { Dealer } from "../engine/Dealer.js";
import { ActionOptionsService } from "../engine/dealer/services/ActionOptionsService.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

const isNightlySoak = process.env.SOAK_PROFILE === "nightly";

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

describe("dealer random walk soak", () => {
  it("plays many hands without deadlock and preserves per-hand payout conservation", async () => {
    const rng = mulberry32(20260219);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0 as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    );

    try {
      const state = new PokerState();
      state.tableId = "table_soak_random_walk";
      state.maxSeats = 3;
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.minBuyInCents = 200;
      state.maxBuyInCents = 100000;
      state.seats.push("u1", "u2", "u3");
      state.street = "WAITING";

      state.playersById.set("u1", makePlayer("u1", 0, 6000));
      state.playersById.set("u2", makePlayer("u2", 1, 6000));
      state.playersById.set("u3", makePlayer("u3", 2, 6000));

      const contributionsByUser = new Map<string, number>();
      const payoutsByUser = new Map<string, number>();
      const snapshots: number[] = [];

      const persistence = {
        enabled: false,
        handHistory: null,
        postBlind: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          contributionsByUser.set(args.userId, (contributionsByUser.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance - args.amountCents;
        },
        debitBet: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          contributionsByUser.set(args.userId, (contributionsByUser.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance - args.amountCents;
        },
        creditPayout: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          payoutsByUser.set(args.userId, (payoutsByUser.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance + args.amountCents;
        },
        creditRefund: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
          payoutsByUser.set(args.userId, (payoutsByUser.get(args.userId) ?? 0) + args.amountCents);
          return args.currentBalance + args.amountCents;
        },
        assertHandBalanced: async () => {},
      } as any;

      const dealer = new Dealer(state, persistence, {
        onTableSnapshotEmitted: ({ payloadJson }) => {
          snapshots.push(payloadJson.snapshotSeq);
        },
      });
      (dealer as any).scheduleNextHand = () => {};
      // This soak test drives actions explicitly; with setTimeout mocked to immediate,
      // turn-timeout automation would preempt the random-walk driver.
      (dealer as any).scheduleHumanTurnTimeout = () => {};

      const optionsService = new ActionOptionsService();
      const handsToPlay = isNightlySoak ? 100 : 5;

      for (let h = 0; h < handsToPlay; h++) {
        const activeWithChips = [...state.playersById.values()].filter((p) => p.status !== "OUT" && p.stackCents > 0);
        if (activeWithChips.length < 2) break;

        const beforeContrib = new Map(contributionsByUser);
        const beforePayout = new Map(payoutsByUser);
        await (dealer as any).startHand();

        expect(state.street).toBe("PREFLOP");
        expect(state.board.length).toBe(0);

        const trace: string[] = [`hand=${h + 1}`, `handId=${state.handId}`];
        let guard = 0;
        while (state.street !== "WAITING") {
          guard += 1;
          if (guard >= 400) {
            throw new Error(`Infinite loop detected: ${trace.join("|")}`);
          }

          const toActId = state.seats[state.toActSeat];
          if (!toActId) {
            throw new Error(`Missing toAct user: ${trace.join("|")}`);
          }

          const options = optionsService.buildHeroActionOptions(state, toActId);
          expect(options, `options missing for toAct=${toActId} ${trace.join("|")}`).toBeTruthy();
          const action = pickRandomLegalAction(rng, options);
          trace.push(`${toActId}:${action.action}${action.amountCents ? `:${action.amountCents}` : ""}`);
          await dealer.handleAction(toActId, action);
        }

        const handContrib = [...contributionsByUser.entries()].reduce(
          (sum, [id, amount]) => sum + (amount - (beforeContrib.get(id) ?? 0)),
          0,
        );
        const handPayout = [...payoutsByUser.entries()].reduce(
          (sum, [id, amount]) => sum + (amount - (beforePayout.get(id) ?? 0)),
          0,
        );
        expect(handPayout, `payout mismatch ${trace.join("|")}`).toBe(handContrib);
      }

      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i]!).toBeGreaterThan(snapshots[i - 1]!);
      }

      for (const p of state.playersById.values()) {
        expect(p.stackCents).toBeGreaterThanOrEqual(0);
      }
    } finally {
      setTimeoutSpy.mockRestore();
    }
  }, isNightlySoak ? 300_000 : 120_000);
});
