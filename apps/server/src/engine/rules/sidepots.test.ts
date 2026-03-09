import { describe, it, expect } from "vitest";
import { buildSidePots } from "./SidePotManager.js";
import { PlayerState } from "../../state/PlayerState.js";

function p(id: string, committed: number, status: any = "ACTIVE") {
  const ps = new PlayerState();
  ps.id = id;
  ps.committedCents = committed;
  ps.status = status;
  return ps;
}

describe("buildSidePots", () => {
  it("builds correct main + side pots for unequal all-ins", () => {
    // A all-in 100, B all-in 300, C all-in 500; all eligible
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 300, "ALL_IN");
    const C = p("C", 500, "ALL_IN");

    const pots = buildSidePots([A, B, C], [A, B, C]);

    // main: 100*3=300
    // side1: (300-100)*2=400
    // side2: (500-300)*1=200
    expect(pots.map(x => x.amountCents)).toEqual([300, 400, 200]);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A","B","C"]);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(["B","C"]);
    expect(pots[2].eligiblePlayerIds.sort()).toEqual(["C"]);
  });

  it("includes folded players as contributors but not eligible winners", () => {
    const A = p("A", 200, "ACTIVE");
    const B = p("B", 200, "FOLDED");
    const C = p("C", 200, "ACTIVE");

    const pots = buildSidePots([A, B, C], [A, C]);

    expect(pots.length).toBe(1);
    expect(pots[0].amountCents).toBe(600);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A","C"]);
  });
});
