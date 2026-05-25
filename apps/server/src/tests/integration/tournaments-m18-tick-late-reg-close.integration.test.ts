import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
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
  playerA: `tourney_m18_a_${testRunId}`,
  playerC: `tourney_m18_c_${testRunId}`,
  playerB: `tourney_m18_b_${testRunId}`,
};

describe.skipIf(!hasDatabase)("Tournament M18 — late reg close via director tick", () => {
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
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    pokerRooms.clear();
  });

  beforeEach(() => {
    pokerRooms.clear();
  });

  async function registerUser(tournamentId: string, userId: string, entryFeeCents: number) {
    await CashierService.processTournamentRegister({
      userId,
      tournamentId,
      entryFeeCents,
      externalRef: tournamentEntryExternalRef(tournamentId, userId),
    });
  }

  async function createLateRegTournament(lateRegMinutes = 16) {
    const prisma = getPrisma();
    const startTime = new Date(Date.now() - 60_000);
    const tournament = await prisma.tournament.create({
      data: {
        name: `M18 ${testRunId}`,
        entryFeeCents: 1000,
        startTime,
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes,
        fillBotsAtStart: false,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);
    return tournament;
  }

  it("tick past late reg close eliminates no-show B while A and C stay active in RUNNING field", async () => {
    const prisma = getPrisma();
    const tournament = await createLateRegTournament();

    await registerUser(tournament.id, testUsers.playerA, tournament.entryFeeCents);
    await registerUser(tournament.id, testUsers.playerC, tournament.entryFeeCents);

    await tournamentDirector.beginLateRegistration(tournament.id);
    const afterOpen = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterOpen.roomId).toBeTruthy();
    expect(["LATE_REG", "RUNNING"]).toContain(afterOpen.status);

    const room = pokerRooms.get(afterOpen.roomId!)!;
    expect(room.state.playersById.has(testUsers.playerA)).toBe(true);
    expect(room.state.playersById.has(testUsers.playerC)).toBe(true);

    await registerUser(tournament.id, testUsers.playerB, tournament.entryFeeCents);
    expect(room.state.playersById.has(testUsers.playerB)).toBe(false);

    const closeAt = new Date(lateRegCloseMs(afterOpen) + 1000);

    await tournamentDirector.tick(closeAt);
    const afterFirstTick = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterFirstTick.status).toBe("RUNNING");
    expect(afterFirstTick.finishedAt).toBeNull();

    const regsAfterFirst = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, isBot: false },
    });
    const byUserFirst = new Map(regsAfterFirst.map((r) => [r.userId, r]));
    expect(byUserFirst.get(testUsers.playerA)?.finishPlace).toBeNull();
    expect(byUserFirst.get(testUsers.playerC)?.finishPlace).toBeNull();
    expect(byUserFirst.get(testUsers.playerB)?.finishPlace).not.toBeNull();
    expect(byUserFirst.get(testUsers.playerB)?.eliminatedAt).not.toBeNull();

    await tournamentDirector.tick(closeAt);
    const afterSecondTick = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterSecondTick.status).toBe("RUNNING");
    expect(afterSecondTick.finishedAt).toBeNull();

    const regsAfterSecond = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, isBot: false },
    });
    const byUserSecond = new Map(regsAfterSecond.map((r) => [r.userId, r]));
    expect(byUserSecond.get(testUsers.playerA)?.finishPlace).toBeNull();
    expect(byUserSecond.get(testUsers.playerC)?.finishPlace).toBeNull();
    expect(byUserSecond.get(testUsers.playerB)?.finishPlace).toBe(
      byUserFirst.get(testUsers.playerB)?.finishPlace,
    );
  });
});
