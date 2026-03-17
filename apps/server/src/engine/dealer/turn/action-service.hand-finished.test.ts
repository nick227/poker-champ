import { describe, expect, it } from "vitest";

import { ActionService } from "./ActionService.js";
import { PlayerState } from "../../../state/PlayerState.js";
import { PokerState } from "../../../state/PokerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  roundBetCents?: number;
  committedCents?: number;
  connected?: boolean;
}): PlayerState {
  const player = new PlayerState();
  player.id = input.id;
  player.userId = input.id;
  player.kind = "HUMAN";
  player.name = input.id;
  player.seat = input.seat;
  player.status = "ACTIVE";
  player.stackCents = input.stackCents;
  player.roundBetCents = input.roundBetCents ?? 0;
  player.committedCents = input.committedCents ?? 0;
  player.needsAction = true;
  player.connected = input.connected ?? true;
  return player;
}

describe("ActionService hand-finished turn ownership", () => {
  it("clears toActSeat and needsAction when a fold ends the hand", async () => {
    const state = new PokerState();
    state.tableId = "table_action_service_hand_finished";
    state.handId = "hand_action_service_hand_finished";
    state.street = "PREFLOP";
    state.toActSeat = 1;
    state.turnDeadlineMs = 12345;
    state.potCents = 150;
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.seats.push("u1", "u2");

    const winner = makePlayer({ id: "u1", seat: 0, stackCents: 1000, roundBetCents: 100, committedCents: 100 });
    const folder = makePlayer({ id: "u2", seat: 1, stackCents: 1000, roundBetCents: 50, committedCents: 50 });
    state.playersById.set(winner.id, winner);
    state.playersById.set(folder.id, folder);

    const service = new ActionService({
      state,
      getHeroActionOptions: () => undefined,
      getLastAction: () => undefined,
    });

    const execution = await service.execute({
      state,
      userId: "u2",
      msg: { action: "FOLD" },
      origin: "AUTO",
      recordAcceptedAction: async () => {},
      assertCanAfford: () => {},
      applyActionDebit: async () => {},
    });

    expect(execution.result).toEqual({ kind: "HAND_FINISHED" });
    expect(state.toActSeat).toBe(winner.seat);
    expect(state.turnDeadlineMs).toBe(0);
    expect(winner.needsAction).toBe(false);
    expect(folder.needsAction).toBe(false);
  });
});
