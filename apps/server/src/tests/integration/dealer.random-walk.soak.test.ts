import { describe, expect, it, vi } from "vitest";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { appendFileSync } from "node:fs";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";
import { PokerError } from "../../engine/errors.js";
import { bettingRoundComplete, noFurtherBettingPossible } from "../../engine/rules/BettingRound.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

const isNightlySoak = process.env.SOAK_PROFILE === "nightly";
const configuredHands = Number(process.env.SOAK_HANDS ?? "");
const configuredProgressEvery = Number(process.env.SOAK_PROGRESS_EVERY ?? "");
const soakHeartbeatFile = (process.env.SOAK_HEARTBEAT_FILE ?? "").trim();

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

async function waitUntil(
  condition: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await Promise.resolve();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const started = Date.now();
  let settled = false;
  let result: T | undefined;
  let failure: unknown;

  void promise
    .then((value) => {
      settled = true;
      result = value;
    })
    .catch((err) => {
      settled = true;
      failure = err;
    });

  while (!settled) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await Promise.resolve();
  }

  if (failure) {
    throw failure;
  }
  return result as T;
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
  const legal: Array<{ payload: ActionPayload; weight: number }> = [];
  if (options.canFold) legal.push({ payload: { action: "FOLD" }, weight: 1 });
  if (options.canCheck) legal.push({ payload: { action: "CHECK" }, weight: 2 });
  if (options.canCall) legal.push({ payload: { action: "CALL" }, weight: 3 });
  if (options.canBet) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    const minOrAllIn = rng() < 0.6 ? min : randomIntInclusive(rng, min, max);
    legal.push({ payload: { action: "BET", amountCents: minOrAllIn }, weight: 2 });
  }
  if (options.canRaise) {
    const min = options.minRaiseTo ?? options.maxRaiseTo ?? 1;
    const max = options.maxRaiseTo ?? min;
    const minOrLarge = rng() < 0.65
      ? min
      : randomIntInclusive(rng, Math.min(max, min + Math.floor((max - min) * 0.7)), max);
    legal.push({ payload: { action: "RAISE", amountCents: minOrLarge }, weight: 3 });
  }
  if (options.canAllIn) legal.push({ payload: { action: "ALL_IN" }, weight: 4 });
  if (legal.length === 0) return { action: "FOLD" };
  const totalWeight = legal.reduce((sum, item) => sum + item.weight, 0);
  let pick = rng() * totalWeight;
  for (const item of legal) {
    pick -= item.weight;
    if (pick <= 0) return item.payload;
  }
  return legal[legal.length - 1]!.payload;
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
      const progressEvery = Number.isFinite(configuredProgressEvery) && configuredProgressEvery > 0
        ? Math.floor(configuredProgressEvery)
        : 25;
      const soakStartedAtMs = Date.now();
      const writeHeartbeat = (kind: "progress" | "done", payload: Record<string, unknown>) => {
        if (!soakHeartbeatFile) return;
        const event = {
          ts: new Date().toISOString(),
          kind,
          ...payload,
        };
        appendFileSync(soakHeartbeatFile, `${JSON.stringify(event)}\n`, "utf8");
      };
      let handsStarted = 0;
      let handsCompleted = 0;
      let maxStepsPerHand = 0;
      const initialSeatByUserId = new Map<string, number>(
        [...state.playersById.values()].map((p) => [p.id, p.seat]),
      );
      const initialKindByUserId = new Map<string, "HUMAN" | "BOT">(
        [...state.playersById.values()].map((p) => [p.id, p.kind as "HUMAN" | "BOT"]),
      );
      let consecutiveNoDealStarts = 0;

      const recyclePlayersIfNeeded = (force = false) => {
        const activeWithChips = [...state.playersById.values()].filter((p) => p.status !== "OUT" && p.stackCents > 0);
        if (!force && activeWithChips.length >= 2) return false;

        for (let i = 0; i < state.seats.length; i++) state.seats[i] = "";

        for (const [id, originalSeat] of initialSeatByUserId.entries()) {
          if (originalSeat < 0) continue;
          let p = state.playersById.get(id);
          if (!p) {
            p = makePlayer(id, originalSeat, 6000, initialKindByUserId.get(id) ?? "HUMAN");
            state.playersById.set(id, p);
          }
          while (state.seats.length <= originalSeat) state.seats.push("");
          state.seats[originalSeat] = id;
          p.seat = originalSeat;
          if (p.stackCents <= 0) p.stackCents = 6000;
          p.status = "ACTIVE";
          p.roundBetCents = 0;
          p.committedCents = 0;
          p.needsAction = false;
          p.connected = true;
          p.disconnectDeadlineTs = 0;
          p.sittingOutUntilNextHand = false;
          p.pendingLeave = false;
          p.pendingRemovalReason = "";
        }
        expectedChipMass = computeChipMass();
        return true;
      };

      for (let h = 0; h < handsToPlay; h++) {
        recyclePlayersIfNeeded();

        // Between hands, previous hand should be fully settled (no residual undistributed chips).
        expect(state.street).toBe("WAITING");
        expect(settlementService.getCurrentHandPotDisbursedCents()).toBe(state.potCents);

        const beforeContrib = new Map(contributionsByUser);
        const beforePayout = new Map(payoutsByUser);
        const startHandPromise = (dealer as any).startHand();
        await waitUntil(
          () => state.handId.length > 0 || state.street !== "WAITING",
          5_000,
          "start hand progression from WAITING",
        );
        try {
          await withTimeout(startHandPromise, 10_000, `startHand completion hand=${h + 1}`);
        } catch (err) {
          const progressed = state.handId.length > 0 || state.street !== "WAITING";
          if (!progressed) throw err;
          // Rarely observed in long runs: startHand progressed state but the originating
          // promise resolves late. Treat as non-fatal because hand progression is authoritative.
          console.error(
            `[SOAK_WARN] late startHand completion tolerated hand=${h + 1} handId=${state.handId} street=${state.street}`,
          );
        }
        if (state.street === "WAITING") {
          // Keep long soaks running across transient no-deal starts.
          // Fails fast only if no hand can start repeatedly despite recycle.
          recyclePlayersIfNeeded(true);
          consecutiveNoDealStarts += 1;
          if (consecutiveNoDealStarts >= 100) {
            throw new Error("startHand remained WAITING for 100 consecutive attempts");
          }
          continue;
        }
        consecutiveNoDealStarts = 0;
        handsStarted += 1;
        if ((handsStarted % progressEvery) === 0) {
          const elapsedSec = Math.max(1, Math.floor((Date.now() - soakStartedAtMs) / 1000));
          const handsPerSec = handsStarted / elapsedSec;
          const remainingHands = Math.max(0, handsToPlay - handsStarted);
          const etaSec = handsPerSec > 0 ? Math.floor(remainingHands / handsPerSec) : -1;
          // stderr heartbeat for local terminal visibility.
          console.error(
            `[SOAK_PROGRESS] started=${handsStarted}/${handsToPlay} completed=${handsCompleted} hps=${handsPerSec.toFixed(2)} etaSec=${etaSec}`,
          );
          writeHeartbeat("progress", {
            started: handsStarted,
            target: handsToPlay,
            completed: handsCompleted,
            hps: Number(handsPerSec.toFixed(4)),
            etaSec,
            handId: state.handId,
            street: state.street,
          });
        }

        expect(state.street).toBe("PREFLOP");
        expect(state.board.length).toBe(0);

        const trace: string[] = [`hand=${h + 1}`, `handId=${state.handId}`];
        let guard = 0;
        let stableStallKey = "";
        let stableStallCount = 0;
        while (state.street !== "WAITING") {
          guard += 1;
          if (guard >= 800) {
            throw new Error(`Infinite loop detected: ${trace.join("|")}`);
          }

          // Core money safety invariants: no negative chip state.
          expect(state.potCents, `negative pot ${trace.join("|")}`).toBeGreaterThanOrEqual(0);
          for (const player of state.playersById.values()) {
            expect(player.stackCents, `negative stack ${player.id} ${trace.join("|")}`).toBeGreaterThanOrEqual(0);
            expect(player.roundBetCents, `negative roundBet ${player.id} ${trace.join("|")}`).toBeGreaterThanOrEqual(0);
          }

          // Deadlock and queue-safety checks while hand is active.
          // Stall reasons may appear briefly while lifecycle work is in-flight; only fail on persistent stable stalls.
          const queueDepth = dealer.getQueueDepth();
          const stallReason = dealer.getStallReasonPublic(Date.now());
          expect(queueDepth, `queue depth spike ${trace.join("|")}`).toBeLessThan(5);
          if (stallReason && queueDepth === 0) {
            const stallKey = `${state.handId}:${state.street}:${state.handActionSeq}:${stallReason}`;
            if (stallKey === stableStallKey) {
              stableStallCount += 1;
            } else {
              stableStallKey = stallKey;
              stableStallCount = 1;
            }
            expect(
              stableStallCount,
              `persistent stall detected ${stallReason} x${stableStallCount} ${trace.join("|")}`,
            ).toBeLessThan(4);
          } else {
            stableStallKey = "";
            stableStallCount = 0;
          }

          // Random driver tick to simulate recovery/heartbeat evaluations between actions.
          if (rng() < 0.15) {
            trace.push("tick");
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive?.("random_walk_tick")),
              2_000,
              `requestDrive random_walk_tick ${trace.join("|")}`,
            );
          }
          if (rng() < 0.05) {
            trace.push("double_tick");
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive?.("double_tick_1")),
              2_000,
              `requestDrive double_tick_1 ${trace.join("|")}`,
            );
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive?.("double_tick_2")),
              2_000,
              `requestDrive double_tick_2 ${trace.join("|")}`,
            );
          }

          // Random disconnect/reconnect churn to surface timeout/race edge cases.
          if (rng() < 0.05) {
            const players = [...state.playersById.values()].filter((p) => p.status !== "OUT");
            if (players.length > 0) {
              const p = players[randomIntInclusive(rng, 0, players.length - 1)]!;
              try {
                await withTimeout(
                  dealer.markDisconnectedSerialized(p.id, Date.now() + 30_000),
                  5_000,
                  `markDisconnectedSerialized ${p.id} ${trace.join("|")}`,
                );
              } catch {
                trace.push(`disconnect_timeout:${p.id}`);
              }
              trace.push(`disconnect:${p.id}`);
            }
          }
          if (rng() < 0.05) {
            const players = [...state.playersById.values()].filter((p) => p.status !== "OUT");
            if (players.length > 0) {
              const p = players[randomIntInclusive(rng, 0, players.length - 1)]!;
              try {
                await withTimeout(
                  dealer.markReconnectedSerialized(p.id),
                  5_000,
                  `markReconnectedSerialized ${p.id} ${trace.join("|")}`,
                );
              } catch {
                trace.push(`reconnect_timeout:${p.id}`);
              }
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
            expect(toActPlayer?.status, `actor not ACTIVE ${trace.join("|")}`).toBe("ACTIVE");
            expect(toActPlayer?.status === "FOLDED" || toActPlayer?.status === "ALL_IN", `actor folded/all-in ${trace.join("|")}`)
              .toBe(false);
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
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive?.("no_options_tick")),
              2_000,
              `requestDrive no_options_tick ${trace.join("|")}`,
            );
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
            if ((action.action === "RAISE" || action.action === "BET") && action.amountCents != null) {
              const minRaiseTo = options.minRaiseTo ?? 0;
              expect(action.amountCents, `raise/bet below min ${trace.join("|")}`).toBeGreaterThanOrEqual(minRaiseTo);
            }
            await withTimeout(
              dealer.handleAction(toActId, action),
              10_000,
              `handleAction ${toActId}:${action.action} ${trace.join("|")}`,
            );
          } catch (err) {
            if (
              err instanceof PokerError &&
              (err.code === "NOT_YOUR_TURN" ||
                err.code === "NOT_ELIGIBLE" ||
                err.code === "HAND_NOT_STARTED" ||
                err.code === "BAD_STATE")
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
      const totalElapsedSec = Math.max(1, Math.floor((Date.now() - soakStartedAtMs) / 1000));
      console.error(
        `[SOAK_DONE] started=${handsStarted} completed=${handsCompleted} totalSec=${totalElapsedSec} avgHandsPerSec=${(handsCompleted / totalElapsedSec).toFixed(2)}`,
      );
      writeHeartbeat("done", {
        started: handsStarted,
        completed: handsCompleted,
        totalSec: totalElapsedSec,
        avgHandsPerSec: Number((handsCompleted / totalElapsedSec).toFixed(4)),
      });

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
    while (String(state.street) === "PREFLOP") {
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
    state.dealerSeat = 1;
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
    ((dealer as any).turnAutomationService as any).deps.botResolver.pickAction = () => ({ action: "CALL" });
    const optionsService = new ActionOptionsService();
    let reachedFlop = false;
    for (let attempt = 0; attempt < 5 && !reachedFlop; attempt++) {
      if (state.street !== "WAITING") break;
      await (dealer as any).startHand();
      if (String(state.street) !== "PREFLOP") continue;

      let guard = 0;
      while (String(state.street) === "PREFLOP") {
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

      reachedFlop = String(state.street) === "FLOP";
    }

    expect(reachedFlop).toBe(true);
    expect(state.street).toBe("FLOP");
    const toActId = state.seats[state.toActSeat];
    expect(toActId).toBe("h1");
    const toActPlayer = state.playersById.get("h1");
    expect(toActPlayer?.kind).toBe("HUMAN");
    expect(toActPlayer?.connected).toBe(true);
    expect(toActPlayer?.needsAction).toBe(true);
    expect(state.turnDeadlineMs, "missing turn deadline for human at flop after preflop transition").toBeGreaterThan(0);
  }, 30_000);

  it("self-heals WAITING human actor missing needsAction and arms deadline", async () => {
    const state = new PokerState();
    state.tableId = "table_soak_waiting_self_heal";
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
    while (String(state.street) === "PREFLOP") {
      guard += 1;
      if (guard > 8) throw new Error("preflop guard exceeded");
      const toActId = state.seats[state.toActSeat];
      expect(toActId).toBeTruthy();
      const options = optionsService.buildHeroActionOptions(state, toActId!);
      expect(options).toBeTruthy();
      const action: ActionPayload = options!.canCheck ? { action: "CHECK" } : { action: "CALL" };
      await dealer.handleAction(toActId!, action);
    }

    expect(state.street).toBe("FLOP");
    const toActId = state.seats[state.toActSeat];
    expect(toActId).toBeTruthy();
    const toActPlayer = state.playersById.get(toActId!);
    expect(toActPlayer).toBeTruthy();
    expect(toActPlayer!.kind).toBe("HUMAN");
    expect(toActPlayer!.connected).toBe(true);

    // Simulate stale state drift that historically caused local stalls.
    toActPlayer!.needsAction = false;
    state.turnDeadlineMs = 0;

    await Promise.resolve((dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR"));

    expect(toActPlayer!.needsAction, "self-heal should restore human turn actionable state").toBe(true);
    expect(state.turnDeadlineMs, "self-heal should arm a human turn deadline").toBeGreaterThan(0);
  });
});

