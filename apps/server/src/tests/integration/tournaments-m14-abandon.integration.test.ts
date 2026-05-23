import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { getMaxBlindLevel } from "../../tournaments/blind-structure.js";
import { abandonTournamentAtMaxBlind } from "../../tournaments/tournament-abandon.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import type { TableConfig } from "../../lobby/types.js";

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
      query: vi.fn().mockResolvedValue([]),
    },
  };
});

const testRunId = nanoid(6);
const testUsers = {
  humanA: `tourney_m14_a_${testRunId}`,
  humanB: `tourney_m14_b_${testRunId}`,
};

describe("Tournament M14 abandon at max blind", () => {
  const tournamentIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    await prisma.user.deleteMany({ where: { id: { in: [testUsers.humanA, testUsers.humanB] } } });
    for (const id of [testUsers.humanA, testUsers.humanB]) {
      await prisma.user.create({
        data: {
          id,
          email: `${id}@tourney.test`,
          passwordHash: "hash",
          displayName: id,
          role: "USER",
          bankrollCents: 100_000,
        },
      });
    }
  });

  afterAll(async () => {
    const prisma = getPrisma();
    for (const id of tournamentIds) {
      await prisma.tournamentPlayerResult.deleteMany({ where: { tournamentId: id } });
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    await prisma.playerBalance.deleteMany({
      where: { userId: { in: [testUsers.humanA, testUsers.humanB] } },
    });
    await prisma.tournamentPlayerResult.deleteMany({
      where: { userId: { in: [testUsers.humanA, testUsers.humanB] } },
    });
    await prisma.balanceTransaction.deleteMany({
      where: { userId: { in: [testUsers.humanA, testUsers.humanB] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [testUsers.humanA, testUsers.humanB] } } });
    pokerRooms.clear();
  });

  it("abandons at max blind when all humans bust with refunds and no payouts", async () => {
    const prisma = getPrisma();
    const entryFeeCents = 3000;
    const tournament = await prisma.tournament.create({
      data: {
        name: `M14 ${nanoid(4)}`,
        entryFeeCents,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 3,
        startingStackCents: 5000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    for (const userId of [testUsers.humanA, testUsers.humanB]) {
      await CashierService.processTournamentRegister({
        userId,
        tournamentId: tournament.id,
        entryFeeCents,
        externalRef: tournamentEntryExternalRef(tournament.id, userId),
      });
    }

    const bankrollBefore = await prisma.user.findMany({
      where: { id: { in: [testUsers.humanA, testUsers.humanB] } },
      select: { id: true, bankrollCents: true },
    });

    await tournamentDirector.processTournament(tournament.id);
    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.status).toBe("RUNNING");

    await prisma.tournamentRegistration.update({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.humanA } },
      data: { finishPlace: 2, eliminatedAt: new Date() },
    });
    await prisma.tournamentRegistration.update({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.humanB } },
      data: { finishPlace: 1, eliminatedAt: new Date() },
    });

    const maxLevel = getMaxBlindLevel("standard_8min");
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { currentLevel: maxLevel, nextLevelAt: new Date(Date.now() - 1000) },
    });

    const abandonedOk = await abandonTournamentAtMaxBlind(tournament.id, new Date());
    expect(abandonedOk).toBe(true);

    const abandoned = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(abandoned.status).toBe("ABANDONED");
    expect(abandoned.prizePoolCents).toBe(0);

    const payoutCount = await prisma.balanceTransaction.count({
      where: { tournamentId: tournament.id, type: "TOURNAMENT_PAYOUT" },
    });
    expect(payoutCount).toBe(0);

    const refundCount = await prisma.balanceTransaction.count({
      where: { tournamentId: tournament.id, type: "REFUND", amountCents: entryFeeCents },
    });
    expect(refundCount).toBe(2);

    for (const row of bankrollBefore) {
      const after = await prisma.user.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.bankrollCents).toBe(row.bankrollCents + entryFeeCents);
    }
  }, 20_000);
});
