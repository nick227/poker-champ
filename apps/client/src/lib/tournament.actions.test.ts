import { describe, expect, it, vi, beforeEach } from "vitest";
import { confirmTournamentTableJoin, executeTournamentTableJoin } from "./tournament.actions";
import { resolveTournamentTableForJoin } from "./tournamentEnsureJoin";
import type { TournamentSummary } from "@/services/tournaments.types";

vi.mock("./tournamentEnsureJoin", () => ({
  resolveTournamentTableForJoin: vi.fn(),
}));

function baseTournament(overrides: Partial<TournamentSummary>): TournamentSummary {
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
    currentLevel: 2,
    registeredCount: 4,
    fillBotsAtStart: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    tableId: "table_stale",
    roomId: "room_stale",
    tableLive: true,
    isRegistered: true,
    ...overrides,
  };
}

describe("confirmTournamentTableJoin", () => {
  it("binds colyseus room id and navigates with tournament stack", () => {
    const openTable = vi.fn();
    const setRoomForTable = vi.fn();
    const router = { push: vi.fn() };
    const showToast = vi.fn();

    const ok = confirmTournamentTableJoin(baseTournament({}), {
      openTable,
      setRoomForTable,
      router: router as never,
      showToast,
    }, {
      tableId: "table_stale",
      roomId: "room_stale",
      buyInCents: 10000,
    });

    expect(ok).toBe(true);
    expect(setRoomForTable).toHaveBeenCalledWith("table_stale", "room_stale");
    expect(openTable).toHaveBeenCalledWith("table_stale", { buyInCents: 10000, tournamentId: "t1" });
    expect(router.push).toHaveBeenCalledWith("/table/table_stale?buyInCents=10000");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("returns false when table or room is missing", () => {
    const ok = confirmTournamentTableJoin(baseTournament({ tableId: undefined, roomId: undefined }), {
      openTable: vi.fn(),
      setRoomForTable: vi.fn(),
      router: { push: vi.fn() } as never,
      showToast: vi.fn(),
    }, {
      tableId: "",
      roomId: "",
      buyInCents: 10000,
    });
    expect(ok).toBe(false);
  });
});

describe("executeTournamentTableJoin", () => {
  beforeEach(() => {
    vi.mocked(resolveTournamentTableForJoin).mockReset();
  });

  it("ensures table before navigation even when cached ids exist", async () => {
    vi.mocked(resolveTournamentTableForJoin).mockResolvedValue({
      ok: true,
      tournament: baseTournament({ tableId: "table_fresh", roomId: "room_fresh" }),
      tableId: "table_fresh",
      roomId: "room_fresh",
      buyInCents: 10000,
    });

    const openTable = vi.fn();
    const setRoomForTable = vi.fn();
    const router = { push: vi.fn() };
    const refreshTournament = vi.fn();

    const ok = await executeTournamentTableJoin(baseTournament({}), {
      openTable,
      setRoomForTable,
      router: router as never,
      showToast: vi.fn(),
      refreshTournament,
    });

    expect(resolveTournamentTableForJoin).toHaveBeenCalledWith("t1", "lobby_cta");
    expect(refreshTournament).toHaveBeenCalled();
    expect(ok).toBe(true);
    expect(setRoomForTable).toHaveBeenCalledWith("table_fresh", "room_fresh");
    expect(openTable).toHaveBeenCalledWith("table_fresh", { buyInCents: 10000, tournamentId: "t1" });
    expect(router.push).toHaveBeenCalledWith("/table/table_fresh?buyInCents=10000");
  });

  it("does not navigate when ensure-table is blocked", async () => {
    vi.mocked(resolveTournamentTableForJoin).mockResolvedValue({
      ok: false,
      message: "This tournament has ended.",
    });

    const router = { push: vi.fn() };
    const ok = await executeTournamentTableJoin(baseTournament({}), {
      openTable: vi.fn(),
      setRoomForTable: vi.fn(),
      router: router as never,
      showToast: vi.fn(),
      refreshTournament: vi.fn(),
    });

    expect(ok).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });
});
