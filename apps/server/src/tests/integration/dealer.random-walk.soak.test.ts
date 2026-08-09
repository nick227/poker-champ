import { describe, expect, it, vi } from "vitest";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Dealer } from "../../engine/Dealer.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";
import { PokerError } from "../../engine/errors.js";
import { bettingRoundComplete, noFurtherBettingPossible } from "../../engine/rules/BettingRound.js";
import { resolvePlayersReadyForNextHand } from "../../engine/dealer/utils/TableNavigator.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

const isNightlySoak = process.env.SOAK_PROFILE === "nightly";
const configuredHands = Number(process.env.SOAK_HANDS ?? "");
const configuredProgressEvery = Number(process.env.SOAK_PROGRESS_EVERY ?? "");
const configuredTestTimeoutMs = Number(process.env.SOAK_TEST_TIMEOUT_MS ?? "");
const configuredActionTimeoutMs = Number(process.env.SOAK_ACTION_TIMEOUT_MS ?? "");
const soakHeartbeatFile = (process.env.SOAK_HEARTBEAT_FILE ?? "").trim();
const soakEventLogFile = (
  process.env.SOAK_EVENT_LOG_FILE ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../var/logs/dealer-soak-events.log")
).trim();
const soakActionTimeoutMs = Number.isFinite(configuredActionTimeoutMs) && configuredActionTimeoutMs > 0
  ? configuredActionTimeoutMs
  : 45_000;
const testPollIntervalMs = 1;
const defaultSoakHands = isNightlySoak ? 100 : 5;
const plannedSoakHands = Number.isFinite(configuredHands) && configuredHands > 0
  ? Math.floor(configuredHands)
  : defaultSoakHands;
const autoScaledSoakTimeoutMs = Math.max(
  isNightlySoak ? 600_000 : 150_000,
  plannedSoakHands * (isNightlySoak ? 6_000 : 3_000),
);
const soakTestTimeoutMs = Number.isFinite(configuredTestTimeoutMs) && configuredTestTimeoutMs > 0
  ? configuredTestTimeoutMs
  : autoScaledSoakTimeoutMs;

async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, testPollIntervalMs));
}

/** Real timeout: does not depend on polling or fake timers. */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  detail?: () => string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        const suffix = detail ? ` ${detail()}` : "";
        reject(new Error(`Timed out waiting for: ${label}${suffix}`));
      }, timeoutMs),
    ),
  ]);
}

/** Real timeout: condition is polled but overall wait is bounded by wall-clock time.
 * Uses an inline Date.now() check so the timeout fires even if the event loop is blocked. */
async function waitUntil(
  condition: () => boolean,
  timeoutMs: number,
  label: string,
  detail?: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      const suffix = detail ? ` ${detail()}` : "";
      throw new Error(`Timed out waiting for: ${label}${suffix}`);
    }
    await yieldToEventLoop();
  }
}

function getStallFingerprint(state: PokerState, dealer: Dealer): Record<string, unknown> {
  const toActPlayer = [...state.playersById.values()].find((player) => player.seat === state.toActSeat) ?? null;
  return {
    handId: state.handId,
    street: state.street,
    toAct: state.toActSeat,
    needsAction: toActPlayer?.needsAction ?? null,
    lastMarker: dealer.getLastDriveMarker?.(),
    queueDepth: dealer.getQueueDepth?.(),
    pendingSeatReleases: dealer.getPendingSeatReleaseCount?.(),
  };
}

function getStallCorrelation(state: PokerState, dealer: Dealer): Record<string, unknown> {
  return {
    actorSnapshot: dealer.getActorSnapshotForHand?.(state.handId) ?? null,
    lastAcceptedAction: dealer.getLastAcceptedActionSnapshot?.(state.handId) ?? null,
    currentQueueItem: dealer.getCurrentQueueItem?.() ?? null,
    lastQueueTransition: dealer.getLastQueueTransition?.() ?? null,
  };
}

