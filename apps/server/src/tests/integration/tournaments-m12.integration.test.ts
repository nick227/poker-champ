import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { processTournamentFinishResults } from "../../tournaments/tournament-result-processor.js";
import {
  getTournamentBotUserId,
  TOURNAMENT_BOT_USER_ID_PREFIX,
} from "../../tournaments/tournament-bot-users.js";
import { computeHumanPayoutAmountsByUserId } from "../../tournaments/tournament-payouts.js";
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
  human: `tourney_m12_human_${testRunId}`,
};

describe("Tournament M12 bot demo polish", () => {
  const tournamentIds: string[] = [];

  async function cleanupBotUsers(prisma: ReturnType<typeof getPrisma>) {
    const botUserFilter = { startsWith: TOURNAMENT_BOT_USER_ID_PREFIX };
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: botUserFilter } });
    await prisma.userTournamentStats.deleteMany({ where: { userId: botUserFilter } });
    await prisma.playerBalance.deleteMany({ where: { userId: botUserFilter } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: botUserFilter } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: botUserFilter } });
    await prisma.user.deleteMany({ where: { id: botUserFilter } });
  }

  beforeAll(async () => {
    const prisma = getPrisma();
    await cleanupBotUsers(prisma);
    await prisma.user.deleteMany({ where: { id: testUsers.human } });
    await prisma.user.create({
      data: {
        id: testUsers.human,
        email: `${testUsers.human}@tourney.test`,
        passwordHash: "hash",
        displayName: "M12 Human",
        role: "USER",
        bankrollCents: 100_000,
      },
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    for (const id of tournamentIds) {
      await prisma.tournamentPlayerResult.deleteMany({ where: { tournamentId: id } });
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: testUsers.human } });
    await prisma.userTournamentStats.deleteMany({ where: { userId: testUsers.human } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: testUsers.human } });
    await prisma.playerBalance.deleteMany({ where: { userId: testUsers.human } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: testUsers.human } });
    await prisma.user.deleteMany({ where: { id: testUsers.human } });
    await cleanupBotUsers(prisma);
    pokerRooms.clear();
  });

  beforeEach(async () => {
    pokerRooms.clear();
    const prisma = getPrisma();
    await prisma.userTournamentStats.deleteMany({ where: { userId: testUsers.human } });
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: testUsers.human } });
    await prisma.user.update({
      where: { id: testUsers.human },
      data: { bankrollCents: 100_000 },
    });
  });

  async function createAndStartBotDemo() {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M12 ${nanoid(4)}`,
        entryFeeCents: 5000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 3,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 2,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.human,
      tournamentId: tournament.id,
      entryFeeCents: 5000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.human),
    });

    await tournamentDirector.processTournament(tournament.id);
    return prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
  }

  it("starts with one human and filled bots", async () => {
    const tournament = await createAndStartBotDemo();
    expect(tournament.status).toBe("RUNNING");
    expect(tournament.prizePoolCents).toBe(5000);

    const prisma = getPrisma();
    const regs = await prisma.tournamentRegistration.findMany({ where: { tournamentId: tournament.id } });
    expect(regs.filter((r) => !r.isBot)).toHaveLength(1);
    expect(regs.filter((r) => r.isBot)).toHaveLength(2);
  });

  it("does not record stats or awards for bot registrations on finish", async () => {
    const prisma = getPrisma();
    const botUserId = getTournamentBotUserId("chaos_carl");
    await prisma.user.upsert({
      where: { id: botUserId },
      create: {
        id: botUserId,
        email: `${botUserId}@tournament-bot.local`,
        passwordHash: "tournament_bot",
        displayName: "Chaos Carl",
        role: "USER",
        bankrollCents: 0,
      },
      update: {},
    });
    const tournament = await prisma.tournament.create({
      data: {
        name: "M12 stats",
        entryFeeCents: 5000,
        startTime: new Date(),
        maxPlayers: 2,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        status: "FINISHED",
        prizePoolCents: 0,
        finishedAt: new Date(),
        fillBotsAtStart: true,
      },
    });
    tournamentIds.push(tournament.id);

    await prisma.tournamentRegistration.createMany({
      data: [
        { tournamentId: tournament.id, userId: testUsers.human, finishPlace: 1, isBot: false },
        { tournamentId: tournament.id, userId: botUserId, finishPlace: 2, isBot: true, eliminatedAt: new Date() },
      ],
    });

    await CashierService.processTournamentPayouts({
      tournamentId: tournament.id,
      humanEntrantCount: 1,
    });
    await processTournamentFinishResults(tournament.id);

    const botStats = await prisma.userTournamentStats.findUnique({ where: { userId: botUserId } });
    expect(botStats).toBeNull();

    const humanStats = await prisma.userTournamentStats.findUniqueOrThrow({
      where: { userId: testUsers.human },
    });
    expect(humanStats.tournamentsPlayed).toBe(1);
    expect(humanStats.tournamentWins).toBe(1);
  });

  it("does not pay single-human bot challenges even when the human finishes first", async () => {
    const payouts = computeHumanPayoutAmountsByUserId(8000, 1, [
      { userId: testUsers.human, finishPlace: 1 },
    ]);
    expect(payouts.size).toBe(0);
    expect(payouts.has(getTournamentBotUserId("chaos_carl"))).toBe(false);
  });
});
