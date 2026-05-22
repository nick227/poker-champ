import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveTournamentTableForJoin } from "./tournamentEnsureJoin";
import { postTournamentEnsureTable } from "@/services/post/tournaments.ensure-table";
import type { TournamentSummary } from "@/services/tournaments.types";

vi.mock("@/services/post/tournaments.ensure-table", () => ({
  postTournamentEnsureTable: vi.fn(),
}));

function baseTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: "t1",
    name: "Test",
    status: "RUNNING",
    entryFeeCents: 1000,
    prizePoolCents: 1000,
    startTime: "2026-06-01T18:00:00.000Z",
    maxPlayers: 6,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 0,
    currentLevel: 1,
    registeredCount: 2,
    fillBotsAtStart: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    tableId: "table_a",
    roomId: "room_a",
    isRegistered: true,
    ...overrides,
  };
}

describe("resolveTournamentTableForJoin", () => {
  beforeEach(() => {
    vi.mocked(postTournamentEnsureTable).mockReset();
  });

  it("always calls ensure-table and returns fresh ids", async () => {
    vi.mocked(postTournamentEnsureTable).mockResolvedValue({
      tableId: "table_fresh",
      roomId: "room_fresh",
      tournament: baseTournament({ tableId: "table_fresh", roomId: "room_fresh" }),
    });

    const result = await resolveTournamentTableForJoin("t1");
    expect(postTournamentEnsureTable).toHaveBeenCalledWith("t1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tableId).toBe("table_fresh");
      expect(result.roomId).toBe("room_fresh");
    }
  });

  it("blocks navigation when tournament ended", async () => {
    vi.mocked(postTournamentEnsureTable).mockResolvedValue({
      tableId: "table_a",
      roomId: "room_a",
      tournament: baseTournament({ status: "FINISHED" }),
    });

    const result = await resolveTournamentTableForJoin("t1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("ended");
    }
  });
});
