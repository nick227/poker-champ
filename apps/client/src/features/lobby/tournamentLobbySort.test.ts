import { describe, expect, it } from "vitest";
import type { TournamentSummary } from "@/services/tournaments.types";
import { sortTournamentLobbyRows } from "./tournamentLobbySort";

function tournament(
  overrides: Partial<TournamentSummary> & Pick<TournamentSummary, "id" | "name">,
): TournamentSummary {
  return {
    status: "REGISTERING",
    entryFeeCents: 1000,
    prizePoolCents: 0,
    startTime: "2026-06-01T18:00:00.000Z",
    maxPlayers: 9,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 16,
    currentLevel: 1,
    registeredCount: 1,
    fillBotsAtStart: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sortTournamentLobbyRows", () => {
  const nowMs = Date.parse("2026-06-01T18:10:00.000Z");
  const rows = [
    tournament({
      id: "upcoming",
      name: "Later",
      startTime: "2026-06-01T19:00:00.000Z",
      registeredCount: 2,
      entryFeeCents: 500,
    }),
    tournament({
      id: "running",
      name: "Alpha",
      status: "RUNNING",
      startTime: "2026-06-01T17:00:00.000Z",
      lateRegMinutes: 0,
      registeredCount: 8,
      entryFeeCents: 2000,
    }),
    tournament({
      id: "late",
      name: "Mid",
      status: "LATE_REG",
      startTime: "2026-06-01T18:00:00.000Z",
      registeredCount: 4,
      entryFeeCents: 1000,
    }),
  ];

  it("defaults startTime asc: already started first, then upcoming", () => {
    expect(sortTournamentLobbyRows(rows, "startTime", "asc", nowMs).map((t) => t.id)).toEqual([
      "running",
      "late",
      "upcoming",
    ]);
  });

  it("sorts enrolled desc: largest field first", () => {
    expect(sortTournamentLobbyRows(rows, "enrolled", "desc", nowMs).map((t) => t.id)).toEqual([
      "running",
      "late",
      "upcoming",
    ]);
  });

  it("sorts status asc: running, late reg, registering", () => {
    expect(sortTournamentLobbyRows(rows, "status", "asc", nowMs).map((t) => t.id)).toEqual([
      "running",
      "late",
      "upcoming",
    ]);
  });

  it("uses lateRegClosesAt when sorting late-reg close", () => {
    const withClose = [
      tournament({
        id: "soon",
        name: "Soon",
        startTime: "2026-06-01T17:00:00.000Z",
        lateRegMinutes: 90,
        lateRegClosesAt: "2026-06-01T18:05:00.000Z",
      }),
      tournament({
        id: "later",
        name: "Later Close",
        startTime: "2026-06-01T17:30:00.000Z",
        lateRegMinutes: 16,
        lateRegClosesAt: "2026-06-01T18:20:00.000Z",
      }),
    ];
    expect(sortTournamentLobbyRows(withClose, "lateReg", "asc", nowMs).map((t) => t.id)).toEqual([
      "soon",
      "later",
    ]);
  });
});
