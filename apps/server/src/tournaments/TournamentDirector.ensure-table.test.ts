import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    // No TournamentTable rows exist for these mocked scenarios (a single-table, N=1 tournament
    // is the only case exercised here), so routing always falls back to the primary
    // Tournament.tableId/roomId path -- see TournamentDirector.resolveActiveTournamentTableForUser.
    tournamentTable: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }: any) => ({ id: `ttable_${data.tableNumber}`, ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    tournamentRegistration: {
      update: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
  matchMaker: {
    query: vi.fn(),
    createRoom: vi.fn(),
    remoteRoomCall: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("@colyseus/core", () => ({
  matchMaker: mocks.matchMaker,
}));

vi.mock("../lib/logger.js", () => ({
  logger: mocks.logger,
}));

import { TournamentDirector } from "./TournamentDirector.js";

describe("TournamentDirector.ensureTournamentTableForJoinDetailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a stored roomId as a liveness hint and restores a stale tournament room", async () => {
    const userId = "user_active";
    let currentTournament = {
      id: "tournament_stale",
      name: "Stale room event",
      status: "RUNNING",
      entryFeeCents: 0,
      prizePoolCents: 0,
      startTime: new Date(Date.now() - 60_000),
      maxPlayers: 6,
      startingStackCents: 10_000,
      blindStructureId: "standard_8min",
      lateRegMinutes: 0,
      playFormat: "FREEZEOUT",
      maxRebuysPerPlayer: 0,
      rebuyPeriodMinutes: 0,
      fillBotsAtStart: false,
      fillBotCount: null,
      currentLevel: 1,
      nextLevelAt: null,
      tableId: "table_dead",
      roomId: "room_dead",
      finishedAt: null,
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const fullRegistrations = [
      { userId, isBot: false, user: { displayName: "Active Player" } },
      { userId: "tournament_bot_chaos_carl", isBot: true, user: { displayName: "Bot" } },
    ];

    mocks.prisma.tournament.findUnique.mockImplementation(async (args: any) => {
      if (args?.select) {
        return {
          status: currentTournament.status,
          tableId: currentTournament.tableId,
          roomId: currentTournament.roomId,
        };
      }
      if (args?.include?.registrations?.where?.userId) {
        return {
          ...currentTournament,
          registrations: [{ userId, eliminatedAt: null, isBot: false, user: { displayName: "Active Player" } }],
        };
      }
      return { ...currentTournament, registrations: fullRegistrations };
    });
    mocks.prisma.tournament.findUniqueOrThrow.mockImplementation(async () => ({
      status: currentTournament.status,
      tableId: currentTournament.tableId,
      roomId: currentTournament.roomId,
    }));
    mocks.prisma.tournament.update.mockImplementation(async ({ data }: any) => {
      currentTournament = { ...currentTournament, ...data };
      return currentTournament;
    });
    mocks.matchMaker.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ roomId: "room_restored" }]);
    mocks.matchMaker.createRoom.mockResolvedValue({ roomId: "room_restored" });
    mocks.matchMaker.remoteRoomCall.mockResolvedValue({ ok: true, seated: 2 });

    const result = await new TournamentDirector().ensureTournamentTableForJoinDetailed(
      currentTournament.id,
      userId,
    );

    expect(mocks.prisma.tournament.update).toHaveBeenCalledWith({
      where: { id: currentTournament.id },
      data: { roomId: null, tableId: null },
    });
    expect(result.joinStatus).toBe("RESTORED");
    expect(result.roomId).toBe("room_restored");
    expect(result.tableId).toBeTruthy();
    expect(result.tableLive).toBe(true);
    expect(result.recoveryReason).toBe("STALE_ROOM_REPLACED");
  });
});
