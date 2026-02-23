import { describe, expect, it } from "vitest";
import { getStepFromTrackPress } from "@/components/replay/replayScrubber";

describe("getStepFromTrackPress", () => {
  it("returns 0 when totalSteps <= 1", () => {
    expect(getStepFromTrackPress(50, 100, 0)).toBe(0);
    expect(getStepFromTrackPress(50, 100, 1)).toBe(0);
  });

  it("returns 0 when trackWidth <= 0", () => {
    expect(getStepFromTrackPress(50, 0, 10)).toBe(0);
  });

  it("maps left edge to step 0", () => {
    expect(getStepFromTrackPress(0, 100, 5)).toBe(0);
  });

  it("maps right edge to last step", () => {
    expect(getStepFromTrackPress(100, 100, 5)).toBe(4);
  });

  it("maps center to middle step", () => {
    expect(getStepFromTrackPress(50, 100, 5)).toBe(2);
  });

  it("clamps locationX outside [0, trackWidth]", () => {
    expect(getStepFromTrackPress(-10, 100, 5)).toBe(0);
    expect(getStepFromTrackPress(150, 100, 5)).toBe(4);
  });

  it("rounds to nearest step", () => {
    const trackWidth = 100;
    const totalSteps = 11; // 0..10
    expect(getStepFromTrackPress(0, trackWidth, totalSteps)).toBe(0);
    expect(getStepFromTrackPress(5, trackWidth, totalSteps)).toBe(1);
    expect(getStepFromTrackPress(10, trackWidth, totalSteps)).toBe(1);
    expect(getStepFromTrackPress(50, trackWidth, totalSteps)).toBe(5);
    expect(getStepFromTrackPress(100, trackWidth, totalSteps)).toBe(10);
  });
});
