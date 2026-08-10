import { describe, expect, it } from "vitest";
import { PokerState } from "../../../state/PokerState.js";
import { PlayerState } from "../../../state/PlayerState.js";
import { preparePlayersForNextHand, resolvePlayersReadyForNextHand, settlePlayerStatusesAfterHand } from "./TableNavigator.js";

function seat(state: PokerState, seatIndex: number, id: string, status: PlayerState["status"]): void {
  const player = new PlayerState();
  player.id = id;
  player.userId = id;
  player.kind = "HUMAN";
  player.seat = seatIndex;
  player.status = status;
  player.connected = false;
  player.stackCents = 1500;
  state.playersById.set(id, player);
  state.seats[seatIndex] = id;
}

describe("TableNavigator tournament ghost stacks", () => {
  it("keeps abandoned tournament stacks eligible to post blinds", () => {
    const state = new PokerState();
    state.tournamentMode = true;
    seat(state, 0, "ghost_1", "ABANDONED");
    seat(state, 1, "active_1", "ACTIVE");

    expect(resolvePlayersReadyForNextHand(state).map((player) => player.id)).toEqual([
      "ghost_1",
      "active_1",
    ]);
  });

  it("preparePlayersForNextHand promotes tournament ABANDONED and prior-hand FOLDED", () => {
    const state = new PokerState();
    state.tournamentMode = true;
    seat(state, 0, "ghost_1", "ABANDONED");
    seat(state, 1, "ghost_2", "FOLDED");

    preparePlayersForNextHand(state);

    expect(state.playersById.get("ghost_1")?.status).toBe("ACTIVE");
    expect(state.playersById.get("ghost_2")?.status).toBe("ACTIVE");
  });

  it("settlePlayerStatusesAfterHand clears ALL_IN to ACTIVE/OUT from stacks", () => {
    const state = new PokerState();
    seat(state, 0, "winner", "ALL_IN");
    seat(state, 1, "busted", "ALL_IN");
    state.playersById.get("winner")!.stackCents = 4000;
    state.playersById.get("busted")!.stackCents = 0;

    settlePlayerStatusesAfterHand(state);

    expect(state.playersById.get("winner")?.status).toBe("ACTIVE");
    expect(state.playersById.get("busted")?.status).toBe("OUT");
  });

  it("keeps abandoned cash-game seats out of the next hand", () => {
    const state = new PokerState();
    seat(state, 0, "ghost_1", "ABANDONED");
    seat(state, 1, "active_1", "ACTIVE");

    expect(resolvePlayersReadyForNextHand(state).map((player) => player.id)).toEqual([
      "active_1",
    ]);
  });
});
