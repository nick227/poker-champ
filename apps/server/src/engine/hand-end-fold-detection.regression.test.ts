import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { CashierService } from "./economy/CashierService.js";
import { assertStateInvariants } from "./invariants/assertState.js";
import { getActionableToActSeatFindingFromState, getStateMoneyFindings } from "./invariants/churnInvariantContract.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  status: PlayerState["status"];
  needsAction?: boolean;
  roundBetCents?: number;
  committedCents?: number;
  connected?: boolean;
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.stackCents = input.stackCents;
  p.status = input.status;
  p.needsAction = input.needsAction ?? false;
  p.roundBetCents = input.roundBetCents ?? 0;
  p.committedCents = input.committedCents ?? 0;
  p.connected = input.connected ?? true;
  return p;
}

function sumPayouts(payoutsByUserId: Record<string, number> | undefined): number {
  return Object.values(payoutsByUserId ?? {}).reduce((sum, value) => sum + value, 0);
}

function assertChurnStateInvariants(state: PokerState): void {
  expect(getStateMoneyFindings(state)).toEqual([]);
  expect(getActionableToActSeatFindingFromState(state)).toBeNull();
}

async function createDealerWithPlayers(count: number): Promise<{ dealer: Dealer; state: PokerState }> {
  const state = new PokerState();
  state.tableId = "table_fold_regression";
  state.maxSeats = 6;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.minBuyInCents = 2000;
  state.maxBuyInCents = 20000;

  const dealer = new Dealer(state);
  (dealer as any).scheduleNextHand = () => {};

  for (let i = 0; i < count; i += 1) {
    const id = `u${i + 1}`;
    await dealer.addPlayer(id, id, 5000);
  }

  return { dealer, state };
}

