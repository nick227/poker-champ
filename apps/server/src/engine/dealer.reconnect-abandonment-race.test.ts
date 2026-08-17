import { beforeEach, describe, expect, it, vi } from "vitest";
import { CashierService } from "./economy/CashierService.js";
import { Dealer } from "./Dealer.js";
import { PlayerState } from "../state/PlayerState.js";
import { PokerState } from "../state/PokerState.js";

function disconnectedDealer(): { dealer: Dealer; state: PokerState; deadline: number } {
  const state = new PokerState();
  const player = new PlayerState();
  player.id = "race-user";
  player.userId = "race-user";
  player.kind = "HUMAN";
  player.name = "Race";
  player.seat = 0;
  player.stackCents = 5000;
  player.status = "ACTIVE";
  player.connected = false;
  const deadline = Date.now() - 1;
  player.disconnectDeadlineTs = deadline;
  state.playersById.set(player.id, player);
  state.seats[0] = player.id;
  return { dealer: new Dealer(state), state, deadline };
}

describe("reconnect versus abandonment arbitration", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  it("allows reconnect to win and makes the stale abandonment a no-op", async () => {
    const { dealer, state, deadline } = disconnectedDealer();
    const reconnect = dealer.markReconnectedSerialized("race-user");
    const abandon = dealer.markAbandonedSerialized("race-user", deadline);

    const [reconnectWon, abandonmentWon] = await Promise.all([reconnect, abandon]);

    expect([reconnectWon, abandonmentWon]).toEqual([true, false]);
    expect(state.playersById.get("race-user")?.connected).toBe(true);
    expect(state.playersById.get("race-user")?.pendingLeave).toBe(false);
  });

  it("allows abandonment to win and makes the queued reconnect fail", async () => {
    const { dealer, state, deadline } = disconnectedDealer();
    const abandon = dealer.markAbandonedSerialized("race-user", deadline);
    const reconnect = dealer.markReconnectedSerialized("race-user");

    const [abandonmentWon, reconnectWon] = await Promise.all([abandon, reconnect]);

    expect([abandonmentWon, reconnectWon]).toEqual([true, false]);
    const player = state.playersById.get("race-user");
    expect(player == null || player.pendingLeave || player.status === "ABANDONED").toBe(true);
    expect(player?.connected ?? false).toBe(false);
  });
});
