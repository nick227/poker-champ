import { describe, expect, it } from "vitest";
import {
  defaultLateRegMinutesForStructure,
  isLateRegistrationOpen,
  lateRegCloseMs,
} from "./tournament-schedule";

const startIso = "2026-06-01T18:00:00.000Z";
const startMs = new Date(startIso).getTime();

function tournament(overrides: {
  status: string;
  lateRegMinutes?: number;
  startTime?: string;
}) {
  return {
    startTime: overrides.startTime ?? startIso,
    lateRegMinutes: overrides.lateRegMinutes ?? 16,
    status: overrides.status,
  };
}

describe("tournament-schedule (client)", () => {
  it("defaults late reg to 16 minutes for standard structure", () => {
    expect(defaultLateRegMinutesForStructure("standard_8min")).toBe(16);
  });

  it("computes close time as start plus late reg minutes", () => {
    expect(lateRegCloseMs(tournament({ status: "LATE_REG" }))).toBe(startMs + 16 * 60 * 1000);
  });

  it("prefers lateRegClosesAt when the server provides it", () => {
    expect(
      lateRegCloseMs({
        startTime: startIso,
        lateRegMinutes: 16,
        lateRegClosesAt: "2026-06-01T18:05:00.000Z",
      }),
    ).toBe(Date.parse("2026-06-01T18:05:00.000Z"));
  });

  it("is closed when lateRegMinutes is zero", () => {
    expect(
      isLateRegistrationOpen(tournament({ status: "LATE_REG", lateRegMinutes: 0 }), startMs + 1000),
    ).toBe(false);
  });

  it("is open during REGISTERING before start and through late-reg window after start", () => {
    expect(isLateRegistrationOpen(tournament({ status: "REGISTERING" }), startMs - 60_000)).toBe(
      true,
    );
    expect(isLateRegistrationOpen(tournament({ status: "REGISTERING" }), startMs)).toBe(true);
    expect(isLateRegistrationOpen(tournament({ status: "REGISTERING" }), startMs + 10 * 60_000)).toBe(
      true,
    );
    const closeMs = lateRegCloseMs(tournament({ status: "REGISTERING" }));
    expect(isLateRegistrationOpen(tournament({ status: "REGISTERING" }), closeMs)).toBe(false);
  });

  it("is open during LATE_REG before close", () => {
    const closeMs = lateRegCloseMs(tournament({ status: "LATE_REG" }));
    expect(isLateRegistrationOpen(tournament({ status: "LATE_REG" }), closeMs - 1)).toBe(true);
    expect(isLateRegistrationOpen(tournament({ status: "LATE_REG" }), closeMs)).toBe(false);
  });

  it("is open during RUNNING until late-reg close", () => {
    const closeMs = lateRegCloseMs(tournament({ status: "RUNNING" }));
    expect(isLateRegistrationOpen(tournament({ status: "RUNNING" }), startMs + 10 * 60_000)).toBe(
      true,
    );
    expect(isLateRegistrationOpen(tournament({ status: "RUNNING" }), closeMs - 1)).toBe(true);
    expect(isLateRegistrationOpen(tournament({ status: "RUNNING" }), closeMs)).toBe(false);
  });

  it("is closed after window for FINISHED and STARTING", () => {
    const afterClose = startMs + 20 * 60_000;
    expect(isLateRegistrationOpen(tournament({ status: "FINISHED" }), afterClose)).toBe(false);
    expect(isLateRegistrationOpen(tournament({ status: "STARTING" }), afterClose)).toBe(false);
  });
});
