import { describe, expect, it } from "vitest";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { isHumanFieldEliminated } from "./tournament-human-field.js";

function seatHuman(state: PokerState, id: string, stackCents: number): void {
  const player = new PlayerState();
  player.id = id;
  player.seat = 0;
  player.kind = "HUMAN";
  player.status = "ACTIVE";
  player.stackCents = stackCents;
  state.playersById.set(id, player);
}

describe("isHumanFieldEliminated", () => {
  it("is false while a human still has chips", () => {
    const state = new PokerState();
    seatHuman(state, "human_1", 1000);
    expect(
      isHumanFieldEliminated(
        [
          { isBot: false, finishPlace: 2 },
          { isBot: false, finishPlace: null },
        ],
        state,
      ),
    ).toBe(false);
  });

  it("is true when every human has a finish place and no chips", () => {
    const state = new PokerState();
    expect(
      isHumanFieldEliminated(
        [
          { isBot: false, finishPlace: 2 },
          { isBot: false, finishPlace: 1 },
        ],
        state,
      ),
    ).toBe(true);
  });

  it("is false for bot-only fields", () => {
    const state = new PokerState();
    expect(isHumanFieldEliminated([{ isBot: true, finishPlace: null }], state)).toBe(false);
  });
});
