import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "../../engine/Dealer.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { resolvePlayersReadyForNextHand } from "../../engine/dealer/utils/TableNavigator.js";

vi.setConfig({ testTimeout: 20_000 });

function initSeatRows(state: PokerState, seatCount = 6): void {
  state.maxSeats = seatCount;
  state.seats.length = 0;
  for (let i = 0; i < seatCount; i += 1) state.seats.push("");
}

function seatPlayer(
  state: PokerState,
  seat: number,
  id: string,
  status: PlayerState["status"],
  connected: boolean,
): void {
  const player = new PlayerState();
  player.id = id;
  player.userId = id;
  player.name = id;
  player.kind = "HUMAN";
  player.seat = seat;
  player.status = status;
  player.connected = connected;
  player.stackCents = 5000;
  state.playersById.set(id, player);
  state.seats[seat] = id;
}

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

async function createHeadsUpDealer(options?: { tournamentMode?: boolean }): Promise<{
  dealer: Dealer;
  state: PokerState;
}> {
  const state = new PokerState();
  state.tableId = `table_between_hands_${Date.now()}`;
  state.maxSeats = 6;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.minBuyInCents = 2000;
  state.maxBuyInCents = 20_000;
  state.tournamentMode = options?.tournamentMode === true;

  const dealer = new Dealer(state);
  dealer.stopDisconnectSweep();

  await dealer.addPlayer("player_a", "Player A", 5000);
  await dealer.addPlayer("player_b", "Player B", 5000);

  return { dealer, state };
}

function teardownDealer(dealer: Dealer): void {
  (dealer as { turnManager?: { clearPendingHumanTurnTimeout: () => void } }).turnManager
    ?.clearPendingHumanTurnTimeout();
  dealer.stopDisconnectSweep();
  dealer.dispose();
}

describe("dealer between-hands lifecycle integration", () => {
  beforeEach(() => {
    vi.stubEnv("HAND_RESULT_HOLD_MS", "0");
    vi.stubEnv("POKER_BOT_DELAY_MS", "0");
    vi.stubEnv("RUNOUT_STAGE_DELAY_MS", "0");
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("full lifecycle: fold ends hand, scheduleNextHand runs, next hand deals without manual startHand", async () => {
    vi.useFakeTimers();
    const { dealer, state } = await createHeadsUpDealer({ tournamentMode: true });
    const scheduleSpy = vi.spyOn((dealer as { handOrchestrator: { scheduleNextHand: (...args: unknown[]) => void } }).handOrchestrator, "scheduleNextHand");

    try {
      const hand1 = state.handId;
      expect(state.street).toBe("PREFLOP");

      const toActUserId = state.seats[state.toActSeat] ?? "";
      await dealer.handleAction(toActUserId, { action: "FOLD" });
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(5000);
      await flushAsyncWork();

      expect(scheduleSpy).toHaveBeenCalled();
      expect(scheduleSpy.mock.calls.some((call) => call[0] === "HAND_END")).toBe(true);
      expect(state.street).toBe("PREFLOP");
      expect(state.handId).toMatch(/^hand_/);
      expect(state.handId).not.toBe(hand1);
    } finally {
      teardownDealer(dealer);
      scheduleSpy.mockRestore();
    }
  });

  it("tournament + disconnect: next hand deals when one seat is disconnected between hands", async () => {
    vi.useFakeTimers();
    const { dealer, state } = await createHeadsUpDealer({ tournamentMode: true });

    try {
      const hand1 = state.handId;
      await dealer.markDisconnectedSerialized("player_b", Date.now() + 120_000);
      await flushAsyncWork();

      const toActUserId = state.seats[state.toActSeat] ?? "";
      await dealer.handleAction(toActUserId, { action: "FOLD" });
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(5000);
      await flushAsyncWork();

      expect(state.street).toBe("PREFLOP");
      expect(state.handId).not.toBe(hand1);
      expect(resolvePlayersReadyForNextHand(state).length).toBeGreaterThanOrEqual(2);
      expect(state.playersById.get("player_b")?.connected).toBe(false);
    } finally {
      teardownDealer(dealer);
    }
  });

  it("driveGame gate: deals when readyCount>=2 but activeCount=0 (dual ABANDONED)", async () => {
    const state = new PokerState();
    initSeatRows(state);
    state.tournamentMode = true;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.street = "WAITING";
    state.roundState = "HAND_COMPLETE";
    state.handId = "";
    state.toActSeat = -1;
    state.nextHandAtTs = 0;
    seatPlayer(state, 0, "ghost_a", "ABANDONED", false);
    seatPlayer(state, 1, "ghost_b", "ABANDONED", false);

    const dealer = new Dealer(state);
    dealer.stopDisconnectSweep();

    try {
      expect(resolvePlayersReadyForNextHand(state).length).toBe(2);
      expect([...state.playersById.values()].filter((p) => p.status === "ACTIVE").length).toBe(0);

      await (dealer as { requestDrive: (reason: string) => Promise<void> }).requestDrive(
        "NEXT_HAND_START_IMMEDIATE",
      );

      expect(state.street).toBe("PREFLOP");
      expect(state.handId).toMatch(/^hand_/);
    } finally {
      teardownDealer(dealer);
    }
  });

  it("driveGame gate: deals when readyCount>=2 but activeCount=0 (dual FOLDED)", async () => {
    const state = new PokerState();
    initSeatRows(state);
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.street = "WAITING";
    state.roundState = "HAND_COMPLETE";
    state.handId = "";
    state.toActSeat = -1;
    state.nextHandAtTs = 0;
    seatPlayer(state, 0, "player_a", "FOLDED", true);
    seatPlayer(state, 1, "player_b", "FOLDED", true);

    const dealer = new Dealer(state);
    dealer.stopDisconnectSweep();

    try {
      expect(resolvePlayersReadyForNextHand(state).length).toBe(2);
      expect([...state.playersById.values()].filter((p) => p.status === "ACTIVE").length).toBe(0);

      await (dealer as { requestDrive: (reason: string) => Promise<void> }).requestDrive(
        "NEXT_HAND_START_IMMEDIATE",
      );

      expect(state.street).toBe("PREFLOP");
      expect(state.handId).toMatch(/^hand_/);
    } finally {
      teardownDealer(dealer);
    }
  });
});