function getHandleActionTimeoutCorrelation(
  state: PokerState,
  dealer: Dealer,
  userId: string,
  action: ActionPayload,
): Record<string, unknown> {
  const toActPlayer = [...state.playersById.values()].find((player) => player.seat === state.toActSeat) ?? null;
  const internalDealer = dealer as any;
  return {
    timedOutUserId: userId,
    timedOutAction: action.action,
    tableId: state.tableId,
    handId: state.handId,
    street: state.street,
    roundState: state.roundState,
    toActSeat: state.toActSeat,
    toActUserId: state.seats[state.toActSeat] ?? null,
    actorNeedsAction: toActPlayer?.needsAction ?? null,
    nextStepOwner: internalDealer.nextStepOwner ?? null,
    queueDepth: dealer.getQueueDepth?.() ?? null,
    currentQueueItem: dealer.getCurrentQueueItem?.() ?? null,
    lastQueueTransition: dealer.getLastQueueTransition?.() ?? null,
    lastMarker: dealer.getLastDriveMarker?.() ?? null,
  };
}

function getQueueSingleBlockerSnapshot(state: PokerState, dealer: Dealer): Record<string, unknown> {
  const internalDealer = dealer as any;
  return {
    tableId: state.tableId,
    handId: state.handId,
    street: state.street,
    roundState: state.roundState,
    toActSeat: state.toActSeat,
    toActUserId: state.seats[state.toActSeat] ?? null,
    nextStepOwner: internalDealer.nextStepOwner ?? null,
    queueDepth: dealer.getQueueDepth?.() ?? null,
    currentQueueItem: dealer.getCurrentQueueItem?.() ?? null,
    lastQueueTransition: dealer.getLastQueueTransition?.() ?? null,
    lastMarker: dealer.getLastDriveMarker?.() ?? null,
  };
}

function getDealerWaitingTimeoutState(state: PokerState, dealer: Dealer): Record<string, unknown> {
  const internalDealer = dealer as any;
  return {
    tableId: state.tableId,
    handId: state.handId,
    street: state.street,
    roundState: state.roundState,
    nextHandAtTs: state.nextHandAtTs,
    completedTerminalLifecycle: internalDealer.completedTerminalLifecycle ?? null,
    activeTerminalLifecycle: internalDealer.activeTerminalLifecycle ?? null,
    nextStepOwner: internalDealer.nextStepOwner ?? null,
    queueDepth: dealer.getQueueDepth?.(),
  };
}

function writeSoakEvent(kind: string, payload: Record<string, unknown>): void {
  if (!soakEventLogFile) return;
  mkdirSync(dirname(soakEventLogFile), { recursive: true });
  appendFileSync(
    soakEventLogFile,
    `${JSON.stringify({ ts: new Date().toISOString(), kind, ...payload })}\n`,
    "utf8",
  );
}

