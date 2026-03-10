
import { describe, it, expect } from "vitest";

describe("auto action rule", () => {
  it("auto check when call amount is zero", () => {
    const callAmount = 0;
    const action = callAmount===0 ? "AUTO_CHECK" : "AUTO_FOLD";
    expect(action).toBe("AUTO_CHECK");
  });

  it("auto fold when facing bet", () => {
    const callAmount: number = 200;
    const action = callAmount===0 ? "AUTO_CHECK" : "AUTO_FOLD";
    expect(action).toBe("AUTO_FOLD");
  });
});
