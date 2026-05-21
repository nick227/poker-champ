import { describe, expect, it } from "vitest";
import { tournamentNeedsFastLobbyRefresh } from "./useTournamentStartLobbyEffects";
import type { TournamentSummary } from "@/services/tournaments.types";

function base(overrides: Partial<TournamentSummary>): TournamentSummary {
  return {
    id: "t1",
    name: "Test",
    status: "REGISTERING",
    entryFeeCents: 1000,
    prizePoolCents: 0,
    startTime: new Date(Date.now() + 120_000).toISOString(),
    maxPlayers: 6,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 0,
    currentLevel: 1,
    registeredCount: 1,
    fillBotsAtStart: false,
    isRegistered: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("tournamentNeedsFastLobbyRefresh", () => {
  it("is true within three minutes of start for registered tournaments", () => {
    const now = Date.now();
    const t = base({ startTime: new Date(now + 60_000).toISOString() });
    expect(tournamentNeedsFastLobbyRefresh(t, now)).toBe(true);
  });

  it("is false when start is far away", () => {
    const now = Date.now();
    const t = base({ startTime: new Date(now + 10 * 60_000).toISOString() });
    expect(tournamentNeedsFastLobbyRefresh(t, now)).toBe(false);
  });
});
