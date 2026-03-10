import { describe, expect, it, vi } from "vitest";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";
import { PokerError } from "../../engine/errors.js";
import { bettingRoundComplete, noFurtherBettingPossible } from "../../engine/rules/BettingRound.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

const isNightlySoak = process.env.SOAK_PROFILE === "nightly";
const configuredHands = Number(process.env.SOAK_HANDS ?? "");

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

function makePlayer(id: string, seat: number, stackCents: number, kind: "HUMAN" | "BOT" = "HUMAN"): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = kind;
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
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
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
      const settlementService = (dealer as any).settlementService as {
        getCurrentHandPotDisbursedCents: () => number;
      };
      const computeChipMass = () =>
        [...state.playersById.values()].reduce((sum, p) => sum + p.stackCents, 0) +
        state.potCents -
        settlementService.getCurrentHandPotDisbursedCents();
      let expectedChipMass = computeChipMass();
      (dealer as any).scheduleNextHand = () => {};
      // This soak test drives actions explicitly; with setTimeout mocked to immediate,
      // turn-timeout automation would preempt the random-walk driver.
      (dealer as any).scheduleHumanTurnTimeout = () => {};

      const optionsService = new ActionOptionsService();
      const handsToPlay = Number.isFinite(configuredHands) && configuredHands > 0
        ? Math.floor(configuredHands)
        : (isNightlySoak ? 100 : 5);
      let handsStarted = 0;
      let handsCompleted = 0;
      let maxStepsPerHand = 0;

      for (let h = 0; h < handsToPlay; h++) {
        const activeWithChips = [...state.playersById.values()].filter((p) => p.status !== "OUT" && p.stackCents > 0);
        if (activeWithChips.length < 2) {
          // Long-run soak mode: recycle player stacks so the harness can keep exercising lifecycle paths.
          for (const p of state.playersById.values()) {
            if (p.seat < 0) continue;
            if (p.stackCents <= 0) p.stackCents = 6000;
            p.status = "ACTIVE";
            p.roundBetCents = 0;
            p.committedCents = 0;
            p.needsAction = false;
            p.connected = true;
            p.disconnectDeadlineTs = 0;
            p.sittingOutUntilNextHand = false;
          }
          expectedChipMass = computeChipMass();
        }

        // Between hands, previous hand should be fully settled (no residual undistributed chips).
        expect(state.street).toBe("WAITING");
        expect(settlementService.getCurrentHandPotDisbursedCents()).toBe(state.potCents);

        const beforeContrib = new Map(contributionsByUser);
        const beforePayout = new Map(payoutsByUser);
        await (dealer as any).startHand();
        if (state.street === "WAITING") {
          // Long churn runs can exhaust/sit-out players mid-loop.
          // startHand may legally no-op back to WAITING when no hand can be dealt.
          break;
        }
        handsStarted += 1;

        expect(state.street).toBe("PREFLOP");
        expect(state.board.length).toBe(0);

        const trace: string[] = [`hand=${h + 1}`, `handId=${state.handId}`];
        let guard = 0;
        while (state.street !== "WAITING") {
          guard += 1;
          if (guard >= 800) {
            throw new Error(`Infinite loop detected: ${trace.join("|")}`);
          }

          // Random driver tick to simulate recovery/heartbeat evaluations between actions.
          if (rng() < 0.15) {
            trace.push("tick");
            await (dealer as any).requestDrive?.("random_walk_tick");
          }
          if (rng() < 0.05) {
            trace.push("double_tick");
            await (dealer as any).requestDrive?.("double_tick_1");
            await (dealer as any).requestDrive?.("double_tick_2");
          }

          // Random disconnect/reconnect churn to surface timeout/race edge cases.
          if (rng() < 0.05) {
            const players = [...state.playersById.values()].filter((p) => p.status !== "OUT");
            if (players.length > 0) {
              const p = players[randomIntInclusive(rng, 0, players.length - 1)]!;
              await dealer.markDisconnectedSerialized(p.id, Date.now() + 30_000);
              trace.push(`disconnect:${p.id}`);
            }
          }
          if (rng() < 0.05) {
            const players = [...state.playersById.values()].filter((p) => p.status !== "OUT");
            if (players.length > 0) {
              const p = players[randomIntInclusive(rng, 0, players.length - 1)]!;
              await dealer.markReconnectedSerialized(p.id);
              trace.push(`reconnect:${p.id}`);
            }
          }

          if (state.roundState !== "WAITING_FOR_ACTION") {
            expect(state.turnDeadlineMs).toBe(0);
          }
          if (state.roundState === "SHOWDOWN") {
            expect(bettingRoundComplete(state) || noFurtherBettingPossible(state)).toBe(true);
          }
          if (state.roundState === "WAITING_FOR_ACTION") {
            expect(state.toActSeat).toBeGreaterThanOrEqual(0);
            expect(state.toActSeat).toBeLessThan(state.seats.length);
            const toActId = state.seats[state.toActSeat];
            const toActPlayer = toActId ? state.playersById.get(toActId) : undefined;
            expect(toActId, `missing actor id ${trace.join("|")}`).toBeTruthy();
            expect(toActPlayer, `missing actor player ${trace.join("|")}`).toBeTruthy();
            expect(toActPlayer?.needsAction, `actor without needsAction ${trace.join("|")}`).toBe(true);
            if (toActPlayer?.kind === "HUMAN" && toActPlayer.connected) {
              expect(state.turnDeadlineMs, `missing human turn deadline ${trace.join("|")}`).toBeGreaterThan(0);
            }
          }

          // Pot accounting invariant during active hands: pot equals total committed.
          if (state.street !== "WAITING") {
            const committedSum = [...state.playersById.values()].reduce((s, p) => s + p.committedCents, 0);
            expect(committedSum, `pot/committed mismatch ${trace.join("|")}`).toBe(state.potCents);
          }

          const toActId = state.seats[state.toActSeat];
          if (!toActId) {
            throw new Error(`Missing toAct user: ${trace.join("|")}`);
          }

          const options = optionsService.buildHeroActionOptions(state, toActId);
          if (!options) {
            trace.push(`no_options:${toActId}`);
            await (dealer as any).requestDrive?.("no_options_tick");
            continue;
          }
          const action = pickRandomLegalAction(rng, options);
          trace.push(`${toActId}:${action.action}${action.amountCents ? `:${action.amountCents}` : ""}`);
          const before = {
            toActSeat: state.toActSeat,
            street: state.street,
            potCents: state.potCents,
            handActionSeq: state.handActionSeq,
          };
          try {
            await dealer.handleAction(toActId, action);
          } catch (err) {
            if (
              err instanceof PokerError &&
              (err.code === "NOT_YOUR_TURN" || err.code === "NOT_ELIGIBLE" || err.code === "HAND_NOT_STARTED")
            ) {
              trace.push(`stale_reject:${err.code}`);
              continue;
            }
            throw err;
          }

          const after = {
            toActSeat: state.toActSeat,
            street: state.street,
            potCents: state.potCents,
            handActionSeq: state.handActionSeq,
          };
          const progressed =
            after.toActSeat !== before.toActSeat ||
            after.street !== before.street ||
            after.potCents !== before.potCents ||
            after.handActionSeq !== before.handActionSeq;
          expect(progressed, `no state progress after accepted action ${trace.join("|")}`).toBe(true);

          // Step-level money conservation invariant.
          expect(computeChipMass(), `chip mass drift ${trace.join("|")}`).toBe(expectedChipMass);
        }
        handsCompleted += 1;
        maxStepsPerHand = Math.max(maxStepsPerHand, guard);

        const handContrib = [...contributionsByUser.entries()].reduce(
          (sum, [id, amount]) => sum + (amount - (beforeContrib.get(id) ?? 0)),
          0,
        );
        const handPayout = [...payoutsByUser.entries()].reduce(
          (sum, [id, amount]) => sum + (amount - (beforePayout.get(id) ?? 0)),
          0,
        );
        expect(handPayout, `payout mismatch ${trace.join("|")}`).toBe(handContrib);
        expect(computeChipMass(), `chip mass drift after hand ${trace.join("|")}`).toBe(expectedChipMass);
      }

      expect(handsCompleted).toBe(handsStarted);
      console.log("maxStepsPerHand", maxStepsPerHand);

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

  it("arms a human turn deadline after preflop-to-flop transition", async () => {
    const state = new PokerState();
    state.tableId = "table_soak_transition_deadline";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.dealerSeat = 1;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("h1", "h2");
    state.street = "WAITING";

    state.playersById.set("h1", makePlayer("h1", 0, 6000));
    state.playersById.set("h2", makePlayer("h2", 1, 6000));

    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      creditRefund: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence);
    (dealer as any).scheduleNextHand = () => {};
    const optionsService = new ActionOptionsService();

    await (dealer as any).startHand();
    expect(state.street).toBe("PREFLOP");

    let guard = 0;
    let lastPreflopActor = "";
    while (state.street === "PREFLOP") {
      guard += 1;
      if (guard > 8) throw new Error("preflop guard exceeded");
      const toActId = state.seats[state.toActSeat];
      expect(toActId).toBeTruthy();
      const options = optionsService.buildHeroActionOptions(state, toActId!);
      expect(options).toBeTruthy();
      const action: ActionPayload = options!.canCheck ? { action: "CHECK" } : { action: "CALL" };
      lastPreflopActor = toActId!;
      await dealer.handleAction(toActId!, action);
    }

    expect(state.street).toBe("FLOP");
    const toActId = state.seats[state.toActSeat];
    expect(toActId).toBeTruthy();
    const toActPlayer = state.playersById.get(toActId!);
    expect(toActPlayer).toBeTruthy();
    expect(toActPlayer!.kind).toBe("HUMAN");
    expect(toActPlayer!.connected).toBe(true);
    expect(toActPlayer!.needsAction).toBe(true);
    expect(state.turnDeadlineMs, "missing turn deadline on human flop turn").toBeGreaterThan(0);
    expect(lastPreflopActor).toBeTruthy();
  });

  it("keeps human deadline armed after preflop check in human-vs-bot flop transition", async () => {
    const state = new PokerState();
    state.tableId = "table_soak_human_bot_flop_deadline";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("bot1", "h1");
    state.street = "WAITING";

    state.playersById.set("bot1", makePlayer("bot1", 0, 6000, "BOT"));
    state.playersById.set("h1", makePlayer("h1", 1, 6000, "HUMAN"));

    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      creditRefund: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence);
    (dealer as any).scheduleNextHand = () => {};
    const optionsService = new ActionOptionsService();

    await (dealer as any).startHand();
    expect(state.street).toBe("PREFLOP");

    let guard = 0;
    while (state.street === "PREFLOP") {
      guard += 1;
      if (guard > 80) throw new Error("preflop guard exceeded in human-vs-bot setup");
      const toActId = state.seats[state.toActSeat];
      if (!toActId) throw new Error("missing toAct seat");
      if (toActId !== "h1") {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      const options = optionsService.buildHeroActionOptions(state, toActId);
      expect(options).toBeTruthy();
      const action: ActionPayload = options!.canCheck ? { action: "CHECK" } : { action: "CALL" };
      await dealer.handleAction(toActId, action);
    }

    expect(state.street).toBe("FLOP");
    const toActId = state.seats[state.toActSeat];
    expect(toActId).toBe("h1");
    const toActPlayer = state.playersById.get("h1");
    expect(toActPlayer?.kind).toBe("HUMAN");
    expect(toActPlayer?.connected).toBe(true);
    expect(toActPlayer?.needsAction).toBe(true);
    expect(state.turnDeadlineMs, "missing turn deadline for human at flop after preflop transition").toBeGreaterThan(0);
  });
});

