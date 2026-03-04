
import { describe, it, expect } from "vitest";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { beginRound } from "../engine/rules/BettingRound.js";

describe("betting round init", () => {
  it("marks all active players as needing action", () => {
    const s = new PokerState();
    s.seats.push("A", "B");
    const a = new PlayerState(); a.id="A"; a.status="ACTIVE";
    const b = new PlayerState(); b.id="B"; b.status="ACTIVE";
    a.seat = 0;
    b.seat = 1;
    s.playersById.set("A", a);
    s.playersById.set("B", b);

    beginRound(s);
    expect(a.needsAction).toBe(true);
    expect(b.needsAction).toBe(true);
  });
});
