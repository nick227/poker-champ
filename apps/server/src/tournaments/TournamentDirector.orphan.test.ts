import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    tournament: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    // No TournamentTable rows in these scenarios -> reconcileOrphanRunningTournaments falls back
    // to the original single-room check, unchanged. See TournamentDirector.reconcileOrphanRunningTournaments.
    tournamentTable: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  },
  loadLivePokerRoomIds: vi.fn(),
  processTournamentFinishResults: vi.fn(),
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("./tournament-room-live.js", () => ({
  loadLivePokerRoomIds: mocks.loadLivePokerRoomIds,
  isTournamentRoomLive: (roomId: string | null | undefined, liveRoomIds: Set<string>) =>
    typeof roomId === "string" && roomId.length > 0 && liveRoomIds.has(roomId),
}));

vi.mock("./tournament-result-processor.js", () => ({
  processTournamentFinishResults: mocks.processTournamentFinishResults,
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TournamentDirector } from "./TournamentDirector.js";

describe("TournamentDirector.reconcileOrphanRunningTournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set());
    mocks.processTournamentFinishResults.mockResolvedValue(undefined);
  });

  it("does not finish RUNNING tournaments with null roomId during table restore", async () => {
    mocks.prisma.tournament.findMany.mockResolvedValue([
      {
        id: "tourney_restore",
        status: "RUNNING",
        roomId: null,
        tableId: null,
        startTime: new Date(),
      },
    ]);

    await new TournamentDirector().reconcileOrphanRunningTournaments();

    expect(mocks.prisma.tournament.update).not.toHaveBeenCalled();
  });

  it("finishes RUNNING tournaments whose stored room is not live", async () => {
    mocks.prisma.tournament.findMany.mockResolvedValue([
      {
        id: "tourney_dead_room",
        status: "RUNNING",
        roomId: "room_dead",
        tableId: "table_dead",
        startTime: new Date(),
      },
    ]);
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_other"]));

    await new TournamentDirector().reconcileOrphanRunningTournaments();

    expect(mocks.prisma.tournament.update).toHaveBeenCalledWith({
      where: { id: "tourney_dead_room" },
      data: expect.objectContaining({ status: "FINISHED" }),
    });
  });
});
