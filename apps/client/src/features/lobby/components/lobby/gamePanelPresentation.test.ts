import { describe, expect, it } from "vitest";
import {
  formatSeatsTag,
  resolveStakesTier,
  resolveTableStatus,
} from "./gamePanelPresentation";

describe("resolveTableStatus", () => {
  it("returns Open for an empty or lightly seated table", () => {
    expect(resolveTableStatus(0, 6)).toEqual({ label: "Open", tone: "success" });
    expect(resolveTableStatus(1, 6)).toEqual({ label: "Open", tone: "success" });
  });

  it("returns Filling once occupancy crosses ~1/3", () => {
    expect(resolveTableStatus(3, 6)).toEqual({ label: "Filling", tone: "warn" });
    expect(resolveTableStatus(4, 6)).toEqual({ label: "Filling", tone: "warn" });
  });

  it("returns Almost Full once occupancy crosses 3/4", () => {
    expect(resolveTableStatus(5, 6)).toEqual({ label: "Almost Full", tone: "danger" });
    expect(resolveTableStatus(6, 6)).toEqual({ label: "Almost Full", tone: "danger" });
  });

  it("treats zero seats as Open rather than dividing by zero", () => {
    expect(resolveTableStatus(0, 0)).toEqual({ label: "Open", tone: "success" });
  });
});

describe("resolveStakesTier", () => {
  it("buckets low/mid/high by min buy-in", () => {
    expect(resolveStakesTier(2000)).toBe("low");
    expect(resolveStakesTier(4999)).toBe("low");
    expect(resolveStakesTier(5000)).toBe("mid");
    expect(resolveStakesTier(50000)).toBe("mid");
    expect(resolveStakesTier(50001)).toBe("high");
    expect(resolveStakesTier(200000)).toBe("high");
  });
});

describe("formatSeatsTag", () => {
  it("formats seat count as an X-Max tag", () => {
    expect(formatSeatsTag(6)).toBe("6-Max");
    expect(formatSeatsTag(9)).toBe("9-Max");
  });
});
