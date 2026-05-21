import { describe, expect, it } from "vitest";
import {
  defaultLateRegMinutesForStructure,
  isLateRegistrationClosed,
  isLateRegistrationOpen,
  lateRegCloseMs,
} from "./tournament-schedule.js";

describe("tournament-schedule", () => {
  it("defaults late reg to first two level durations", () => {
    expect(defaultLateRegMinutesForStructure("standard_8min")).toBe(16);
  });

  it("opens late reg through RUNNING until close time", () => {
    const start = new Date("2026-06-01T18:00:00.000Z");
    const tournament = {
      startTime: start,
      lateRegMinutes: 16,
      status: "RUNNING",
    };
    expect(isLateRegistrationOpen(tournament, new Date("2026-06-01T18:10:00.000Z"))).toBe(true);
    expect(isLateRegistrationClosed(tournament, new Date("2026-06-01T18:16:00.000Z"))).toBe(true);
    expect(lateRegCloseMs(tournament)).toBe(start.getTime() + 16 * 60 * 1000);
  });
});
