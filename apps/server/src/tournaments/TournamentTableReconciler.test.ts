import { describe, expect, it } from "vitest";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { countTournamentSurvivorsWithChips } from "./TournamentTableReconciler.js";

function seatPlayer(
  state: PokerState,
  seat: number,
  id: string,
  kind: "HUMAN" | "BOT",
  stackCents: number,
): void {
  const player = new PlayerState();
  player.id = id;
  player.seat = seat;
  player.kind = kind;
  player.status = "ACTIVE";
  player.stackCents = stackCents;
  player.connected = true;
  state.playersById.set(id, player);
  state.seats[seat] = id;
}

describe("countTournamentSurvivorsWithChips", () => {
  it("counts humans and bots with chips", () => {
    const state = new PokerState();
    seatPlayer(state, 0, "human_1", "HUMAN", 5000);
    seatPlayer(state, 1, "tournament_bot_nash_nate", "BOT", 30050);
    seatPlayer(state, 2, "tournament_bot_foldy_fiona", "BOT", 0);

    expect(countTournamentSurvivorsWithChips(state).sort()).toEqual(["human_1", "tournament_bot_nash_nate"].sort());
  });

  it("excludes busted and out players", () => {
    const state = new PokerState();
    seatPlayer(state, 0, "human_1", "HUMAN", 1000);
    const out = new PlayerState();
    out.id = "bot_out";
    out.seat = 1;
    out.kind = "BOT";
    out.status = "OUT";
    out.stackCents = 5000;
    state.playersById.set(out.id, out);

    expect(countTournamentSurvivorsWithChips(state)).toEqual(["human_1"]);
  });
});
