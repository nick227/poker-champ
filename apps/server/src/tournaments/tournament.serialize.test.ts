import { describe, expect, it } from "vitest";
import type { Tournament } from "@prisma/client";
import { toTournamentResponse } from "./tournament.serialize.js";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    name: "Event",
    status: "REGISTERING",
    entryFeeCents: 1000,
    prizePoolCents: 0,
    startTime: new Date("2026-06-01T18:00:00.000Z"),
    maxPlayers: 9,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 16,
    playFormat: "FREEZEOUT",
    maxRebuysPerPlayer: 0,
    rebuyPeriodMinutes: 0,
    fillBotsAtStart: false,
    fillBotCount: null,
    currentLevel: 1,
    nextLevelAt: null,
    tableId: null,
    roomId: null,
    finishedAt: null,
    handForHandActive: false,
    createdByUserId: null,
    ...overrides,
  };
}

describe("toTournamentResponse", () => {
  it("exposes lateRegClosesAt as startTime plus lateRegMinutes", () => {
    const res = toTournamentResponse(tournament());
    expect(res.lateRegClosesAt).toBe("2026-06-01T18:16:00.000Z");
    expect(res.registeredCount).toBe(0);
  });

  it("closes late reg at start when lateRegMinutes is zero", () => {
    const res = toTournamentResponse(tournament({ lateRegMinutes: 0 }));
    expect(res.lateRegClosesAt).toBe("2026-06-01T18:00:00.000Z");
  });
});
