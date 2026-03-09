import { describe, it, expect } from "vitest";
import { PokerState } from "./PokerState.js";
import { Dealer } from "../engine/Dealer.js";

describe("seat capacity", () => {
  it("initializes seat map from maxSeats", () => {
    const s = new PokerState();
    s.maxSeats = 6;
    new Dealer(s);
    expect(s.seats.length).toBe(6);
  });
});