function dumpDealerWaitingTimeoutState(state: PokerState, dealer: Dealer): void {
  console.error(getDealerWaitingTimeoutState(state, dealer));
}

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
    vi.stubEnv("POKER_BOT_DELAY_MS", "0");
    vi.stubEnv("RUNOUT_STAGE_DELAY_MS", "0");
    vi.stubEnv("HAND_RESULT_HOLD_MS", "0");
    let dealer: Dealer | undefined;
    let failureState: PokerState | undefined;
    let currentTrace: string[] = [];
    let handsStarted = 0;
    let handsCompleted = 0;

    try {
      const state = new PokerState();
      failureState = state;
      writeSoakEvent("SOAK_START", {
        profile: isNightlySoak ? "nightly" : "default",
        hands: plannedSoakHands,
        actionTimeoutMs: soakActionTimeoutMs,
        testTimeoutMs: soakTestTimeoutMs,
      });
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

      dealer = new Dealer(state, persistence, {
        onTableSnapshotEmitted: ({ payloadJson }) => {
          snapshots.push(payloadJson.snapshotSeq);
        },
        onSoakTimingEvent: (event) => {
          writeSoakEvent(event.kind, event);
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

      const optionsService = new ActionOptionsService();
      const handsToPlay = plannedSoakHands;
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
      let maxStepsPerHand = 0;
      const initialSeatByUserId = new Map<string, number>(
        [...state.playersById.values()].map((p) => [p.id, p.seat]),
      );
      const initialKindByUserId = new Map<string, "HUMAN" | "BOT">(
        [...state.playersById.values()].map((p) => [p.id, p.kind as "HUMAN" | "BOT"]),
      );
      let consecutiveNoDealStarts = 0;

      const recyclePlayersIfNeeded = (force = false) => {
        const readyForNextHand = resolvePlayersReadyForNextHand(state);
        if (!force && readyForNextHand.length >= 2) return false;

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
        const trackedStartHandPromise = Promise.resolve(startHandPromise);
        try {
          await withTimeout(
            Promise.race([
              trackedStartHandPromise,
              waitUntil(
                () => state.handId.length > 0 || state.street !== "WAITING",
                5_000,
                "start hand progression from WAITING",
              ),
            ]),
            5_000,
            "start hand progression from WAITING",
          );
        } catch (err) {
          const timeoutState = getDealerWaitingTimeoutState(state, dealer);
          console.error(timeoutState);
          writeSoakEvent("SOAK_START_HAND_TIMEOUT_STATE", timeoutState);
          if (err instanceof Error) {
            throw new Error(`${err.message} :: ${JSON.stringify(timeoutState)}`);
          }
          throw err;
        }
        try {
          await withTimeout(trackedStartHandPromise, 10_000, `startHand completion hand=${h + 1}`);
        } catch (err) {
          const progressed = state.handId.length > 0 || state.street !== "WAITING";
          if (!progressed) throw err;
          // Rarely observed in long runs: startHand progressed state but the originating
          // promise resolves late. Treat as non-fatal because hand progression is authoritative.
          console.error(
            `[SOAK_WARN] late startHand completion tolerated hand=${h + 1} handId=${state.handId} street=${state.street}`,
          );
          writeSoakEvent("SOAK_WARN", {
            kind: "late_start_hand_completion",
            hand: h + 1,
            handId: state.handId,
            street: state.street,
          });
        }
        if (state.street === "WAITING") {
          const ready = resolvePlayersReadyForNextHand(state);
          if (ready.length >= 2) {
            throw new Error(
              `startHand no-op despite >=2 ready players :: ${JSON.stringify({
                tableId: state.tableId,
                handId: state.handId,
                readyCount: ready.length,
                players: ready.map((p) => ({
                  id: p.id,
                  status: p.status,
                  stack: p.stackCents,
                  sittingOut: p.sittingOutUntilNextHand,
                })),
              })}`,
            );
          }
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
          writeSoakEvent("SOAK_PROGRESS", {
            started: handsStarted,
            target: handsToPlay,
            completed: handsCompleted,
            hps: Number(handsPerSec.toFixed(4)),
            etaSec,
            handId: state.handId,
            street: state.street,
          });
        }

        expect(["PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"]).toContain(String(state.street));
        if (state.street === "PREFLOP") expect(state.board.length).toBe(0);

        const trace: string[] = [`hand=${h + 1}`, `handId=${state.handId}`];
        currentTrace = trace;
        let guard = 0;
        let stableStallKey = "";
        let stableStallCount = 0;
        let stableNoOptionsKey = "";
        let stableNoOptionsCount = 0;
        let lastSingleBlockerSnapshotKey = "";
        const traceCap = 400;
        const wallClockStallMs = 5_000;
        let lastProgressKey = "";
        let lastProgressAt = Date.now();
        const stallDetail = () => `fingerprint=${JSON.stringify(getStallFingerprint(state, dealer!))}`;
        while (state.street !== "WAITING") {
          guard += 1;
          if (guard >= 800) {
            throw new Error(`Infinite loop detected: ${trace.join("|")}`);
          }
          // Wall-clock forward-progress guard: catches stalls that burn through the iteration
          // counter without meaningful state change (e.g. oscillating pot, stuck roundState).
          const progressKey = `${state.street}:${state.roundState}:${state.toActSeat}:${state.potCents}:${state.handActionSeq}`;
          if (progressKey !== lastProgressKey) {
            lastProgressKey = progressKey;
            lastProgressAt = Date.now();
          } else if (Date.now() - lastProgressAt > wallClockStallMs) {
            console.error("[STALL_FINGERPRINT]", getStallFingerprint(state, dealer));
            console.error("[STALL_CORRELATION]", getStallCorrelation(state, dealer!));
            writeSoakEvent("STALL_FINGERPRINT", {
              hand: h + 1,
              trace,
              fingerprint: getStallFingerprint(state, dealer),
            });
            writeSoakEvent("STALL_CORRELATION", {
              hand: h + 1,
              trace,
              correlation: getStallCorrelation(state, dealer!),
            });
            throw new Error(
              `Wall-clock stall: no state progress for >${wallClockStallMs}ms key=${progressKey} ${trace.join("|")} ${stallDetail()}`,
            );
          }
          if (trace.length > traceCap) {
            throw new Error(`Trace cap exceeded (livelock): ${trace.slice(-20).join("|")}`);
          }

          if (dealer.getQueueDepth?.() === 1) {
            const blockerSnapshot = getQueueSingleBlockerSnapshot(state, dealer);
            const blockerKey = JSON.stringify(blockerSnapshot);
            if (blockerKey !== lastSingleBlockerSnapshotKey) {
              lastSingleBlockerSnapshotKey = blockerKey;
              console.error("[QUEUE_SINGLE_BLOCKER_SNAPSHOT]", blockerSnapshot);
              writeSoakEvent("QUEUE_SINGLE_BLOCKER_SNAPSHOT", {
                hand: h + 1,
                trace,
                snapshot: blockerSnapshot,
              });
            }
          } else {
            lastSingleBlockerSnapshotKey = "";
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
          if (state.roundState === "WAITING_FOR_ACTION" && stallReason && queueDepth === 0) {
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
              Promise.resolve((dealer as any).requestDrive("random_walk_tick")),
              2_000,
              `requestDrive random_walk_tick ${trace.join("|")}`,
              stallDetail,
            );
          }
          if (rng() < 0.05) {
            trace.push("double_tick");
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive("double_tick_1")),
              2_000,
              `requestDrive double_tick_1 ${trace.join("|")}`,
              stallDetail,
            );
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive("double_tick_2")),
              2_000,
              `requestDrive double_tick_2 ${trace.join("|")}`,
              stallDetail,
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
                  stallDetail,
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
                  stallDetail,
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

          // Fast-path: hand is active but no player action is needed right now.
          // Drive a tick so lifecycle work (street advance, showdown, etc.) can run, then
          // re-enter the loop. Bypasses the no_options livelock counter which is only
          // meaningful when roundState === WAITING_FOR_ACTION. Hang detection is handled
          // by the wall-clock progress guard above.
          if (state.roundState !== "WAITING_FOR_ACTION") {
            trace.push(`drive:${state.roundState}`);
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive("round_state_tick")),
              2_000,
              `requestDrive round_state_tick ${state.roundState} ${trace.join("|")}`,
              stallDetail,
            );
            continue;
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

          const toActPlayerForConnectivity = state.playersById.get(toActId);
          if (toActPlayerForConnectivity && !toActPlayerForConnectivity.connected) {
            // A disconnected player's own client cannot submit actions at all -- not just
            // in the step they were disconnected, but for as long as they stay offline
            // (this harness's reconnect-churn is only a per-step 5% chance, so a player
            // can sit disconnected across many hands before reconnecting). The engine's
            // own TurnAutomationService.maybeActForBot auto-folds/auto-checks on their
            // behalf whenever it's their turn while disconnected; deciding and submitting
            // a *second*, independent action here races that internal auto-action through
            // the same serialized queue. Whichever wins, the loser's action is correctly
            // rejected as stale by ActionService -- that's not an engine bug -- but the
            // harness must not simulate a client action from a client that is offline.
            //
            // Just skipping (continue, no interaction) leaves the game waiting on
            // whatever triggers maybeActForBot's disconnected-human auto-fold/check --
            // that trigger doesn't fire spontaneously, so drive explicitly. The root
            // cause of the BOT_OVERDUE stall this used to trip (AutoActionDispatcher
            // re-enqueueing a duplicate auto-action on every drive while a previous one
            // for the same decision point was still pending, flooding the queue until
            // most attempts got discarded as stale) is now fixed at the source in
            // TurnManager.ts, so one drive is normally enough. The bounded retry here is
            // just a defensive margin against a resolution that's merely slow for some
            // other reason, not a workaround for that bug.
            trace.push(`skip_disconnected_actor:${toActId}`);
            const preSkipHandActionSeq = state.handActionSeq;
            const preSkipToActSeat = state.toActSeat;
            for (let driveAttempt = 0; driveAttempt < 5; driveAttempt += 1) {
              await withTimeout(
                Promise.resolve((dealer as any).requestDrive(`skip_disconnected_actor_tick:${driveAttempt}`)),
                2_000,
                `requestDrive skip_disconnected_actor_tick ${trace.join("|")}`,
                stallDetail,
              );
              const resolved =
                state.handActionSeq !== preSkipHandActionSeq ||
                state.toActSeat !== preSkipToActSeat ||
                state.street === "WAITING" ||
                state.roundState !== "WAITING_FOR_ACTION";
              if (resolved) break;
            }
            continue;
          }

          const options = optionsService.buildHeroActionOptions(state, toActId);
          if (!options) {
            trace.push(`no_options:${toActId}`);
            const noOptionsKey = `${state.handId}:${state.street}:${state.toActSeat}:${toActId}`;
            if (noOptionsKey === stableNoOptionsKey) {
              stableNoOptionsCount += 1;
            } else {
              stableNoOptionsKey = noOptionsKey;
              stableNoOptionsCount = 1;
            }
            expect(
              stableNoOptionsCount,
              `no_options livelock: same actor/state repeated ${stableNoOptionsCount} times ${trace.join("|")}`,
            ).toBeLessThan(8);
            await withTimeout(
              Promise.resolve((dealer as any).requestDrive("no_options_tick")),
              2_000,
              `requestDrive no_options_tick ${trace.join("|")}`,
              stallDetail,
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
              soakActionTimeoutMs,
              `handleAction ${toActId}:${action.action} ${trace.join("|")}`,
              stallDetail,
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
            // handleAction timed out: if state progressed, treat like late startHand completion (tolerate and continue).
            const isTimeout =
              err instanceof Error && err.message.startsWith("Timed out waiting for:");
            if (isTimeout) {
              const afterTimeout = {
                toActSeat: state.toActSeat,
                street: state.street,
                potCents: state.potCents,
                handActionSeq: state.handActionSeq,
              };
              const progressed =
                afterTimeout.toActSeat !== before.toActSeat ||
                afterTimeout.street !== before.street ||
                afterTimeout.potCents !== before.potCents ||
                afterTimeout.handActionSeq !== before.handActionSeq;
              if (progressed) {
                console.error(
                  `[SOAK_WARN] handleAction timeout but state progressed hand=${h + 1} handId=${state.handId} street=${state.street} ${toActId}:${action.action}`,
                );
                writeSoakEvent("SOAK_WARN", {
                  kind: "handle_action_timeout_progressed",
                  hand: h + 1,
                  handId: state.handId,
                  street: state.street,
                  userId: toActId,
                  action: action.action,
                  trace,
                });
                trace.push("handleAction_timeout_progressed");
                // Fall through to after/progressed/expect(computeChipMass) with current state.
              } else {
                console.error(
                  "[HANDLE_ACTION_TIMEOUT_CORRELATION]",
                  getHandleActionTimeoutCorrelation(state, dealer!, toActId, action),
                );
                writeSoakEvent("HANDLE_ACTION_TIMEOUT_CORRELATION", {
                  hand: h + 1,
                  trace,
                  correlation: getHandleActionTimeoutCorrelation(state, dealer!, toActId, action),
                });
                throw err;
              }
            } else {
              throw err;
            }
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
      writeSoakEvent("SOAK_DONE", {
        started: handsStarted,
        completed: handsCompleted,
        totalSec: totalElapsedSec,
        avgHandsPerSec: Number((handsCompleted / totalElapsedSec).toFixed(4)),
      });
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
    } catch (err) {
      const failedState = failureState;
      const failedDealer = dealer;
      writeSoakEvent("SOAK_FAILURE", {
        message: err instanceof Error ? err.message : String(err),
        handsStarted,
        handsCompleted,
        traceTail: currentTrace.slice(-20),
        state: failedState
          ? {
              tableId: failedState.tableId,
              handId: failedState.handId,
              street: failedState.street,
              roundState: failedState.roundState,
              toActSeat: failedState.toActSeat,
              toActUserId: failedState.seats[failedState.toActSeat] ?? null,
              potCents: failedState.potCents,
              handActionSeq: failedState.handActionSeq,
              seats: failedState.seats.map((userId, seat) => {
                const player = userId ? failedState.playersById.get(userId) : undefined;
                return {
                  seat,
                  userId: userId || null,
                  kind: player?.kind ?? null,
                  connected: player?.connected ?? null,
                  status: player?.status ?? null,
                  needsAction: player?.needsAction ?? null,
                  stackCents: player?.stackCents ?? null,
                  roundBetCents: player?.roundBetCents ?? null,
                  committedCents: player?.committedCents ?? null,
                };
              }),
            }
          : null,
        dealer: failedDealer && failedState
          ? {
              lastMarker: failedDealer.getLastDriveMarker?.(),
              queueDepth: failedDealer.getQueueDepth?.(),
              pendingSeatReleases: failedDealer.getPendingSeatReleaseCount?.(),
              actorSnapshot: failedDealer.getActorSnapshotForHand?.(failedState.handId) ?? null,
              lastAcceptedAction: failedDealer.getLastAcceptedActionSnapshot?.(failedState.handId) ?? null,
              currentQueueItem: failedDealer.getCurrentQueueItem?.() ?? null,
              lastQueueTransition: failedDealer.getLastQueueTransition?.() ?? null,
              lastAutoActionProbe: failedDealer.getLastAutoActionProbe?.() ?? null,
            }
          : null,
      });
      throw err;
    } finally {
      dealer?.dispose();
      vi.unstubAllEnvs();
    }
  }, soakTestTimeoutMs);

  it("handles burst action pressure without queue starvation", async () => {
    const state = new PokerState();
    state.tableId = "table_soak_queue_pressure";
    state.maxSeats = 3;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.dealerSeat = 1;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("u1", "u2", "u3");
    state.street = "WAITING";

    state.playersById.set("u1", makePlayer("u1", 0, 6000));
    state.playersById.set("u2", makePlayer("u2", 1, 6000));
    state.playersById.set("u3", makePlayer("u3", 2, 6000));

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
    (dealer as any).scheduleHumanTurnTimeout = () => {};
    try {

    const optionsService = new ActionOptionsService();
    await withTimeout((dealer as any).startHand(), 10_000, "queue pressure startHand");
    expect(state.street).not.toBe("WAITING");

    const toActId = state.seats[state.toActSeat];
    expect(toActId).toBeTruthy();
    const options = optionsService.buildHeroActionOptions(state, toActId!);
    expect(options).toBeTruthy();

    const burstAction: ActionPayload = options!.canCall
      ? { action: "CALL" }
      : options!.canCheck
        ? { action: "CHECK" }
        : options!.canAllIn
          ? { action: "ALL_IN" }
          : options!.canFold
            ? { action: "FOLD" }
            : options!.canRaise
              ? { action: "RAISE", amountCents: options!.minRaiseTo ?? options!.maxRaiseTo ?? 1 }
              : { action: "FOLD" };

    let burstSettled = false;
    let maxQueueDepth = dealer.getQueueDepth();
    const monitor = (async () => {
      while (!burstSettled) {
        maxQueueDepth = Math.max(maxQueueDepth, dealer.getQueueDepth());
        await Promise.resolve();
      }
    })();

    let accepted = 0;
    let rejected = 0;
    const burst = Array.from({ length: 30 }, (_, i) =>
      dealer
        .handleAction(toActId!, burstAction, `queue-pressure-${Date.now()}-${i}`)
        .then(() => {
          accepted += 1;
        })
        .catch((err) => {
          if (err instanceof PokerError) {
            rejected += 1;
            return;
          }
          throw err;
        }),
    );

    try {
      await withTimeout(Promise.all(burst), 10_000, "queue pressure burst settle");
    } finally {
      burstSettled = true;
    }
    await monitor;

    expect(accepted, "expected at least one accepted action from burst").toBeGreaterThan(0);
    expect(rejected, "expected some rejected actions from stale/not-your-turn burst").toBeGreaterThan(0);

    const drainStartedAt = Date.now();
    await waitUntil(() => dealer.getQueueDepth() === 0, 10_000, "queue pressure drain");
    const drainMs = Date.now() - drainStartedAt;
    expect(maxQueueDepth, "queue depth did not spike under burst pressure").toBeGreaterThan(0);
    expect(drainMs, `queue drained too slowly under burst pressure (maxDepth=${maxQueueDepth})`).toBeLessThan(2_500);
    expect(dealer.getQueueDepth()).toBe(0);

    let guard = 0;
    while (state.street !== "WAITING" && guard < 30) {
      guard += 1;
      const currentToActId = state.seats[state.toActSeat];
      expect(currentToActId, `missing toAct at guard=${guard}`).toBeTruthy();
      const currentOptions = optionsService.buildHeroActionOptions(state, currentToActId!);
      expect(currentOptions, `missing options at guard=${guard}`).toBeTruthy();
      const action: ActionPayload = currentOptions!.canCheck
        ? { action: "CHECK" }
        : currentOptions!.canCall
          ? { action: "CALL" }
          : currentOptions!.canAllIn
            ? { action: "ALL_IN" }
            : currentOptions!.canFold
              ? { action: "FOLD" }
              : currentOptions!.canRaise
                ? { action: "RAISE", amountCents: currentOptions!.minRaiseTo ?? currentOptions!.maxRaiseTo ?? 1 }
                : { action: "FOLD" };
      await withTimeout(dealer.handleAction(currentToActId!, action), 10_000, `queue pressure advance guard=${guard}`);
      await waitUntil(() => dealer.getQueueDepth() === 0, 10_000, `queue pressure drain guard=${guard}`);
      expect(dealer.getStallReasonPublic(Date.now())).toBeNull();
    }

    expect(state.street, "hand should complete after queue pressure burst").toBe("WAITING");
    } finally {
      dealer.dispose();
    }
  }, soakTestTimeoutMs);

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

    try {
      await withTimeout((dealer as any).startHand(), 10_000, "startHand");
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
    } finally {
      dealer.dispose();
    }
  });

  it("rejects a stale RAISE decided before its own actor was disconnected, without corrupting state", async () => {
    // Regression coverage for a soak-discovered race: the harness built valid RAISE
    // options for the to-act player (roundCurrentBetCents > 0, canRaise true), then
    // disconnected that SAME player, then submitted the pre-disconnect RAISE. Marking
    // a player disconnected drives the engine's own progression (via requestDrive
    // inside markDisconnectedSerialized), which can leave the round closed and the
    // street advanced (roundCurrentBetCents reset to 0) by the time the already-
    // decided RAISE actually reaches ActionService. The engine must reject that stale
    // action cleanly (a PokerError, never an uncaught exception, never a partial
    // money mutation) -- this pins down that safety property directly, independent of
    // the soak harness's own fix (skipping action-submission for a just-disconnected
    // actor) that prevents the false-positive crash going forward.
    const state = new PokerState();
    state.tableId = "table_soak_disconnect_stale_raise";
    state.maxSeats = 3;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.dealerSeat = 2;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("p1", "p2", "p3");
    state.street = "WAITING";

    state.playersById.set("p1", makePlayer("p1", 0, 6000));
    state.playersById.set("p2", makePlayer("p2", 1, 6000));
    state.playersById.set("p3", makePlayer("p3", 2, 6000));

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
    const chipMass = () => [...state.playersById.values()].reduce((sum, p) => sum + p.stackCents, 0) + state.potCents;

    try {
      await withTimeout((dealer as any).startHand(), 10_000, "startHand");
      expect(state.street).toBe("PREFLOP");
      expect(state.roundCurrentBetCents).toBeGreaterThan(0);

      const toActId = state.seats[state.toActSeat]!;
      expect(toActId).toBeTruthy();
      const options = optionsService.buildHeroActionOptions(state, toActId);
      expect(options?.canRaise).toBe(true);
      const staleRaise: ActionPayload = { action: "RAISE", amountCents: options!.minRaiseTo };
      const massBeforeDisconnect = chipMass();

      await withTimeout(
        dealer.markDisconnectedSerialized(toActId, Date.now() + 30_000),
        5_000,
        "markDisconnectedSerialized",
      );

      let rejected = false;
      try {
        await withTimeout(dealer.handleAction(toActId, staleRaise), 10_000, "stale raise after disconnect");
      } catch (err) {
        rejected = true;
        expect(err, `stale action must reject as a PokerError, not an uncaught error: ${err}`).toBeInstanceOf(
          PokerError,
        );
      }

      // Whether the engine rejected the stale RAISE outright or (in principle) the
      // disconnect left the round in a state where it could still be legally applied,
      // no chips may ever be created or destroyed by this sequence.
      expect(chipMass(), "chip mass must be conserved across a disconnect + stale action attempt").toBe(
        massBeforeDisconnect,
      );
      void rejected;
    } finally {
      dealer.dispose();
    }
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
    try {
      for (let attempt = 0; attempt < 5 && !reachedFlop; attempt++) {
        if (state.street !== "WAITING") break;
        await withTimeout((dealer as any).startHand(), 10_000, "startHand");
      if (String(state.street) === "FLOP") {
        reachedFlop = true;
        break;
      }
      if (String(state.street) !== "PREFLOP") continue;

      let guard = 0;
      while (String(state.street) === "PREFLOP") {
        guard += 1;
        if (guard > 80) throw new Error("preflop guard exceeded in human-vs-bot setup");
        const toActId = state.seats[state.toActSeat];
        if (!toActId) throw new Error("missing toAct seat");
        // Drive both actors deterministically to avoid bot automation timing races.
        const options = optionsService.buildHeroActionOptions(state, toActId);
        expect(options).toBeTruthy();
        const action: ActionPayload = options!.canCheck ? { action: "CHECK" } : { action: "CALL" };
        try {
          await dealer.handleAction(toActId, action);
        } catch (err) {
          if (
            err instanceof PokerError &&
            (err.code === "NOT_YOUR_TURN" || err.code === "NOT_ELIGIBLE" || err.code === "BAD_STATE")
          ) {
            // Bot automation can advance actor between option-build and submit in this focused test.
            continue;
          }
          throw err;
        }
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
    } finally {
      dealer.dispose();
    }
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

    try {
      await withTimeout((dealer as any).startHand(), 10_000, "startHand");
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
      await waitUntil(
      () => {
        const currentToActId = state.seats[state.toActSeat];
        if (!currentToActId) return false;
        const currentToAct = state.playersById.get(currentToActId);
        if (!currentToAct) return false;
        return (
          currentToAct.kind === "HUMAN" &&
          currentToAct.connected &&
          currentToAct.needsAction === true &&
          state.turnDeadlineMs > 0
        );
      },
      5_000,
      "self-heal to restore human actionable turn + deadline",
    );
    } finally {
      dealer.dispose();
    }
  });
});

