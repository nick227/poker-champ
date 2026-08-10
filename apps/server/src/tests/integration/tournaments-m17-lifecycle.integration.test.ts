import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { lateRegCloseMs } from "../../tournaments/tournament-schedule.js";
import type { TableConfig } from "../../lobby/types.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);

vi.setConfig({ testTimeout: 60_000 });

const pokerRooms = new Map<string, PokerRoom>();

vi.mock("@colyseus/core", async () => {
  const actual = await vi.importActual<typeof import("@colyseus/core")>("@colyseus/core");
  return {
    ...actual,
    matchMaker: {
      createRoom: async (_name: string, options: { tableConfig?: TableConfig }) => {
        const room = new PokerRoom() as PokerRoom & { roomId: string; setMetadata: () => Promise<void> };
        room.roomId = `room_${nanoid(8)}`;
        room.setMetadata = vi.fn().mockResolvedValue(undefined);
        await room.onCreate({ tableConfig: options.tableConfig });
        pokerRooms.set(room.roomId, room);
        return { roomId: room.roomId };
      },
      remoteRoomCall: async (roomId: string, method: string, args: unknown[]) => {
        const room = pokerRooms.get(roomId) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
        if (!room || typeof room[method] !== "function") {
          throw new Error(`Room method not found: ${method}`);
        }
        return room[method](...(args as unknown[]));
      },
      query: vi.fn(async () =>
        [...pokerRooms.entries()].map(([roomId, room]) => ({
          roomId,
          name: "poker",
          clients: 0,
          maxClients: 9,
          metadata: {
            tableId: room.state.tableId,
            name: room.state.tableName,
            tournamentId: room.getTournamentIdInternal(),
          },
        })),
      ),
    },
  };
});

const testRunId = nanoid(6);
const testUsers = {
  seatedA: `tourney_m17_a_${testRunId}`,
  seatedB: `tourney_m17_b_${testRunId}`,
  noShow: `tourney_m17_ns_${testRunId}`,
};

describe.skipIf(!hasDatabase)("Tournament M17 lifecycle — late reg close and finish eligibility", () => {
  const tournamentIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const userIds = Object.values(testUsers);
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `${id}@tourney.test`,
        passwordHash: "hash",
        displayName: id,
        role: "USER",
        bankrollCents: 100_000,
      })),
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    for (const tournamentId of tournamentIds) {
      await prisma.tournamentPlayerResult.deleteMany({ where: { tournamentId } });
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId } });
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    const userIds = Object.values(testUsers);
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    pokerRooms.clear();
  });

  beforeEach(() => {
    pokerRooms.clear();
  });

  async function createLateRegBotTournament(lateRegMinutes = 60) {
    const prisma = getPrisma();
    const startTime = new Date(Date.now() - 60_000);
    const tournament = await prisma.tournament.create({
      data: {
        name: `M17 ${testRunId}`,
        entryFeeCents: 0,
        startTime,
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes,
        fillBotsAtStart: true,
        fillBotCount: 2,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);
    return tournament;
  }

  it("eliminates no-show humans when late registration closes", async () => {
    const prisma = getPrisma();
    const tournament = await createLateRegBotTournament();

    await tournamentDirector.beginLateRegistration(tournament.id);
    const afterOpen = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterOpen.roomId).toBeTruthy();

    await prisma.tournamentRegistration.create({
      data: { tournamentId: tournament.id, userId: testUsers.noShow },
    });

    const closeAt = new Date(lateRegCloseMs(afterOpen) + 1000);
    await tournamentDirector.closeLateRegistration(tournament.id, closeAt);

    const noShowReg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.noShow } },
    });
    expect(noShowReg.finishPlace).not.toBeNull();
    expect(noShowReg.eliminatedAt).not.toBeNull();
  });

  it("allows bot winner after late reg close when all humans were no-shows", async () => {
    const prisma = getPrisma();
    const tournament = await createLateRegBotTournament();

    await tournamentDirector.beginLateRegistration(tournament.id);
    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });

    await prisma.tournamentRegistration.create({
      data: { tournamentId: tournament.id, userId: testUsers.noShow },
    });

    const room = pokerRooms.get(running.roomId!)!;
    expect(room.state.playersById.has(testUsers.noShow)).toBe(false);

    await tournamentDirector.closeLateRegistration(
      tournament.id,
      new Date(lateRegCloseMs(running) + 1000),
    );

    const botIds = [...room.state.playersById.values()].filter((p) => p.kind === "BOT").map((p) => p.id);
    expect(botIds.length).toBeGreaterThanOrEqual(2);

    for (const botId of botIds.slice(1)) {
      const bot = room.state.playersById.get(botId);
      if (!bot) continue;
      bot.stackCents = 0;
      room.state.street = "WAITING";
      await tournamentTableReconciler.reconcileAfterHand({
        tournamentId: tournament.id,
        tableId: running.tableId!,
        roomId: running.roomId!,
        state: room.state,
        tableName: room.state.tableName,
        removeBustedPlayer: async (userId) => {
          room.state.playersById.delete(userId);
        },
        removePlayerForTableTransfer: async (userId) => room.removeTournamentPlayerForTableTransfer(userId),
        onOverlayUpdated: () => {},
        onPlayEnded: () => {},
        onTableBreaking: () => {},
        onHandForHandHold: () => {},
        onHandForHandRelease: () => {},
      });
    }

    const finished = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.finishedAt).not.toBeNull();
  });

  it("does not no-show seated humans at late reg close", async () => {
    const prisma = getPrisma();
    const tournament = await createLateRegBotTournament(16);

    await prisma.tournamentRegistration.createMany({
      data: [
        { tournamentId: tournament.id, userId: testUsers.seatedA },
        { tournamentId: tournament.id, userId: testUsers.seatedB },
      ],
    });

    await tournamentDirector.beginLateRegistration(tournament.id);
    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(["LATE_REG", "RUNNING"]).toContain(running.status);

    const room = pokerRooms.get(running.roomId!)!;
    expect(room.state.playersById.has(testUsers.seatedA)).toBe(true);
    expect(room.state.playersById.has(testUsers.seatedB)).toBe(true);

    await prisma.tournamentRegistration.create({
      data: { tournamentId: tournament.id, userId: testUsers.noShow },
    });
    expect(room.state.playersById.has(testUsers.noShow)).toBe(false);

    await tournamentDirector.closeLateRegistration(
      tournament.id,
      new Date(lateRegCloseMs(running) + 1000),
    );

    const regs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, isBot: false },
    });
    const byUser = new Map(regs.map((r) => [r.userId, r]));
    expect(byUser.get(testUsers.seatedA)?.finishPlace).toBeNull();
    expect(byUser.get(testUsers.seatedB)?.finishPlace).toBeNull();
    expect(byUser.get(testUsers.noShow)?.finishPlace).not.toBeNull();

    const afterClose = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterClose.status).not.toBe("FINISHED");
  });
});
