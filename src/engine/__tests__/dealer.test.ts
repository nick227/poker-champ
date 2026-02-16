import { describe, it, expect } from "vitest";
import { PokerState } from "../../state/PokerState.js";
import { Dealer } from "../Dealer.js";

describe("Dealer v2 smoke", () => {
  it("starts a hand when 2 players join", async () => {
    const state = new PokerState();
    const dealer = new Dealer(state);

    await dealer.addPlayer("p1", "A", 5000);
    await dealer.addPlayer("p2", "B", 5000);

    expect(state.street).toBe("PREFLOP");
    expect(state.handId).toMatch(/^hand_/);
    expect(state.potCents).toBeGreaterThan(0); // blinds posted
  });
});
