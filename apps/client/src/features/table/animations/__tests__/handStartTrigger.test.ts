import { describe, expect, it } from "vitest";
import { TABLE_ANIMATION_REQUEST_VERSION } from "../animationTypes";
import { resolveHandStartAnimationDecision } from "../handStartTrigger";

describe("resolveHandStartAnimationDecision", () => {
  it("returns null while observer is unseeded (undefined lastObserved)", () => {
    expect(resolveHandStartAnimationDecision("hand-1", undefined)).toBeNull();
    expect(resolveHandStartAnimationDecision(null, undefined)).toBeNull();
  });

  it("returns null on null/empty handId (idle / between hands)", () => {
    expect(resolveHandStartAnimationDecision(null, null)).toBeNull();
    expect(resolveHandStartAnimationDecision(null, "hand-1")).toBeNull();
    expect(resolveHandStartAnimationDecision("", "hand-1")).toBeNull();
  });

  it("returns null when handId is unchanged", () => {
    expect(resolveHandStartAnimationDecision("hand-1", "hand-1")).toBeNull();
  });

  it("fires once when handId becomes a new non-null value after seed", () => {
    const fromNull = resolveHandStartAnimationDecision("hand-1", null);
    expect(fromNull).toEqual({
      handId: "hand-1",
      request: {
        version: TABLE_ANIMATION_REQUEST_VERSION,
        event: "HAND_START",
        tier: 0,
      },
    });

    const handChange = resolveHandStartAnimationDecision("hand-2", "hand-1");
    expect(handChange?.handId).toBe("hand-2");
    expect(handChange?.request.event).toBe("HAND_START");
    expect(handChange?.request.tier).toBe(0);
  });
});
