import { describe, expect, it } from "vitest";
import {
  canRegisterForTournament,
  canUnregisterFromTournament,
  defaultLateRegMinutesForStructure,
  defaultRebuyPeriodMinutesForStructure,
  isLateRegistrationClosed,
  isLateRegistrationOpen,
  isTournamentStartInPast,
  lateRegCloseMs,
  floorToMinute,
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
    expect(defaultLateRegMinutesForStructure("fast_4min")).toBe(8);
    expect(defaultLateRegMinutesForStructure("long_12min")).toBe(24);
  });

  it("defaults rebuy window to first four level durations", () => {
    expect(defaultRebuyPeriodMinutesForStructure("standard_8min")).toBe(32);
    expect(defaultRebuyPeriodMinutesForStructure("fast_4min")).toBe(16);
    expect(defaultRebuyPeriodMinutesForStructure("long_12min")).toBe(48);
  });

  it("rejects start times before the current minute", () => {
    const now = new Date("2026-06-01T18:30:45.000Z");
    expect(isTournamentStartInPast(new Date("2026-06-01T18:29:00.000Z"), now)).toBe(true);
    expect(isTournamentStartInPast(new Date("2026-06-01T18:30:00.000Z"), now)).toBe(false);
    expect(isTournamentStartInPast(new Date("2026-06-01T18:31:00.000Z"), now)).toBe(false);
    expect(floorToMinute(now).getSeconds()).toBe(0);
  });

  it("keeps late registration open for RUNNING tournaments until the close timestamp", () => {
    const tournament = row("RUNNING", start);
    expect(isLateRegistrationOpen(tournament, new Date("2026-06-01T18:10:00.000Z"))).toBe(true);
    expect(canRegisterForTournament(tournament, new Date("2026-06-01T18:10:00.000Z"))).toBe(true);
    expect(isLateRegistrationClosed(tournament, new Date("2026-06-01T18:16:00.000Z"))).toBe(true);
    expect(lateRegCloseMs(tournament)).toBe(start.getTime() + 16 * 60 * 1000);
  });

  it("allows new paid entries during LATE_REG but unregister only before scheduled lock", () => {
    const lateReg = row("LATE_REG", start);
    expect(canRegisterForTournament(lateReg, new Date("2026-06-01T18:10:00.000Z"))).toBe(true);
    expect(canUnregisterFromTournament(lateReg, new Date("2026-06-01T18:10:00.000Z"))).toBe(false);
    expect(canUnregisterFromTournament(row("REGISTERING", start), new Date(start.getTime() - 1))).toBe(true);
    expect(canUnregisterFromTournament(row("REGISTERING", start), start)).toBe(false);
  });

  it("treats REGISTERING as open before start and through late-reg window after start", () => {
    expect(isLateRegistrationOpen(row("REGISTERING", start), new Date(start.getTime() - 1))).toBe(true);
    expect(isLateRegistrationOpen(row("REGISTERING", start), start)).toBe(true);
    expect(
      isLateRegistrationOpen(row("REGISTERING", start), new Date("2026-06-01T18:10:00.000Z")),
    ).toBe(true);
    expect(isLateRegistrationOpen(row("REGISTERING", start), new Date("2026-06-01T18:16:00.000Z"))).toBe(
      false,
    );
    expect(isLateRegistrationClosed(row("REGISTERING", start), start)).toBe(false);
  });

  it("allows normal pre-start registration even when late registration is disabled", () => {
    const tournament = row("REGISTERING", start, 0);
    expect(canRegisterForTournament(tournament, new Date(start.getTime() - 1))).toBe(true);
    expect(canRegisterForTournament(tournament, start)).toBe(false);
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
