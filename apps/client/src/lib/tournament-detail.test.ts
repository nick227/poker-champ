import { describe, expect, it } from "vitest";
import {
  buildBlindSummaryLines,
  buildPayoutSummaryLines,
  buildTournamentTimeline,
  getTournamentPayoutSlots,
} from "./tournament-detail";

describe("tournament-detail", () => {
  it("builds payout slots by entrant count", () => {
    expect(getTournamentPayoutSlots(2)).toEqual([{ place: 1, percent: 100 }]);
    expect(getTournamentPayoutSlots(6)).toHaveLength(3);
  });

  it("builds payout summary from prize pool", () => {
    const lines = buildPayoutSummaryLines(6000, 3);
    expect(lines[0]).toContain("1st");
    expect(lines[0]).toContain("$42");
    expect(lines[1]).toContain("2nd");
  });

  it("builds blind summary for standard preset", () => {
    const lines = buildBlindSummaryLines("standard_8min", 2);
    expect(lines[0]).toContain("Current");
    expect(lines.some((l) => l.includes("Level 1"))).toBe(true);
  });

  it("builds timeline for running tournament", () => {
    const steps = buildTournamentTimeline("RUNNING");
    expect(steps.find((s) => s.key === "RUNNING")?.state).toBe("current");
    expect(steps.find((s) => s.key === "REGISTERING")?.state).toBe("done");
  });

  it("builds cancelled timeline", () => {
    const steps = buildTournamentTimeline("CANCELLED");
    expect(steps.every((s) => s.state === "cancelled")).toBe(true);
  });
});
