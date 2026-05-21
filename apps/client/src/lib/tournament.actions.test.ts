import { describe, expect, it, vi } from "vitest";
import { confirmTournamentTableJoin } from "./tournament.actions";
import type { TournamentSummary } from "@/services/tournaments.types";

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
    tableId: "table_abc",
    roomId: "room_xyz",
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
    });

    expect(ok).toBe(true);
    expect(setRoomForTable).toHaveBeenCalledWith("table_abc", "room_xyz");
    expect(openTable).toHaveBeenCalledWith("table_abc", { buyInCents: 10000 });
    expect(router.push).toHaveBeenCalledWith("/table/table_abc?buyInCents=10000");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("fails when table or room is missing", () => {
    const showToast = vi.fn();
    const ok = confirmTournamentTableJoin(baseTournament({ tableId: undefined, roomId: undefined }), {
      openTable: vi.fn(),
      setRoomForTable: vi.fn(),
      router: { push: vi.fn() } as never,
      showToast,
    });
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalled();
  });
});
