import { ApiError } from "@poker-champ/sdk";
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
      joinStatus: "READY",
      tableLive: true,
      playerStatus: "ACTIVE",
      tournamentStatus: "RUNNING",
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

  it.each(["READY", "RESTORED", "CREATING_TABLE"] as const)(
    "navigates when ensure-table returns %s with table targets",
    async (joinStatus) => {
      vi.mocked(postTournamentEnsureTable).mockResolvedValue({
        joinStatus,
        tableLive: joinStatus !== "CREATING_TABLE",
        playerStatus: "ACTIVE",
        tournamentStatus: "RUNNING",
        tableId: "table_fresh",
        roomId: "room_fresh",
        tournament: baseTournament({ tableId: "table_fresh", roomId: "room_fresh" }),
      });

      const result = await resolveTournamentTableForJoin("t1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tableId).toBe("table_fresh");
        expect(result.roomId).toBe("room_fresh");
      }
    },
  );

  it("blocks navigation when new ensure-table contract says tournament ended", async () => {
    vi.mocked(postTournamentEnsureTable).mockResolvedValue({
      joinStatus: "ENDED",
      tableLive: false,
      playerStatus: "ACTIVE",
      tournamentStatus: "FINISHED",
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

  it.each([
    ["NOT_ALLOWED", "TOURNAMENT_NOT_REGISTERED", "not registered"],
    ["FAILED", "TOURNAMENT_TABLE_UNAVAILABLE", "not ready"],
  ] as const)("blocks navigation when ensure-table returns %s", async (joinStatus, recoveryReason, expectedCopy) => {
    vi.mocked(postTournamentEnsureTable).mockResolvedValue({
      joinStatus,
      tableLive: false,
      playerStatus: joinStatus === "NOT_ALLOWED" ? "NOT_REGISTERED" : "ACTIVE",
      tournamentStatus: "RUNNING",
      recoveryReason,
      tableId: joinStatus === "FAILED" ? null : "table_a",
      roomId: joinStatus === "FAILED" ? null : "room_a",
      tournament: baseTournament({ tableId: "table_a", roomId: "room_a" }),
    });

    const result = await resolveTournamentTableForJoin("t1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain(expectedCopy);
    }
  });

  it("does not fall back to nested stale room ids when the new contract is present", async () => {
    vi.mocked(postTournamentEnsureTable).mockResolvedValue({
      joinStatus: "READY",
      tableLive: false,
      playerStatus: "ACTIVE",
      tournamentStatus: "RUNNING",
      tableId: null,
      roomId: null,
      tournament: baseTournament({ tableId: "table_stale", roomId: "room_stale" }),
    });

    const result = await resolveTournamentTableForJoin("t1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Tournament table is not ready");
    }
  });

  it("logs ensure-table API code and status on request failure", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(postTournamentEnsureTable).mockRejectedValue(
      new ApiError("not found", { status: 404, code: "REQUEST_VALIDATION_ERROR" }),
    );

    const result = await resolveTournamentTableForJoin("t1", "lobby_cta");
    expect(result.ok).toBe(false);
    const blocked = logSpy.mock.calls.find(
      (call) => call[0] === "[TOURNAMENT_JOIN_BLOCKED_CLIENT]",
    );
    expect(blocked?.[1]).toMatchObject({
      code: "REQUEST_VALIDATION_ERROR",
      status: 404,
      source: "lobby_cta",
    });
    logSpy.mockRestore();
  });

  it("keeps backward tolerance for older ensure-table responses without joinStatus", async () => {
    vi.mocked(postTournamentEnsureTable).mockResolvedValue({
      tableId: "table_legacy",
      roomId: "room_legacy",
      tournament: baseTournament({ tableId: "table_legacy", roomId: "room_legacy" }),
    });

    const result = await resolveTournamentTableForJoin("t1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tableId).toBe("table_legacy");
      expect(result.roomId).toBe("room_legacy");
    }
  });
});
