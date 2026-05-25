import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
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
  playerA: `tourney_m19_a_${testRunId}`,
  playerB: `tourney_m19_b_${testRunId}`,
};

describe.skipIf(!hasDatabase)("Tournament M19 — dead Colyseus room recovery on tick", () => {
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

  async function startRunningTournament() {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M19 ${testRunId}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 120_000),
        maxPlayers: 2,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        fillBotsAtStart: false,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.playerA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerA),
    });
    await CashierService.processTournamentRegister({
      userId: testUsers.playerB,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerB),
    });

    await tournamentDirector.processTournament(tournament.id);
    return prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
  }

  it("tick restores a live room when RUNNING tournament loses its Colyseus room", async () => {
    const prisma = getPrisma();
    const running = await startRunningTournament();
    expect(running.status).toBe("RUNNING");
    expect(running.roomId).toBeTruthy();
    expect(pokerRooms.has(running.roomId!)).toBe(true);

    const deadRoomId = running.roomId!;
    pokerRooms.delete(deadRoomId);
    expect(pokerRooms.has(deadRoomId)).toBe(false);

    const regCountBefore = await prisma.tournamentRegistration.count({
      where: { tournamentId: running.id },
    });
    expect(regCountBefore).toBe(2);

    await tournamentDirector.tick(new Date());

    const afterTick = await prisma.tournament.findUniqueOrThrow({ where: { id: running.id } });
    expect(afterTick.status).toBe("RUNNING");
    expect(afterTick.finishedAt).toBeNull();
    expect(afterTick.roomId).toBeTruthy();
    expect(pokerRooms.has(afterTick.roomId!)).toBe(true);

    const regs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: running.id, isBot: false },
    });
    expect(regs).toHaveLength(2);
    expect(regs.every((r) => r.finishPlace == null)).toBe(true);

    const regCountAfter = await prisma.tournamentRegistration.count({
      where: { tournamentId: running.id },
    });
    expect(regCountAfter).toBe(regCountBefore);
  });
});
