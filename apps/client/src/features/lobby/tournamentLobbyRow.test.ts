import { describe, expect, it } from "vitest";
import type { TournamentSummary } from "@/services/tournaments.types";
import { formatLateRegOpenLabel, formatLobbyStartsLine } from "./tournamentLobbyRow";

function tournament(overrides: Partial<TournamentSummary>): TournamentSummary {
  return {
    id: "t1",
    name: "Daily",
    status: "REGISTERING",
    entryFeeCents: 100,
    prizePoolCents: 0,
    startTime: new Date("2026-08-13T18:00:00.000Z").toISOString(),
    maxPlayers: 50,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 16,
    currentLevel: 1,
    registeredCount: 10,
    fillBotsAtStart: false,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatLobbyStartsLine", () => {
  it("uses countdown copy before start", () => {
    const now = Date.parse("2026-08-13T17:48:00.000Z");
    const line = formatLobbyStartsLine(tournament({ status: "REGISTERING" }), now);
    expect(line.tone).toBe("warn");
    expect(line.text).toMatch(/^Starts in /);
  });

  it("uses started copy after start", () => {
    const now = Date.parse("2026-08-13T18:08:00.000Z");
    const line = formatLobbyStartsLine(tournament({ status: "RUNNING" }), now);
    expect(line.tone).toBe("brand");
    expect(line.text).toMatch(/^Started /);
  });
});

describe("formatLateRegOpenLabel", () => {
  it("is open while registering before start", () => {
    const now = Date.parse("2026-08-13T17:00:00.000Z");
    expect(formatLateRegOpenLabel(tournament({ status: "REGISTERING" }), now)).toBe("Open");
  });

  it("is closed after late-reg window", () => {
    const now = Date.parse("2026-08-13T19:00:00.000Z");
    expect(formatLateRegOpenLabel(tournament({ status: "RUNNING" }), now)).toBe("Closed");
  });
});
