import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { CashierService } from "./economy/CashierService.js";

function makePlayer(id: string, seat: number): PlayerState {
  const player = new PlayerState();
  player.id = id;
  player.userId = id;
  player.name = id;
  player.kind = "HUMAN";
  player.seat = seat;
  player.status = "ACTIVE";
  player.stackCents = 5_000;
  player.roundBetCents = 100;
  player.committedCents = 100;
  player.needsAction = false;
  player.connected = true;
  player.disconnectDeadlineTs = 0;
  return player;
}

describe("Dealer action-result lifecycle reconciliation", () => {
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

  it("reconciles STREET_COMPLETE when drive returns without advancing lifecycle", async () => {
    const state = new PokerState();
    state.maxSeats = 2;
    state.seats.push("u1", "u2");
    state.street = "RIVER";
    state.roundState = "WAITING_FOR_ACTION";
    state.toActSeat = 0;
    state.roundCurrentBetCents = 100;

    const p1 = makePlayer("u1", 0);
    const p2 = makePlayer("u2", 1);
    state.playersById.set("u1", p1);
    state.playersById.set("u2", p2);

    const dealer = new Dealer(state, { enabled: false } as any);
    const sendSnapshotSpy = vi.spyOn(dealer as any, "sendTableSnapshotToAll").mockResolvedValue(undefined);
    const requestDriveSpy = vi.spyOn(dealer as any, "requestDrive").mockResolvedValue(undefined);
    const advanceSpy = vi.spyOn(dealer as any, "advanceStreetOrShowdown").mockResolvedValue(undefined);

    await (dealer as any).applyActionResult({ kind: "STREET_COMPLETE" });

    expect(sendSnapshotSpy).toHaveBeenCalled();
    expect(requestDriveSpy).toHaveBeenCalledWith("ADVANCE_STREET_OR_SHOWDOWN:APPLY_ACTION_RESULT_STREET_COMPLETE");
    expect(advanceSpy).toHaveBeenCalledWith("POST_ACTION_STREET_COMPLETE_RECONCILE");
  });
});
