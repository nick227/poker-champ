import { afterEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { CashierService } from "./economy/CashierService.js";

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

describe("Dealer between-hands tournament readiness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts the next hand when a disconnected tournament seat is ABANDONED but ready", async () => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });

    const state = new PokerState();
    state.tournamentMode = true;
    state.street = "WAITING";
    state.roundState = "HAND_COMPLETE";
    state.handId = "";
    state.toActSeat = -1;
    state.nextHandAtTs = 0;
    seatPlayer(state, 0, "active_human", "ACTIVE", true);
    seatPlayer(state, 1, "dormant_human", "ABANDONED", false);

    const dealer = new Dealer(state);
    dealer.stopDisconnectSweep();

    try {
      await (dealer as any).requestDrive("NEXT_HAND_START_IMMEDIATE");
    } finally {
      dealer.dispose();
    }

    expect(state.street).toBe("PREFLOP");
    expect(state.handId).toMatch(/^hand_/);
  });
});
