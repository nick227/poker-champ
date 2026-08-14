import { describe, expect, it } from "vitest";
import { isNearWin, litReelsForOutcome, outcomeHeadline, outcomeLabel, paylineRange, settleReadout } from "./display";

describe("outcomeHeadline", () => {
  it("uses player-facing copy instead of reel codes", () => {
    expect(outcomeHeadline("NONE")).toBe("No match");
    expect(outcomeHeadline("PAIR", "B")).toBe("Pair of cherries");
    expect(outcomeHeadline("TRIPLE", "A")).toBe("Three crowns");
    expect(outcomeHeadline("TRIPLE", "7", true)).toBe("Jackpot");
    expect(outcomeHeadline("ANY_SEVEN", "7")).toBe("Lucky seven");
  });
});

describe("outcomeLabel", () => {
  it("does not echo A-B-C combos", () => {
    expect(outcomeLabel("TRIPLE", "A-A-A", "A")).toBe("Three crowns");
    expect(outcomeLabel("TRIPLE", "7-7-7", "7")).toBe("Jackpot");
    expect(outcomeLabel("PAIR", "B-B-C", "B")).toBe("Pair of cherries");
  });
});

describe("settleReadout", () => {
  it("keeps miss copy free of debug text", () => {
    const miss = settleReadout({
      kind: "NONE",
      isJackpot: false,
      winCents: 0,
      result: ["A", "B", "C"],
    });
    expect(miss.headline).toBe("No match");
    expect(miss.detail).toBe("");
    expect(miss.phase).toBe("miss");
  });

  it("states the payline win without odds", () => {
    const win = settleReadout({
      kind: "PAIR",
      matchedSymbol: "B",
      isJackpot: false,
      winCents: 300,
      result: ["B", "B", "A"],
    });
    expect(win.headline).toBe("Pair of cherries");
    expect(win.detail).toContain("Pays");
    expect(win.detail).not.toContain("Payline");
    expect(win.detail).not.toContain("1 in");
    expect(win.winCents).toBe(300);
  });
});

describe("litReelsForOutcome", () => {
  it("lights matching reels only", () => {
    expect(litReelsForOutcome(["B", "B", "A"], "PAIR", "B")).toEqual([true, true, false]);
    expect(litReelsForOutcome(["7", "A", "7"], "ANY_SEVEN", "7")).toEqual([true, false, true]);
    expect(litReelsForOutcome(["A", "A", "A"], "TRIPLE", "A")).toEqual([true, true, true]);
    expect(litReelsForOutcome(["A", "B", "C"], "NONE")).toEqual([false, false, false]);
  });
});

describe("paylineRange", () => {
  it("spans one connected band from first to last lit reel", () => {
    expect(paylineRange([true, true, false])).toEqual({ start: 0, count: 2 });
    expect(paylineRange([false, true, true])).toEqual({ start: 1, count: 2 });
    expect(paylineRange([true, true, true])).toEqual({ start: 0, count: 3 });
    expect(paylineRange([true, false, true])).toEqual({ start: 0, count: 3 });
    expect(paylineRange([false, false, false])).toBeNull();
  });
});

describe("isNearWin", () => {
  it("is two sevens that are not a jackpot", () => {
    expect(isNearWin(["7", "7", "A"], false)).toBe(true);
    expect(isNearWin(["7", "7", "7"], true)).toBe(false);
    expect(isNearWin(["7", "A", "B"], false)).toBe(false);
  });
});
