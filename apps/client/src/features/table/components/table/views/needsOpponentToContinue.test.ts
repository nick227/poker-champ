import { describe, expect, it } from "vitest";
import { needsOpponentToContinue } from "./needsOpponentToContinue";

describe("needsOpponentToContinue", () => {
  it("is true when there are no opponents", () => {
    expect(needsOpponentToContinue([])).toBe(true);
  });

  it("is true when every opponent is busted", () => {
    expect(
      needsOpponentToContinue([
        { stackCents: 0 },
        { stackCents: 0 },
      ]),
    ).toBe(true);
  });

  it("is false when at least one opponent still has chips", () => {
    expect(
      needsOpponentToContinue([
        { stackCents: 0 },
        { stackCents: 500 },
      ]),
    ).toBe(false);
  });
});
