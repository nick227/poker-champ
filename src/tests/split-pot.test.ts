import { describe, it, expect } from "vitest";
import { splitPotCents } from "../engine/rules/SidePotManager.js";

describe("splitPotCents", () => {
  it("splits evenly and distributes remainder left of dealer order", () => {
    // pot 5 split between A,B => 2 each, remainder 1 goes to first winner in seatOrder
    const payouts = splitPotCents(5, ["A","B"], ["B","A"]);
    expect(payouts.get("B")).toBe(3);
    expect(payouts.get("A")).toBe(2);
  });
});
