import { describe, expect, it } from "vitest";
import {
  defaultLateRegMinutesForStructure,
  isLateRegistrationClosed,
  isLateRegistrationOpen,
  lateRegCloseMs,
} from "./tournament-schedule.js";

function row(
  status: string,
  start: Date,
  lateRegMinutes = 16,
): { startTime: Date; lateRegMinutes: number; status: string } {
  return { startTime: start, lateRegMinutes, status };
}

describe("tournament-schedule", () => {
  const start = new Date("2026-06-01T18:00:00.000Z");

  it("defaults late reg to first two level durations", () => {
    expect(defaultLateRegMinutesForStructure("standard_8min")).toBe(16);
  });

  it("opens late reg through RUNNING until close time", () => {
    const tournament = row("RUNNING", start);
    expect(isLateRegistrationOpen(tournament, new Date("2026-06-01T18:10:00.000Z"))).toBe(true);
    expect(isLateRegistrationClosed(tournament, new Date("2026-06-01T18:16:00.000Z"))).toBe(true);
    expect(lateRegCloseMs(tournament)).toBe(start.getTime() + 16 * 60 * 1000);
  });

  it("treats REGISTERING as open whenever late reg is enabled", () => {
    expect(isLateRegistrationOpen(row("REGISTERING", start), start)).toBe(true);
    expect(isLateRegistrationClosed(row("REGISTERING", start), start)).toBe(false);
  });

  it("opens during LATE_REG until exact close timestamp", () => {
    const tournament = row("LATE_REG", start);
    const close = new Date(lateRegCloseMs(tournament));
    expect(isLateRegistrationOpen(tournament, new Date(close.getTime() - 1))).toBe(true);
    expect(isLateRegistrationOpen(tournament, close)).toBe(false);
    expect(isLateRegistrationClosed(tournament, close)).toBe(true);
  });

  it("is closed when lateRegMinutes is zero", () => {
    const tournament = row("LATE_REG", start, 0);
    expect(isLateRegistrationOpen(tournament, start)).toBe(false);
    expect(isLateRegistrationClosed(tournament, start)).toBe(false);
  });

  it("is closed for terminal statuses regardless of time", () => {
    const afterClose = new Date("2026-06-01T19:00:00.000Z");
    expect(isLateRegistrationOpen(row("FINISHED", start), afterClose)).toBe(false);
    expect(isLateRegistrationOpen(row("CANCELLED", start), afterClose)).toBe(false);
  });
});
