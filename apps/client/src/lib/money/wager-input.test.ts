import { describe, expect, it } from "vitest";
import { createWagerInputHelpers, USD_WAGER_INPUT_HELPERS } from "./wager-input";

describe("wager-input", () => {
  it("formats USD wager input from cents", () => {
    expect(USD_WAGER_INPUT_HELPERS.formatFromChips(1250)).toBe("12.50");
    expect(USD_WAGER_INPUT_HELPERS.parseToChips("12.50")).toBe(1250);
  });

  it("formats tournament chips as integers", () => {
    const helpers = createWagerInputHelpers("chips", 100);
    expect(helpers.formatFromChips(250)).toBe("250");
    expect(helpers.parseToChips("1250")).toBe(1250);
  });

  it("formats tournament BB input and converts back to chips", () => {
    const helpers = createWagerInputHelpers("bb", 100);
    expect(helpers.formatFromChips(250)).toBe("2.5");
    expect(helpers.parseToChips("2.5")).toBe(250);
    expect(helpers.parseToChips("12.5")).toBe(1250);
  });
});
