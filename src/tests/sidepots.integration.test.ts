
import { describe, it, expect } from "vitest";
import { buildSidePots } from "../engine/rules/SidePotManager.js";
import { PlayerState } from "../state/PlayerState.js";

describe("side pot integration", () => {
  it("builds main + side pot correctly", () => {
    const a = new PlayerState(); a.id="A"; a.committedCents=100;
    const b = new PlayerState(); b.id="B"; b.committedCents=300;
    const c = new PlayerState(); c.id="C"; c.committedCents=300;

    const pots = buildSidePots([a,b,c],[a,b,c]);
    expect(pots.length).toBe(2);
    expect(pots[0].amountCents).toBe(300); // 100*3
    expect(pots[1].amountCents).toBe(400); // (300-100)*2
  });
});
