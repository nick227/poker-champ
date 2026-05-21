import { describe, expect, it } from "vitest";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import {
  countHumanSurvivorsWithChips,
  resolveTournamentWinnerUserId,
} from "./tournament-finish-resolution.js";

function seat(
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
  state.playersById.set(id, player);
  state.seats[seat] = id;
}

describe("tournament-finish-resolution", () => {
  it("finishes when one human has chips and bots still have chips", () => {
    const state = new PokerState();
    seat(state, 0, "human_1", "HUMAN", 9000);
    seat(state, 1, "bot_1", "BOT", 2000);

    expect(countHumanSurvivorsWithChips(state)).toEqual(["human_1"]);
    expect(
      resolveTournamentWinnerUserId(state, [
        { userId: "human_1", isBot: false, finishPlace: null },
        { userId: "bot_1", isBot: true, finishPlace: null },
      ]),
    ).toBe("human_1");
  });

  it("does not finish while two humans have chips", () => {
    const state = new PokerState();
    seat(state, 0, "human_1", "HUMAN", 5000);
    seat(state, 1, "human_2", "HUMAN", 5000);

    expect(resolveTournamentWinnerUserId(state, [])).toBeNull();
  });

  it("picks best human finisher when all humans busted", () => {
    const state = new PokerState();
    seat(state, 0, "bot_1", "BOT", 10_000);

    expect(
      resolveTournamentWinnerUserId(state, [
        { userId: "human_1", isBot: false, finishPlace: 2 },
        { userId: "human_2", isBot: false, finishPlace: 1 },
      ]),
    ).toBe("human_2");
  });
});
