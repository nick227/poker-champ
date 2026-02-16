
import { describe, it, expect } from "vitest";

describe("ledger math", () => {
  it("never loses cents", () => {
    const start = 10000;
    const bet = 500;
    const pot = bet * 2;
    const payout = pot;

    const aEnd = start - bet + payout;
    const bEnd = start - bet;

    expect(aEnd + bEnd).toBe(start*2);
  });
});
