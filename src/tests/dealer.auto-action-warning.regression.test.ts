import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer, type DealerDiagnosticType } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { getActionableToActSeatFindingFromState, getStateMoneyFindings } from "../engine/invariants/churnInvariantContract.js";
import { expectDeferredOrRemoved } from "./helpers/churnBoundaryAssertions.js";
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
