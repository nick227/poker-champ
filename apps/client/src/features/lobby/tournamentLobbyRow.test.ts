import { describe, expect, it } from "vitest";
import type { TournamentSummary } from "@/services/tournaments.types";
import {
  formatLateRegOpenLabel,
  formatLobbyStartsLine,
  formatLobbyTournamentStatus,
  lobbyTournamentStatusClass,
} from "./tournamentLobbyRow";

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
    expect(line.text).toBe("Starts in 12 min");
  });

  it("uses started copy after start", () => {
    const now = Date.parse("2026-08-13T18:08:00.000Z");
    const line = formatLobbyStartsLine(tournament({ status: "RUNNING" }), now);
    expect(line.tone).toBe("brand");
    expect(line.text).toBe("Started 8 min ago");
  });
});

describe("formatLateRegOpenLabel", () => {
  it("shows remaining late-reg time while the window is open", () => {
    const now = Date.parse("2026-08-13T17:00:00.000Z");
    expect(formatLateRegOpenLabel(tournament({ status: "REGISTERING" }), now)).toBe("1 h 16 min");
  });

  it("is closed after late-reg window", () => {
    const now = Date.parse("2026-08-13T19:00:00.000Z");
    expect(formatLateRegOpenLabel(tournament({ status: "RUNNING" }), now)).toBe("Closed");
  });
});

describe("formatLobbyTournamentStatus", () => {
  it("shows Late Reg after start while the window is still open", () => {
    const now = Date.parse("2026-08-13T18:08:00.000Z");
    const t = tournament({ status: "RUNNING" });
    expect(formatLobbyTournamentStatus(t, now)).toBe("Late Reg");
    expect(lobbyTournamentStatusClass(t, now, false)).toBe("text-gold");
  });

  it("shows Running after late-reg closes", () => {
    const now = Date.parse("2026-08-13T19:00:00.000Z");
    const t = tournament({ status: "RUNNING" });
    expect(formatLobbyTournamentStatus(t, now)).toBe("Running");
    expect(lobbyTournamentStatusClass(t, now, false)).toBe("text-brand");
  });
});