describe("hand-end fold detection regressions", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FOLD-R01: heads-up to-act fold ends hand immediately with valid terminal result", async () => {
    const { dealer, state } = await createDealerWithPlayers(2);
    const handId = state.handId;
    const toActUserId = state.seats[state.toActSeat];

    await dealer.handleAction(toActUserId!, { action: "FOLD" });

    const result = (dealer as any).lastHandResult as
      | { handId: string; reason: "LAST_PLAYER" | "SHOWDOWN"; potCents: number; payoutsByUserId: Record<string, number>; winnerId?: string }
      | undefined;

    expect(state.street).toBe("WAITING");
    expect(result?.handId).toBe(handId);
    expect(result?.reason).toBe("LAST_PLAYER");
    expect(result?.winnerId).toBeTruthy();
    expect(sumPayouts(result?.payoutsByUserId)).toBe(result?.potCents ?? -1);
    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("FOLD-R01B: last-standing result includes uncalled return chips in payout totals", async () => {
    const state = new PokerState();
    state.tableId = "table_fold_uncalled_return";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.handId = "hand_fold_uncalled_return";
    state.handNumber = 2;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 100;
    state.potCents = 150;
    state.initialChipMassCents = 15000;
    state.seats.push("u1", "u2", "", "", "", "");

    const folder = makePlayer({
      id: "u1",
      seat: 0,
      stackCents: 9950,
      status: "ACTIVE",
      roundBetCents: 50,
      committedCents: 50,
      needsAction: true,
    });
    const bettor = makePlayer({
      id: "u2",
      seat: 1,
      stackCents: 4900,
      status: "ACTIVE",
      roundBetCents: 100,
      committedCents: 100,
      needsAction: false,
    });
    state.playersById.set(folder.id, folder);
    state.playersById.set(bettor.id, bettor);

    const dealer = new Dealer(state);
    (dealer as any).scheduleNextHand = () => {};

    await dealer.handleAction("u1", { action: "FOLD" });

    const result = (dealer as any).lastHandResult as
      | { handId: string; reason: "LAST_PLAYER" | "SHOWDOWN"; winnerId?: string; potCents: number; payoutsByUserId: Record<string, number> }
      | undefined;

    expect(result?.reason).toBe("LAST_PLAYER");
    expect(result?.winnerId).toBe("u2");
    expect(result?.payoutsByUserId?.u2).toBe(150);
    expect(sumPayouts(result?.payoutsByUserId)).toBe(result?.potCents ?? -1);
    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("FOLD-R02: in 3-way hand, non-final fold does not end hand early", async () => {
    const { dealer, state } = await createDealerWithPlayers(2);
    await dealer.addPlayer("u3", "u3", 5000);

    const warmupToActUserId = state.seats[state.toActSeat];
    await dealer.handleAction(warmupToActUserId!, { action: "FOLD" });
    expect(state.street).toBe("WAITING");

    await dealer.forceAdvanceToNextHandForTest();
    expect(state.playersById.get("u3")?.status).toBe("ACTIVE");

    const handId = state.handId;
    const toActUserId = state.seats[state.toActSeat];

    await dealer.handleAction(toActUserId!, { action: "FOLD" });

    const result = (dealer as any).lastHandResult as { handId: string } | undefined;
    expect(state.street).not.toBe("WAITING");
    expect(result?.handId).not.toBe(handId);
    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("FOLD-R03: last eligible actor folding after prior all-in ends hand correctly", async () => {
    const state = new PokerState();
    state.tableId = "table_fold_last_eligible";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.street = "TURN";
    state.roundState = "WAITING_FOR_ACTION";
    state.handId = "hand_fold_last_eligible";
    state.handNumber = 8;
    state.toActSeat = 1;
    state.roundCurrentBetCents = 500;
    state.potCents = 3000;
    state.initialChipMassCents = 8000;
    state.seats.push("u1", "u2", "u3", "", "", "");

    const allIn = makePlayer({
      id: "u1",
      seat: 0,
      stackCents: 0,
      status: "ALL_IN",
      roundBetCents: 500,
      committedCents: 1000,
      needsAction: false,
    });
    const lastEligible = makePlayer({
      id: "u2",
      seat: 1,
      stackCents: 2000,
      status: "ACTIVE",
      roundBetCents: 500,
      committedCents: 1000,
      needsAction: true,
    });
    const folded = makePlayer({
      id: "u3",
      seat: 2,
      stackCents: 3000,
      status: "FOLDED",
      roundBetCents: 500,
      committedCents: 1000,
      needsAction: false,
    });

    state.playersById.set(allIn.id, allIn);
    state.playersById.set(lastEligible.id, lastEligible);
    state.playersById.set(folded.id, folded);

    const dealer = new Dealer(state);
    (dealer as any).scheduleNextHand = () => {};

    await dealer.handleAction("u2", { action: "FOLD" });

    const result = (dealer as any).lastHandResult as
      | { handId: string; reason: "LAST_PLAYER" | "SHOWDOWN"; winnerId?: string; potCents: number; payoutsByUserId: Record<string, number> }
      | undefined;

    expect(state.street).toBe("WAITING");
    expect(result?.reason).toBe("LAST_PLAYER");
    expect(result?.winnerId).toBe("u1");
    expect(sumPayouts(result?.payoutsByUserId)).toBe(result?.potCents ?? -1);
    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("FOLD-R04: manual/forced/auto folds converge to equivalent terminal money outcome", async () => {
    const runScenario = async (origin: "PLAYER" | "FORCED" | "AUTO") => {
      const state = new PokerState();
      state.tableId = `table_fold_origin_${origin}`;
      state.maxSeats = 6;
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.street = "RIVER";
      state.roundState = "WAITING_FOR_ACTION";
      state.handId = `hand_fold_origin_${origin}`;
      state.handNumber = 9;
      state.toActSeat = 0;
      state.roundCurrentBetCents = 400;
      state.potCents = 1600;
      state.initialChipMassCents = 6200;
      state.seats.push("u1", "u2", "", "", "", "");

      const actor = makePlayer({
        id: "u1",
        seat: 0,
        stackCents: 2400,
        status: "ACTIVE",
        roundBetCents: 400,
        committedCents: 800,
        needsAction: true,
      });
      const other = makePlayer({
        id: "u2",
        seat: 1,
        stackCents: 2200,
        status: "ACTIVE",
        roundBetCents: 400,
        committedCents: 800,
        needsAction: false,
      });
      state.playersById.set(actor.id, actor);
      state.playersById.set(other.id, other);

      const dealer = new Dealer(state);
      (dealer as any).scheduleNextHand = () => {};

      if (origin === "PLAYER") {
        await dealer.handleAction("u1", { action: "FOLD" });
      } else if (origin === "AUTO") {
        await (dealer as any)._handleAction("u1", { action: "FOLD" }, "AUTO");
      } else {
        await (dealer as any).forceFoldForLeave("u1");
      }

      const result = (dealer as any).lastHandResult as
        | { reason: "LAST_PLAYER" | "SHOWDOWN"; potCents: number; winnerId?: string; payoutsByUserId: Record<string, number> }
        | undefined;

      return {
        reason: result?.reason,
        winnerId: result?.winnerId,
        potCents: result?.potCents,
        totalPayout: sumPayouts(result?.payoutsByUserId),
      };
    };

    const manual = await runScenario("PLAYER");
    const forced = await runScenario("FORCED");
    const auto = await runScenario("AUTO");

    expect(manual).toEqual(forced);
    expect(manual).toEqual(auto);
  });

  it("FOLD-R05: fold during reconnect churn emits exactly one HAND_END transition", async () => {
    const reasons: string[] = [];
    const state = new PokerState();
    state.tableId = "table_fold_reconnect_churn";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state, undefined, {
      onTableSnapshotEmitted: ({ reason }) => {
        reasons.push(reason);
      },
    });
    (dealer as any).scheduleNextHand = () => {};

    await dealer.addPlayer("u1", "u1", 5000);
    await dealer.addPlayer("u2", "u2", 5000);

    const disconnectedUserId = state.seats[state.toActSeat]!;
    await dealer.markDisconnectedSerialized(disconnectedUserId, Date.now() + 60_000);
    await dealer.markReconnectedSerialized(disconnectedUserId);
    if (state.street === "WAITING") {
      await dealer.forceAdvanceToNextHandForTest();
    }
    const started = Date.now();
    while (Date.now() - started < 4000) {
      if (state.street !== "WAITING" && state.seats[state.toActSeat]) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    const handEndBefore = reasons.filter((r) => r === "HAND_END").length;
    const currentToActUserId = state.seats[state.toActSeat]!;
    await dealer.handleAction(currentToActUserId, { action: "FOLD" });
    const handEndAfter = reasons.filter((r) => r === "HAND_END").length;

    expect(handEndAfter - handEndBefore).toBe(1);
    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
});
