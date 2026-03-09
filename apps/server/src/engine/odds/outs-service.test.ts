import { describe, expect, it } from "vitest";
import { calcHeadsUpTieOrBetterOuts } from "./OutsService.js";

describe("calcHeadsUpTieOrBetterOuts", () => {
  it("computes deterministic turn outs for a heads-up spot", () => {
    const outs = calcHeadsUpTieOrBetterOuts({
      street: "TURN",
      board: ["Ah", "Kh", "2c", "3d"],
      heroCards: ["Qh", "Jh"],
      villainCards: ["As", "Ad"],
    });

    expect(outs).toBe(10);
  });

  it("returns zero for invalid shape inputs", () => {
    const outs = calcHeadsUpTieOrBetterOuts({
      street: "FLOP",
      board: ["Ah", "Kh"],
      heroCards: ["Qh", "Jh"],
      villainCards: ["As", "Ad"],
    });

    expect(outs).toBe(0);
  });
});
