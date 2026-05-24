import { describe, expect, it } from "vitest";
import {
  countRebuyPendingRegistrations,
  rebuyWindowClosesAtMs,
} from "./tournament-rebuy.js";
import { canRebuyTournament } from "./tournament-schedule.js";

describe("tournament-rebuy helpers", () => {
  it("counts rebuy-pending registrations without finish place", () => {
    expect(
      countRebuyPendingRegistrations([
        { rebuyPendingAt: new Date(), finishPlace: null },
        { rebuyPendingAt: null, finishPlace: 2 },
        { rebuyPendingAt: new Date(), finishPlace: null },
      ]),
    ).toBe(2);
  });

  it("computes rebuy window close timestamp", () => {
    const startTime = new Date("2026-05-23T18:00:00.000Z");
    expect(
      rebuyWindowClosesAtMs({ startTime, rebuyPeriodMinutes: 32 }),
    ).toBe(startTime.getTime() + 32 * 60 * 1000);
  });

  it("allows rebuy inside window with remaining allowance", () => {
    const startTime = new Date(Date.now() - 5 * 60 * 1000);
    expect(
      canRebuyTournament(
        {
          playFormat: "REBUY",
          startTime,
          rebuyPeriodMinutes: 32,
          maxRebuysPerPlayer: 2,
        },
        { rebuyCount: 1 },
      ),
    ).toBe(true);
  });

  it("blocks rebuy when max reached or window closed", () => {
    const startTime = new Date(Date.now() - 5 * 60 * 1000);
    const tournament = {
      playFormat: "REBUY",
      startTime,
      rebuyPeriodMinutes: 32,
      maxRebuysPerPlayer: 2,
    };
    expect(canRebuyTournament(tournament, { rebuyCount: 2 })).toBe(false);
    expect(
      canRebuyTournament(
        {
          ...tournament,
          startTime: new Date(Date.now() - 60 * 60 * 1000),
        },
        { rebuyCount: 0 },
      ),
    ).toBe(false);
  });
});
