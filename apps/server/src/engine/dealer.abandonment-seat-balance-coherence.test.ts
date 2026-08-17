import { beforeEach, describe, expect, it, vi } from "vitest";
import { CashierService } from "./economy/CashierService.js";
import { TableSeatSessionService } from "./seats/TableSeatSessionService.js";
import { Dealer } from "./Dealer.js";
import { PlayerState } from "../state/PlayerState.js";
import { PokerState } from "../state/PokerState.js";

/**
 * Regression coverage for the collapsed abandonment lifecycle: whichever caller finalizes a
 * disconnect-timeout removal (DisconnectManager's periodic sweep, or PokerRoomLeaveService's own
 * reconnect-window-expiry handler), PlayerLifecycleService.finalizeRemoval is the single place
 * that pairs the cash-out with TableSeatSessionService.markLeft, so runtime state, the durable
 * seat, and PlayerBalance can never diverge (no "durable seat still SEATED while balance already
 * CASHED_OUT", and no "runtime seat gone while durable seat still claims SEATED").
 */
function disconnectedTableAtWaiting(): { state: PokerState; deadline: number } {
  const state = new PokerState();
  state.tableId = "table_abandon_coherence";
  state.street = "WAITING";
  const player = new PlayerState();
  player.id = "user_1";
  player.userId = "user_1";
  player.kind = "HUMAN";
  player.name = "User One";
  player.seat = 0;
  player.status = "ACTIVE";
  player.stackCents = 5000;
  player.connected = false;
  const deadline = Date.now() - 1;
  player.disconnectDeadlineTs = deadline;
  state.playersById.set(player.id, player);
  state.seats[0] = player.id;
  return { state, deadline };
}

describe("abandonment finalize keeps runtime seat, durable seat, and balance coherent", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
    vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue(true);
  });

  it("cashes out and marks the durable seat LEFT together when the reconnect window has already expired at WAITING", async () => {
    const { state, deadline } = disconnectedTableAtWaiting();
    const dealer = new Dealer(state);

    const won = await dealer.markAbandonedSerialized("user_1", deadline);

    expect(won).toBe(true);
    // Runtime: seat is actually vacated.
    expect(state.playersById.has("user_1")).toBe(false);
    expect(state.seats[0]).toBe("");
    // Balance: cashed out for the full remaining stack.
    expect(CashierService.processCashGameCashOut).toHaveBeenCalledTimes(1);
    expect(CashierService.processCashGameCashOut).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", tableId: "table_abandon_coherence", amountCents: 5000 }),
    );
    // Durable seat: only marked LEFT because the cash-out is known to have succeeded.
    expect(TableSeatSessionService.markLeft).toHaveBeenCalledTimes(1);
    expect(TableSeatSessionService.markLeft).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: "table_abandon_coherence", userId: "user_1", stackCentsSnapshot: 0 }),
    );
  });

  it("does not mark the durable seat LEFT when the cash-out fails, leaving a truthful trail instead of a false LEFT over stranded money", async () => {
    vi.spyOn(CashierService, "processCashGameCashOut").mockRejectedValueOnce(new Error("DB_UNAVAILABLE"));
    const { state, deadline } = disconnectedTableAtWaiting();
    const dealer = new Dealer(state);

    const won = await dealer.markAbandonedSerialized("user_1", deadline);

    expect(won).toBe(true);
    // Runtime still vacates the seat (matches pre-existing behavior: cash-out failure never
    // blocked runtime removal), but the durable row must not be told the player left.
    expect(state.playersById.has("user_1")).toBe(false);
    expect(TableSeatSessionService.markLeft).not.toHaveBeenCalled();
  });

  it("builds a deterministic cash-out externalRef from the disconnect episode, not Date.now()/random", async () => {
    // Simulate a process restart mid-abandonment: two independent Dealer/state instances (fresh
    // in-memory bookkeeping) finalizing the *same* durable disconnect episode (identified by the
    // same reconnect-deadline timestamp) must produce the same externalRef, so a retry after a
    // crash replays idempotently against BalanceTransaction.externalRef's unique constraint
    // instead of minting a new reference every attempt.
    const first = disconnectedTableAtWaiting();
    await new Dealer(first.state).markAbandonedSerialized("user_1", first.deadline);
    const firstRef = vi.mocked(CashierService.processCashGameCashOut).mock.calls[0]![0].externalRef;

    vi.mocked(CashierService.processCashGameCashOut).mockClear();

    const second = disconnectedTableAtWaiting();
    second.state.tableId = first.state.tableId;
    // Reuse the exact same deadline to model the same disconnect episode being retried.
    const player = second.state.playersById.get("user_1")!;
    player.disconnectDeadlineTs = first.deadline;
    await new Dealer(second.state).markAbandonedSerialized("user_1", first.deadline);
    const secondRef = vi.mocked(CashierService.processCashGameCashOut).mock.calls[0]![0].externalRef;

    expect(firstRef).toBe(secondRef);
    expect(firstRef).not.toMatch(/\d{13,}.*[a-zA-Z0-9]{6}$/); // not Date.now()+nanoid shaped
  });

  it("uses a distinct externalRef for a later, different disconnect episode of the same player at the same table", async () => {
    const first = disconnectedTableAtWaiting();
    await new Dealer(first.state).markAbandonedSerialized("user_1", first.deadline);
    const firstRef = vi.mocked(CashierService.processCashGameCashOut).mock.calls[0]![0].externalRef;

    vi.mocked(CashierService.processCashGameCashOut).mockClear();

    const later = disconnectedTableAtWaiting();
    later.state.tableId = first.state.tableId;
    const laterDeadline = first.deadline + 1; // a new disconnect episode, later in time
    const player = later.state.playersById.get("user_1")!;
    player.disconnectDeadlineTs = laterDeadline;
    await new Dealer(later.state).markAbandonedSerialized("user_1", laterDeadline);
    const laterRef = vi.mocked(CashierService.processCashGameCashOut).mock.calls[0]![0].externalRef;

    expect(laterRef).not.toBe(firstRef);
  });

  it("never attempts cash-game cash-out for a tournament table's player", async () => {
    // Tournament chips are not real money. Whatever caller/reason reaches finalizeRemoval for a
    // tournament table, CashierService.processCashGameCashOut must never be invoked -- it would
    // credit tournament chips straight into the player's cash bankroll.
    const { state, deadline } = disconnectedTableAtWaiting();
    state.tournamentMode = true;
    const dealer = new Dealer(state);

    const won = await dealer.markAbandonedSerialized("user_1", deadline);

    expect(won).toBe(true);
    expect(state.playersById.has("user_1")).toBe(false);
    expect(CashierService.processCashGameCashOut).not.toHaveBeenCalled();
  });
});
