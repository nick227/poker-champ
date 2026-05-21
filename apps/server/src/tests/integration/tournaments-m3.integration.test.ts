import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { loadTournamentStandings } from "../../tournaments/tournament-standings.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import { tournamentPayoutExternalRef } from "../../tournaments/tournament-payouts.js";
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
  playerA: `tourney_m3_a_${testRunId}`,
  playerB: `tourney_m3_b_${testRunId}`,
};

async function createRunningTournamentRoom() {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.create({
    data: {
      name: `M3 ${nanoid(4)}`,
      entryFeeCents: 5000,
      startTime: new Date(Date.now() - 120_000),
      maxPlayers: 2,
      startingStackCents: 8000,
      blindStructureId: "standard_8min",
      status: "REGISTERING",
    },
  });

  await CashierService.processTournamentRegister({
    userId: testUsers.playerA,
    tournamentId: tournament.id,
    entryFeeCents: 5000,
    externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerA),
  });
  await CashierService.processTournamentRegister({
    userId: testUsers.playerB,
    tournamentId: tournament.id,
    entryFeeCents: 5000,
    externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerB),
  });

  await tournamentDirector.processTournament(tournament.id);

  const updated = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
  const roomId = updated.roomId!;
  const room = pokerRooms.get(roomId)!;

  return { tournament: updated, room, tableId: updated.tableId!, roomId };
}

describe("Tournament M3 finish, blinds, payouts", () => {
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

  beforeEach(async () => {
    pokerRooms.clear();
    await getPrisma().user.updateMany({
      where: { id: { in: Object.values(testUsers) } },
      data: { bankrollCents: 100_000 },
    });
  });

  it("advances blind level between hands only", async () => {
    const { tournament, room, roomId } = await createRunningTournamentRoom();
    tournamentIds.push(tournament.id);

    await getPrisma().tournament.update({
      where: { id: tournament.id },
      data: { nextLevelAt: new Date(Date.now() - 1000) },
    });

    room.state.street = "WAITING";
    await tournamentDirector.advanceBlindLevel(tournament.id);

    const updated = await getPrisma().tournament.findUnique({ where: { id: tournament.id } });
    expect(updated?.currentLevel).toBe(2);
    expect(room.state.smallBlindCents).toBe(50);
    expect(room.state.bigBlindCents).toBe(100);

    room.state.street = "PREFLOP";
    const midAdvance = await room.applyTournamentBlinds({
      currentLevel: 3,
      smallBlindCents: 75,
      bigBlindCents: 150,
      anteCents: 0,
      nextLevelAtTs: Date.now() + 60_000,
      status: "RUNNING",
    });
    expect(midAdvance.applied).toBe(false);
    expect(room.state.smallBlindCents).toBe(50);

    expect(pokerRooms.get(roomId)).toBeDefined();
  });

  it("eliminates busted player and finishes with payouts", async () => {
    const { tournament, room, tableId } = await createRunningTournamentRoom();
    tournamentIds.push(tournament.id);

    room.state.street = "WAITING";
    const busted = room.state.playersById.get(testUsers.playerB);
    expect(busted).toBeDefined();
    busted!.stackCents = 0;

    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId: tournament.id,
      tableId,
      roomId: room.roomId,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
    });

    const prisma = getPrisma();
    for (let attempt = 0; attempt < 20; attempt++) {
      const pending = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      if (pending?.status === "FINISHED") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const finished = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    expect(finished?.status).toBe("FINISHED");
    expect(finished?.prizePoolCents).toBe(0);

    const regs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id },
    });
    const placeByUser = new Map(regs.map((r) => [r.userId, r.finishPlace]));
    expect(placeByUser.get(testUsers.playerA)).toBe(1);
    expect(placeByUser.get(testUsers.playerB)).toBe(2);

    const winner = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    expect(winner?.bankrollCents).toBe(105_000);
  });

  it("payout processing is idempotent", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: "Payout Idempotent",
        entryFeeCents: 1000,
        startTime: new Date(),
        maxPlayers: 2,
        startingStackCents: 5000,
        blindStructureId: "standard_8min",
        status: "FINISHED",
        prizePoolCents: 10_000,
        finishedAt: new Date(),
      },
    });
    tournamentIds.push(tournament.id);

    await prisma.tournamentRegistration.createMany({
      data: [
        { tournamentId: tournament.id, userId: testUsers.playerA, finishPlace: 1 },
        { tournamentId: tournament.id, userId: testUsers.playerB, finishPlace: 2, eliminatedAt: new Date() },
      ],
    });

    const first = await CashierService.processTournamentPayouts({
      tournamentId: tournament.id,
      entrantCount: 2,
    });
    const second = await CashierService.processTournamentPayouts({
      tournamentId: tournament.id,
      entrantCount: 2,
    });

    expect(first.paidCount).toBe(1);
    expect(second.paidCount).toBe(1);

    const winner = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    expect(winner?.bankrollCents).toBe(110_000);

    const payoutTxCount = await prisma.balanceTransaction.count({
      where: {
        tournamentId: tournament.id,
        type: "TOURNAMENT_PAYOUT",
        userId: testUsers.playerA,
      },
    });
    expect(payoutTxCount).toBe(1);
    expect(
      await prisma.balanceTransaction.findUnique({
        where: {
          externalRef: tournamentPayoutExternalRef(tournament.id, 1, testUsers.playerA),
        },
      }),
    ).toBeTruthy();
  });

  it("returns standings with payout cents", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: "Standings",
        entryFeeCents: 1000,
        startTime: new Date(),
        maxPlayers: 3,
        startingStackCents: 5000,
        blindStructureId: "standard_8min",
        status: "FINISHED",
        prizePoolCents: 0,
        finishedAt: new Date(),
      },
    });
    tournamentIds.push(tournament.id);

    await prisma.tournamentRegistration.createMany({
      data: [
        { tournamentId: tournament.id, userId: testUsers.playerA, finishPlace: 1 },
        { tournamentId: tournament.id, userId: testUsers.playerB, finishPlace: 2, eliminatedAt: new Date() },
      ],
    });

    await prisma.balanceTransaction.create({
      data: {
        id: nanoid(),
        userId: testUsers.playerA,
        tournamentId: tournament.id,
        type: "TOURNAMENT_PAYOUT",
        amountCents: 7000,
        externalRef: tournamentPayoutExternalRef(tournament.id, 1, testUsers.playerA),
      },
    });

    const standings = await loadTournamentStandings(tournament.id);
    expect(standings).toHaveLength(2);
    expect(standings[0]?.finishPlace).toBe(1);
    expect(standings[0]?.payoutCents).toBe(7000);
    expect(standings[1]?.finishPlace).toBe(2);
    expect(standings[1]?.payoutCents).toBe(0);
  });
});
