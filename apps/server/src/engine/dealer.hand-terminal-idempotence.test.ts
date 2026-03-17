import { describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(
  id: string,
  seat: number,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  const player = new PlayerState();
  player.id = id;
  player.userId = id;
  player.name = id;
  player.seat = seat;
  player.kind = "HUMAN";
  player.status = "ACTIVE";
  player.connected = true;
  player.stackCents = 5000;
  player.roundBetCents = 0;
  player.committedCents = 0;
  player.needsAction = false;
  Object.assign(player, overrides);
  return player;
}

describe("dealer terminal lifecycle idempotence", () => {
  it("does not re-run last-standing settlement when the hand is already complete", async () => {
    const state = new PokerState();
    state.tableId = "table_terminal_idempotence";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_terminal_idempotence";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "HAND_COMPLETE";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.toActSeat = 1;
    state.seats.push("u1", "u2");

    state.playersById.set(
      "u1",
      makePlayer("u1", 0, {
        status: "ACTIVE",
        stackCents: 6000,
        roundBetCents: 100,
        committedCents: 100,
      }),
    );
    state.playersById.set(
      "u2",
      makePlayer("u2", 1, {
        status: "FOLDED",
        stackCents: 5950,
        roundBetCents: 50,
        committedCents: 50,
      }),
    );

    const dealer = new Dealer(state);

    try {
      const plans = await (dealer as any).handLifecycleService.finishHandByLastStanding();
      expect(plans).toEqual([]);
      expect(state.potCents).toBe(150);
      expect(state.playersById.get("u1")?.stackCents).toBe(6000);
    } finally {
      dealer.dispose();
    }
  });

  it("suppresses duplicate dealer terminal entry for the same handId", async () => {
    const state = new PokerState();
    state.tableId = "table_terminal_dealer_guard";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_terminal_dealer_guard";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.toActSeat = 0;
    state.seats.push("u1", "u2");

    state.playersById.set(
      "u1",
      makePlayer("u1", 0, {
        status: "ACTIVE",
        stackCents: 6000,
        roundBetCents: 100,
        committedCents: 100,
        needsAction: false,
      }),
    );
    state.playersById.set(
      "u2",
      makePlayer("u2", 1, {
        status: "FOLDED",
        stackCents: 5950,
        roundBetCents: 50,
        committedCents: 50,
        needsAction: false,
      }),
    );

    const dealer = new Dealer(state);
    const orchestrator = (dealer as any).handOrchestrator;
    const finishSpy = vi
      .spyOn(orchestrator, "finishHandByLastStanding")
      .mockResolvedValue(undefined);

    try {
      await (dealer as any).finishHandByLastStanding("TEST_FIRST_CALL");
      await (dealer as any).finishHandByLastStanding("TEST_DUPLICATE_CALL");

      expect(finishSpy).toHaveBeenCalledTimes(1);
      expect((dealer as any).completedTerminalLifecycle).toMatchObject({
        handId: "hand_terminal_dealer_guard",
        path: "LAST_STANDING",
      });
    } finally {
      dealer.dispose();
    }
  });
});
