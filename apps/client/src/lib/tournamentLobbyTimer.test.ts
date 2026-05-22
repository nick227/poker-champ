import { describe, expect, it } from "vitest";
import {
  formatElapsedSince,
  formatTournamentSupplementHint,
  resolveTournamentLobbyTimer,
} from "@/lib/tournamentLobbyTimer";
import { formatCountdownTo } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

function baseTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: "t1",
    name: "Test",
    status: "REGISTERING",
    entryFeeCents: 1000,
    prizePoolCents: 0,
    startTime: new Date(Date.now() + 3_600_000).toISOString(),
    maxPlayers: 9,
    startingStackCents: 10_000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 16,
    currentLevel: 1,
    registeredCount: 0,
    fillBotsAtStart: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as TournamentSummary;
}

describe("resolveTournamentLobbyTimer", () => {
  it("countdown for scheduled registering tournaments", () => {
    const now = Date.now();
    const startMs = now + 90_000;
    const timer = resolveTournamentLobbyTimer(
      baseTournament({ startTime: new Date(startMs).toISOString() }),
      now,
    );
    expect(timer).toEqual({
      mode: "countdown",
      headline: "Starts in",
      time: formatCountdownTo(startMs, now),
    });
  });

  it("countup with level for running tournaments", () => {
    const now = Date.now();
    const startMs = now - 125_000;
    const timer = resolveTournamentLobbyTimer(
      baseTournament({
        status: "RUNNING",
        startTime: new Date(startMs).toISOString(),
        currentLevel: 4,
      }),
      now,
    );
    expect(timer?.mode).toBe("countup");
    expect(timer?.headline).toBe("Running");
    expect(timer?.time).toBe(formatElapsedSince(startMs, now));
    expect(timer?.detail).toBe("Level 4");
  });

  it("countup with late reg countdown while late registration is open", () => {
    const now = Date.now();
    const startMs = now - 60_000;
    const timer = resolveTournamentLobbyTimer(
      baseTournament({
        status: "LATE_REG",
        startTime: new Date(startMs).toISOString(),
        lateRegMinutes: 16,
        currentLevel: 2,
      }),
      now,
    );
    expect(timer?.mode).toBe("countup");
    expect(timer?.detail).toMatch(/Level 2 · late reg closes in/);
  });
});

describe("formatTournamentSupplementHint", () => {
  it("shows local start time under scheduled countdown", () => {
    const t = baseTournament();
    const hint = formatTournamentSupplementHint(t, Date.now());
    expect(hint).toMatch(/^Starts /);
  });
});

describe("formatElapsedSince", () => {
  it("formats mm:ss under one hour", () => {
    const now = 1_000_000;
    expect(formatElapsedSince(now - 65_000, now)).toBe("1:05");
  });
});
