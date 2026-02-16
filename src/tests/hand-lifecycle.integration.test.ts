import { describe, it, expect } from "vitest";
import { PokerState } from "../state/PokerState.js";
import { Dealer } from "../engine/Dealer.js";

describe("hand lifecycle", () => {
  it("auto-starts next hand after a hand ends when >=2 players remain", async () => {
    const s = new PokerState();
    s.maxSeats = 6;
    s.minBuyInCents = 1000;
    s.maxBuyInCents = 10000;

    const d = new Dealer(s);
    await d.addPlayer("p1", "A", 5000);
    await d.addPlayer("p2", "B", 5000);

    const firstHand = s.handId;
    expect(firstHand).toMatch(/^hand_/);

    // End the current hand by folding the current player to act.
    const toActId = s.seats[s.toActSeat];
    expect(toActId).toBeTruthy();
    await d.handleAction(toActId!, { action: "FOLD" });

    const started = Date.now();
    while (s.handId === firstHand && Date.now() - started < 12000) {
      await new Promise(r => setTimeout(r, 25));
    }

    expect(s.handId).not.toBe(firstHand);
    expect(s.street).not.toBe("WAITING");
  }, 15000);
});
