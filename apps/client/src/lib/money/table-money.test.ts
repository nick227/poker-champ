import { describe, expect, it } from "vitest";
import { chips } from "./types";
import { bbToChips, chipsToBb, createTableMoneyFormatter, formatChipCount } from "./table-money";

describe("table-money", () => {
  const bb100 = chips(100);

  it("formats chips mode with full numbers", () => {
    const fmt = createTableMoneyFormatter({ mode: "chips", bigBlind: bb100 });
    expect(fmt.formatStack(chips(10_000))).toBe("10,000");
    expect(fmt.formatPot(chips(900))).toBe("900");
    expect(fmt.formatBet(chips(1_250))).toBe("1,250");
  });

  it("formats BB mode from current big blind", () => {
    const fmt = createTableMoneyFormatter({ mode: "bb", bigBlind: bb100 });
    expect(fmt.formatStack(chips(10_000))).toBe("100 BB");
    expect(fmt.formatPot(chips(900))).toBe("9 BB");
    expect(fmt.formatBet(chips(1_250))).toBe("12.5 BB");
  });

  it("keeps blind line as absolute chips in both modes", () => {
    const chipsFmt = createTableMoneyFormatter({ mode: "chips", bigBlind: bb100 });
    const bbFmt = createTableMoneyFormatter({ mode: "bb", bigBlind: bb100 });
    expect(chipsFmt.formatBlinds(chips(25), chips(50))).toBe("25 / 50");
    expect(bbFmt.formatBlinds(chips(25), chips(50))).toBe("25 / 50");
  });

  it("uses two decimals for tiny BB values when needed", () => {
    const fmt = createTableMoneyFormatter({ mode: "bb", bigBlind: bb100 });
    expect(fmt.formatBet(chips(25))).toBe("0.25 BB");
  });

  it("converts between chips and BB", () => {
    expect(chipsToBb(chips(250), bb100)).toBe(2.5);
    expect(bbToChips(2.5, bb100)).toBe(250);
  });

  it("formats zero chips safely", () => {
    expect(formatChipCount(chips(0))).toBe("0");
    const fmt = createTableMoneyFormatter({ mode: "bb", bigBlind: bb100 });
    expect(fmt.formatStack(chips(0))).toBe("0 BB");
  });
});
