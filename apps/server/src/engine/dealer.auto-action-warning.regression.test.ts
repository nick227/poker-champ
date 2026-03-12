import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer, type DealerDiagnosticType } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { CashierService } from "./economy/CashierService.js";
import { getActionableToActSeatFindingFromState, getStateMoneyFindings } from "./invariants/churnInvariantContract.js";
import { expectDeferredOrRemoved } from "../tests/helpers/churnBoundaryAssertions.js";
import { getAutoActionHandCap } from "../config/seats.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  roundBetCents: number;
  committedCents: number;
  status: PlayerState["status"];
  needsAction: boolean;
  kind: "HUMAN" | "BOT";
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.name = input.id;
  p.kind = input.kind;
  p.seat = input.seat;
  p.stackCents = input.stackCents;
  p.roundBetCents = input.roundBetCents;
  p.committedCents = input.committedCents;
  p.status = input.status;
  p.needsAction = input.needsAction;
  p.connected = true;
  return p;
}

function assertChurnStateInvariants(state: PokerState): void {
  expect(getStateMoneyFindings(state)).toEqual([]);
  expect(getActionableToActSeatFindingFromState(state)).toBeNull();
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleToWaiting(dealer: Dealer, state: PokerState, maxSteps = 40): Promise<void> {
  for (let i = 0; i < maxSteps && state.street !== "WAITING"; i += 1) {
    if (state.street === "SHOWDOWN") {
      await delay(60);
      continue;
    }
    const toActUserId = state.seats[state.toActSeat];
    if (!toActUserId) {
      await delay(50);
      continue;
    }
    const player = state.playersById.get(toActUserId);
    if (!player || player.status !== "ACTIVE" || !player.needsAction) {
      await delay(50);
      continue;
    }
    const callAmount = Math.max(0, state.roundCurrentBetCents - player.roundBetCents);
    const action = callAmount === 0
      ? { action: "CHECK" as const }
      : player.stackCents <= callAmount
        ? { action: "ALL_IN" as const }
        : { action: "CALL" as const };
    try {
      await dealer.handleAction(toActUserId, action, `leave-r01-${i}`);
    } catch {
      await delay(60);
    }
    await delay(60);
  }
  await waitFor(() => state.street === "WAITING", 12000, "settle hand to WAITING");
}

describe("dealer auto-action warning regressions", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({ success: true, newTableBalance: 5000 });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AUTO-WARN-R01: stale queued call normalizes to legal auto action without denylist diagnostics", async () => {
    const state = new PokerState();
    state.tableId = "table_auto_warn_regression";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_auto_warn_regression";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.initialChipMassCents = 10000;
    state.potCents = 200;
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.toActSeat = 1;
    state.seats.push("u1", "bot_1", "", "", "", "");

    const human = makePlayer({
      id: "u1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    const bot = makePlayer({
      id: "bot_1",
      seat: 1,
      kind: "BOT",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(human.id, human);
    state.playersById.set(bot.id, bot);

    const dealer = new Dealer(state);
    const diagnostics: DealerDiagnosticType[] = [];
    const detach = dealer.addDiagnosticListener((event) => {
      diagnostics.push(event.type);
    });

    (dealer as any).enqueueInternalAction("bot_1", { action: "CALL" }, 0);
    await waitFor(() => state.toActSeat === 0, 2500, "auto action progression");

    const denylistHit = diagnostics.some((d) => d === "QUEUED_AUTO_ACTION_FAILED" || d === "QUEUE_RECOVERY_AFTER_FAILURE");
    expect(denylistHit).toBe(false);
    assertChurnStateInvariants(state);
    detach();
  });

  it("AUTO-WARN-R02: queued auto-action is discarded when actor becomes ineligible before execution", async () => {
    const state = new PokerState();
    state.tableId = "table_auto_warn_regression_r02";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_auto_warn_regression_r02";
    state.handNumber = 2;
    state.street = "PREFLOP";
    state.initialChipMassCents = 10000;
    state.potCents = 200;
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.toActSeat = 1;
    state.seats.push("u1", "bot_1", "", "", "", "");

    const human = makePlayer({
      id: "u1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: false,
    });
    const bot = makePlayer({
      id: "bot_1",
      seat: 1,
      kind: "BOT",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(human.id, human);
    state.playersById.set(bot.id, bot);

    const dealer = new Dealer(state);
    const diagnostics: DealerDiagnosticType[] = [];
    const detach = dealer.addDiagnosticListener((event) => {
      diagnostics.push(event.type);
    });

    const botRoundBetBefore = bot.roundBetCents;
    const botStackBefore = bot.stackCents;
    (dealer as any).enqueueInternalAction("bot_1", { action: "CALL" }, 60);

    await delay(10);
    bot.status = "ABANDONED";
    bot.needsAction = false;
    human.needsAction = true;
    state.toActSeat = human.seat;

    await waitFor(
      () => diagnostics.includes("QUEUED_AUTO_ACTION_STALE_DISCARDED") || diagnostics.includes("QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED"),
      2500,
      "queued auto action discard diagnostic",
    );

    expect(bot.roundBetCents).toBe(botRoundBetBefore);
    expect(bot.stackCents).toBe(botStackBefore);
    expect(state.toActSeat).toBe(human.seat);
    assertChurnStateInvariants(state);
    expect(diagnostics).not.toContain("QUEUED_AUTO_ACTION_FAILED");
    expect(diagnostics).not.toContain("QUEUE_RECOVERY_AFTER_FAILURE");
    detach();
  });

  it("DRIVE-R01: ACTION_RESOLVED_NEXT_ACTOR trigger drives bot automation", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r01";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addBot("bot_1", "bot_1", 5000);
    await waitFor(() => state.street !== "WAITING", 4000, "active hand");

    const bot = state.playersById.get("bot_1");
    const human = state.playersById.get("u1");
    expect(bot).toBeTruthy();
    expect(human).toBeTruthy();
    if (!bot || !human) return;

    // Force bot as current actor and ensure the hand is still actionable.
    state.toActSeat = bot.seat;
    bot.needsAction = true;
    bot.status = "ACTIVE";
    human.needsAction = false;
    state.turnDeadlineMs = 0;

    const beforeSeq = state.handActionSeq;
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    await waitFor(() => state.handActionSeq > beforeSeq || state.street === "WAITING", 3000, "bot auto-action progression");
  });

  it("DRIVE-R02: invalid toAct seat is repaired to an actionable player", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r02";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_drive_r02";
    state.handNumber = 1;
    state.street = "FLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.seats.push("u1", "u2", "u3", "", "", "");

    const p1 = makePlayer({
      id: "u1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: false,
    });
    const p2 = makePlayer({
      id: "u2",
      seat: 1,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: false,
    });
    const p3 = makePlayer({
      id: "u3",
      seat: 2,
      kind: "BOT",
      stackCents: 4900,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(p1.id, p1);
    state.playersById.set(p2.id, p2);
    state.playersById.set(p3.id, p3);
    state.toActSeat = p1.seat; // invalid: does not need action

    const dealer = new Dealer(state);
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    expect(state.toActSeat).toBe(p3.seat);
    assertChurnStateInvariants(state);
  });

  it("DRIVE-R03: disconnected human toAct progresses via automated action", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r03";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_drive_r03";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.seats.push("h1", "b1", "", "", "", "");

    const human = makePlayer({
      id: "h1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    human.connected = false;

    const bot = makePlayer({
      id: "b1",
      seat: 1,
      kind: "BOT",
      stackCents: 4900,
      roundBetCents: 50,
      committedCents: 50,
      status: "ACTIVE",
      needsAction: true,
    });

    state.playersById.set(human.id, human);
    state.playersById.set(bot.id, bot);
    state.toActSeat = human.seat;

    const dealer = new Dealer(state);
    const beforeSeq = state.handActionSeq;
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    await waitFor(
      () => state.handActionSeq > beforeSeq || state.toActSeat !== human.seat || state.street === "WAITING",
      3000,
      "disconnected human auto progression",
    );
  });

  it("DRIVE-R04: unseated toAct actor is repaired to actionable seat", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r04";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_drive_r04";
    state.handNumber = 1;
    state.street = "TURN";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.potCents = 600;
    state.seats.push("", "u2", "u3", "", "", "");

    const stale = makePlayer({
      id: "u1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: true,
    });
    const p2 = makePlayer({
      id: "u2",
      seat: 1,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: false,
    });
    const p3 = makePlayer({
      id: "u3",
      seat: 2,
      kind: "BOT",
      stackCents: 4900,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: true,
    });

    // u1 exists in map but is no longer seated; toActSeat points to an empty seat.
    state.playersById.set(stale.id, stale);
    state.playersById.set(p2.id, p2);
    state.playersById.set(p3.id, p3);
    state.toActSeat = 0;

    const dealer = new Dealer(state);
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    expect(state.toActSeat).toBe(2);
  });

  it("DRIVE-R05: round-closed state self-heals by advancing street/showdown", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r05";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addPlayer("u2", "u2", 5000);
    await waitFor(() => state.street === "PREFLOP", 4000, "prefop started for round-close self-heal");

    const p1 = state.playersById.get("u1");
    const p2 = state.playersById.get("u2");
    expect(p1).toBeTruthy();
    expect(p2).toBeTruthy();
    if (!p1 || !p2) return;

    // Corrupt into "round closed but still waiting" by matching bets and clearing needsAction.
    const closeBet = Math.max(state.roundCurrentBetCents, p1.roundBetCents, p2.roundBetCents);
    p1.roundBetCents = closeBet;
    p2.roundBetCents = closeBet;
    p1.needsAction = false;
    p2.needsAction = false;
    state.roundCurrentBetCents = closeBet;

    const streetBefore = state.street;
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    await waitFor(
      () => state.street !== streetBefore || state.runoutMode === "STAGED" || state.street === "WAITING",
      3000,
      "round-closed self-heal advance",
    );
    expect(state.street).not.toBe(streetBefore);
  });

  it("DRIVE-R06: human disconnect at turn start progresses without requiring a human deadline", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r06";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("h1", "h1", 5000);
    await dealer.addBot("b1", "b1", 5000);
    await waitFor(() => state.street !== "WAITING", 4000, "active hand for disconnect progression");

    // Ensure the disconnected human is actually to-act before validating auto-progression.
    for (let i = 0; i < 6; i += 1) {
      const toActUserId = state.seats[state.toActSeat] ?? "";
      if (toActUserId === "h1") break;
      const before = state.handActionSeq;
      await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
      await waitFor(() => state.handActionSeq > before || state.street === "WAITING", 2000, "advance to human turn");
      if (state.street === "WAITING") {
        await dealer.forceAdvanceToNextHandForTest();
        await waitFor(() => state.street !== "WAITING", 4000, "new hand while rotating to human");
      }
    }

    const human = state.playersById.get("h1");
    expect(human).toBeTruthy();
    if (!human) return;
    expect(state.seats[state.toActSeat]).toBe("h1");
    human.connected = false;
    human.needsAction = true;
    state.turnDeadlineMs = 0;

    const beforeSeq = state.handActionSeq;
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    await waitFor(
      () => state.handActionSeq > beforeSeq || state.seats[state.toActSeat] !== "h1" || state.street === "WAITING",
      3000,
      "disconnected human turn progression",
    );
    expect(state.turnDeadlineMs).toBe(0);
    await (dealer as any).actionQueue.catch(() => undefined);
    dealer.dispose();
  }, 20000);

  it("RETRY-R01: same actionId replay while action is pending is idempotent", async () => {
    const state = new PokerState();
    state.tableId = "table_retry_r01";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addPlayer("u2", "u2", 5000);
    await waitFor(() => state.street !== "WAITING", 4000, "active hand for retry idempotency");

    const toActUserId = state.seats[state.toActSeat];
    expect(toActUserId).toBeTruthy();
    if (!toActUserId) return;
    const toActPlayer = state.playersById.get(toActUserId);
    expect(toActPlayer).toBeTruthy();
    if (!toActPlayer) return;

    const callAmount = Math.max(0, state.roundCurrentBetCents - toActPlayer.roundBetCents);
    const action =
      callAmount === 0
        ? ({ action: "CHECK" } as const)
        : toActPlayer.stackCents <= callAmount
          ? ({ action: "ALL_IN" } as const)
          : ({ action: "CALL" } as const);

    const beforeSeq = state.handActionSeq;
    const actionId = `retry-r01-${Date.now()}`;
    const [r1, r2] = await Promise.all([
      dealer.handleAction(toActUserId, action, actionId).catch((err) => err as Error & { code?: string }),
      dealer.handleAction(toActUserId, action, actionId).catch((err) => err as Error & { code?: string }),
    ]);

    const errors = [r1, r2].filter((v): v is Error & { code?: string } => v instanceof Error);
    if (errors.length > 0) {
      const duplicateLike = errors.some((err) =>
        err.code === "DUPLICATE_ACTION" || err.code === "NOT_YOUR_TURN" || err.code === "NOT_ELIGIBLE"
      );
      expect(duplicateLike).toBe(true);
    }

    expect(state.handActionSeq).toBe(beforeSeq + 1);
    assertChurnStateInvariants(state);
    dealer.dispose();
  });

  it("AUTO-WARN-R05: queued auto-action from prior hand is discarded after hand transition", async () => {
    const state = new PokerState();
    state.tableId = "table_auto_warn_regression_r05";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_auto_warn_regression_r05_a";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.toActSeat = 1;
    state.seats.push("u1", "bot_1", "", "", "", "");

    const human = makePlayer({
      id: "u1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: false,
    });
    const bot = makePlayer({
      id: "bot_1",
      seat: 1,
      kind: "BOT",
      stackCents: 4950,
      roundBetCents: 50,
      committedCents: 50,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(human.id, human);
    state.playersById.set(bot.id, bot);

    const dealer = new Dealer(state);
    const diagnostics: DealerDiagnosticType[] = [];
    const detach = dealer.addDiagnosticListener((event) => diagnostics.push(event.type));
    (dealer as any).enqueueInternalAction("bot_1", { action: "FOLD" }, 100);

    await delay(10);
    state.handId = "hand_auto_warn_regression_r05_b";
    state.street = "WAITING";
    state.toActSeat = -1;
    state.handActionSeq = 0;
    bot.needsAction = false;

    await waitFor(
      () => diagnostics.includes("QUEUED_AUTO_ACTION_STALE_DISCARDED"),
      2500,
      "queued action stale after hand transition",
    );
    expect(state.handId).toBe("hand_auto_warn_regression_r05_b");
    expect(state.handActionSeq).toBe(0);
    detach();
    dealer.dispose();
  });

  it("TIMER-RACE-R01: repeated drive on same human turn keeps one timer identity", async () => {
    const state = new PokerState();
    state.tableId = "table_timer_race_r01";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addPlayer("u2", "u2", 5000);
    await waitFor(() => state.street !== "WAITING", 4000, "active hand for timer race");

    const toActUserId = state.seats[state.toActSeat];
    expect(toActUserId).toBeTruthy();
    if (!toActUserId) return;
    const toAct = state.playersById.get(toActUserId);
    expect(toAct?.kind).toBe("HUMAN");

    await Promise.all(
      Array.from({ length: 12 }, () => (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR")),
    );

    const turnManager = (dealer as any).turnManager;
    const scheduler = turnManager?.turnTimeoutScheduler;
    const firstKey = scheduler?.pendingHumanTurnTimeoutKey;
    const firstId = scheduler?.pendingHumanTurnTimeoutId;
    const firstDeadline = state.turnDeadlineMs;

    await Promise.all(
      Array.from({ length: 12 }, () => (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR")),
    );

    const secondKey = scheduler?.pendingHumanTurnTimeoutKey;
    const secondId = scheduler?.pendingHumanTurnTimeoutId;
    const secondDeadline = state.turnDeadlineMs;

    expect(typeof firstKey).toBe("string");
    expect(firstKey?.length ?? 0).toBeGreaterThan(0);
    expect(firstId).toBeTruthy();
    expect(firstDeadline).toBeGreaterThan(0);
    expect(secondKey).toBe(firstKey);
    expect(secondId).toBe(firstId);
    expect(secondDeadline).toBe(firstDeadline);
    dealer.dispose();
  });

  it("TIMER-RACE-R02: actor change re-arms timer ownership and old timer callback is inert", async () => {
    const state = new PokerState();
    state.tableId = "table_timer_race_r02";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_timer_race_r02";
    state.handNumber = 1;
    state.street = "FLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 200;
    state.toActSeat = 0;
    state.seats.push("h1", "h2", "", "", "", "");

    const h1 = makePlayer({
      id: "h1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    const h2 = makePlayer({
      id: "h2",
      seat: 1,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(h1.id, h1);
    state.playersById.set(h2.id, h2);

    const timeoutCallbacks: Array<() => void> = [];
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const handles = new Map<number, () => void>();
    let nextHandle = 1;

    const dealer = new Dealer(state);
    try {
      vi.spyOn(global, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, _ms?: number) => {
        const handle = nextHandle++;
        const fn = () => cb();
        handles.set(handle, fn);
        timeoutCallbacks.push(fn);
        return handle as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);
      vi.spyOn(global, "clearTimeout").mockImplementation(((id: ReturnType<typeof setTimeout>) => {
        handles.delete(Number(id));
      }) as typeof clearTimeout);

      await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
      const scheduler = (dealer as any).turnManager?.turnTimeoutScheduler;
      const firstKey = scheduler?.pendingHumanTurnTimeoutKey as string;
      expect(firstKey).toContain(":h1");

      state.toActSeat = 1;
      h1.needsAction = false;
      h2.needsAction = true;
      await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
      const secondKey = scheduler?.pendingHumanTurnTimeoutKey as string;
      expect(secondKey).toContain(":h2");
      expect(secondKey).not.toBe(firstKey);

      // Simulate old timeout callback firing late after actor changed.
      timeoutCallbacks[0]?.();
      await (dealer as any).actionQueue.catch(() => undefined);

      expect(state.toActSeat).toBe(1);
      expect(state.turnDeadlineMs).toBeGreaterThan(0);
      expect((scheduler?.pendingHumanTurnTimeoutKey as string) ?? "").toContain(":h2");
    } finally {
      dealer.dispose();
      vi.restoreAllMocks();
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    }
  });

  it("TIMER-RACE-R03: timeout callback after manual action is inert for stale turn token", async () => {
    const state = new PokerState();
    state.tableId = "table_timer_race_r03";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_timer_race_r03";
    state.handNumber = 1;
    state.street = "FLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 200;
    state.toActSeat = 0;
    state.seats.push("h1", "h2", "", "", "", "");

    const h1 = makePlayer({
      id: "h1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    const h2 = makePlayer({
      id: "h2",
      seat: 1,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(h1.id, h1);
    state.playersById.set(h2.id, h2);

    const timeoutCallbacks: Array<() => void> = [];
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const dealer = new Dealer(state);
    try {
      vi.spyOn(global, "setTimeout").mockImplementation(((cb: (...args: unknown[]) => void, _ms?: number) => {
        const fn = () => cb();
        timeoutCallbacks.push(fn);
        return timeoutCallbacks.length as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);
      vi.spyOn(global, "clearTimeout").mockImplementation((() => {}) as typeof clearTimeout);

      await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
      const beforeSeq = state.handActionSeq;
      await dealer.handleAction("h1", { action: "CHECK" }, `timer-r03-${Date.now()}`);
      expect(state.handActionSeq).toBe(beforeSeq + 1);

      const h2StatusBefore = state.playersById.get("h2")?.status;
      timeoutCallbacks[0]?.();
      await (dealer as any).actionQueue.catch(() => undefined);

      // Late timeout from previous actor must not mutate the progressed turn.
      expect(state.seats[state.toActSeat]).toBe("h2");
      expect(state.playersById.get("h2")?.status).toBe(h2StatusBefore);
    } finally {
      dealer.dispose();
      vi.restoreAllMocks();
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    }
  });

  it("DRIVE-R07: removing active toAct seat clears stale timer ownership and re-derives actor", async () => {
    const state = new PokerState();
    state.tableId = "table_drive_r07";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_drive_r07";
    state.handNumber = 1;
    state.street = "TURN";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.toActSeat = 0;
    state.seats.push("h1", "h2", "", "", "", "");

    const h1 = makePlayer({
      id: "h1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    const h2 = makePlayer({
      id: "h2",
      seat: 1,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: true,
    });
    state.playersById.set(h1.id, h1);
    state.playersById.set(h2.id, h2);

    const dealer = new Dealer(state);
    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    const scheduler = (dealer as any).turnManager?.turnTimeoutScheduler;
    const beforeKey = String(scheduler?.pendingHumanTurnTimeoutKey ?? "");
    expect(beforeKey).toContain(":h1");

    state.seats[0] = "";
    state.playersById.delete("h1");
    state.toActSeat = 0;

    await (dealer as any).requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
    const afterKey = String(scheduler?.pendingHumanTurnTimeoutKey ?? "");
    expect(state.toActSeat).toBe(1);
    expect(afterKey).toContain(":h2");
    expect(afterKey).not.toContain(":h1");
    dealer.dispose();
  });

  it("LEAVE-R01: leave while to-act with queued auto-action defers removal until WAITING boundary", async () => {
    const state = new PokerState();
    state.tableId = "table_leave_r01";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    const diagnostics: DealerDiagnosticType[] = [];
    const detach = dealer.addDiagnosticListener((event) => diagnostics.push(event.type));

    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addPlayer("u2", "u2", 5000);
    await dealer.addPlayer("u3", "u3", 5000);
    await waitFor(() => state.street !== "WAITING", 4000, "active hand");

    const leavingUserId = state.seats[state.toActSeat];
    expect(leavingUserId).toBeTruthy();
    (dealer as any).enqueueInternalAction(String(leavingUserId), { action: "CALL" }, 100);

    const handIdBeforeLeave = state.handId;
    await dealer.handleConsentedLeave(String(leavingUserId));
    expectDeferredOrRemoved({ state, userId: String(leavingUserId), handIdBefore: handIdBeforeLeave });

    await settleToWaiting(dealer, state);
    await waitFor(() => !state.playersById.has(String(leavingUserId)), 5000, "deferred removal at waiting boundary");

    const leavingSeatStillOccupied = state.seats.some((id) => id === leavingUserId);
    expect(leavingSeatStillOccupied).toBe(false);
    expect(diagnostics).toContain("LIFECYCLE_DEFERRED_REMOVAL");
    expect(diagnostics).not.toContain("QUEUED_AUTO_ACTION_FAILED");
    expect(diagnostics).not.toContain("QUEUE_RECOVERY_AFTER_FAILURE");
    assertChurnStateInvariants(state);
    detach();
  }, 30000);

  it("AUTO-WARN-R03: queued bot all-in on round-closure boundary does not emit QUEUED_AUTO_ACTION_FAILED", async () => {
    const state = new PokerState();
    state.tableId = "table_auto_warn_regression_r03";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    const diagnostics: DealerDiagnosticType[] = [];
    const detach = dealer.addDiagnosticListener((event) => diagnostics.push(event.type));

    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addPlayer("u2", "u2", 5000);
    await dealer.addPlayer("u3", "u3", 5000);
    await dealer.addPlayer("u4", "u4", 5000);
    await dealer.addBot("bot_a", "bot_a", 5000);
    await dealer.addBot("bot_b", "bot_b", 5000);
    await waitFor(() => state.street !== "WAITING", 4000, "active hand");
    await settleToWaiting(dealer, state);
    await dealer.forceAdvanceToNextHandForTest();
    await waitFor(() => state.street === "PREFLOP" && Boolean(state.handId), 4000, "fresh six-player preflop hand");

    // Recreate the artifact boundary: three active callers below current level, two all-ins at level, folded seat.
    const u1 = state.playersById.get("u1")!;
    const u2 = state.playersById.get("u2")!;
    const u3 = state.playersById.get("u3")!;
    const u4 = state.playersById.get("u4")!;
    const botA = state.playersById.get("bot_a")!;
    const botB = state.playersById.get("bot_b")!;
    state.street = "PREFLOP";
    state.roundCurrentBetCents = 5000;
    state.minRaiseCents = 4667;
    state.potCents = 19351;
    state.toActSeat = botB.seat;

    u1.status = "ACTIVE";
    u1.stackCents = 283;
    u1.roundBetCents = 4767;
    u1.committedCents = 4767;
    u1.needsAction = false;

    u2.status = "ACTIVE";
    u2.stackCents = 183;
    u2.roundBetCents = 4767;
    u2.committedCents = 4767;
    u2.needsAction = false;

    u3.status = "ACTIVE";
    u3.stackCents = 233;
    u3.roundBetCents = 4767;
    u3.committedCents = 4767;
    u3.needsAction = false;

    u4.status = "FOLDED";
    u4.stackCents = 4950;
    u4.roundBetCents = 50;
    u4.committedCents = 50;
    u4.needsAction = false;

    botA.status = "ALL_IN";
    botA.stackCents = 0;
    botA.roundBetCents = 5000;
    botA.committedCents = 5000;
    botA.needsAction = false;

    botB.status = "ACTIVE";
    botB.stackCents = 5000;
    botB.roundBetCents = 0;
    botB.committedCents = 0;
    botB.needsAction = true;

    (dealer as any).enqueueInternalAction("bot_b", { action: "ALL_IN" }, 0);
    await waitFor(
      () => diagnostics.length > 0 || state.handActionSeq > 0 || state.street === "SHOWDOWN" || state.street === "WAITING",
      30000,
      "queued bot all-in progression",
    );
    await (dealer as any).actionQueue;

    expect(diagnostics).not.toContain("QUEUED_AUTO_ACTION_FAILED");
    expect(diagnostics).not.toContain("QUEUE_RECOVERY_AFTER_FAILURE");
    assertChurnStateInvariants(state);
    detach();
  }, 60000);

  it("AUTO-WARN-R04: auto-action cap re-syncs roundCurrentBet and preserves actionable toAct seat", async () => {
    const state = new PokerState();
    state.tableId = "table_auto_warn_regression_r04";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_auto_warn_regression_r04";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.potCents = 150;
    state.minRaiseCents = 100;
    state.roundCurrentBetCents = 100;
    state.toActSeat = 1;
    state.seats.push("u1", "u2", "", "", "", "");

    const capped = makePlayer({
      id: "u1",
      seat: 0,
      kind: "HUMAN",
      stackCents: 4900,
      roundBetCents: 100,
      committedCents: 100,
      status: "ACTIVE",
      needsAction: false,
    });
    capped.connected = false;

    const other = makePlayer({
      id: "u2",
      seat: 1,
      kind: "HUMAN",
      stackCents: 4950,
      roundBetCents: 50,
      committedCents: 50,
      status: "ACTIVE",
      needsAction: true,
    });

    state.playersById.set(capped.id, capped);
    state.playersById.set(other.id, other);

    const dealer = new Dealer(state);
    (dealer as any).currentHandAutoActedUserIds.add("u1");
    (dealer as any).autoActionsByUserId.set("u1", Math.max(0, getAutoActionHandCap() - 1));

    await (dealer as any).applyDisconnectedAutoActionCapForHand();

    expect(state.playersById.get("u1")?.status).toBe("ABANDONED");
    expect(state.roundCurrentBetCents).toBe(50);
    expect(state.toActSeat).toBe(1);
    assertChurnStateInvariants(state);
  });
});
