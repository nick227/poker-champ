import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { fillTournamentBotRegistrations } from "../../tournaments/tournament-bot-fill.js";
import { loadTournamentStandings } from "../../tournaments/tournament-standings.js";
import { isTournamentBotUserId, TOURNAMENT_BOT_USER_ID_PREFIX } from "../../tournaments/tournament-bot-users.js";
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
  human: `tourney_m11_human_${testRunId}`,
};

describe("Tournament M11 bot-filled QA tournaments", () => {
  const tournamentIds: string[] = [];

  async function cleanupBotUsers(prisma: ReturnType<typeof getPrisma>) {
    const botUserFilter = { startsWith: TOURNAMENT_BOT_USER_ID_PREFIX };
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: botUserFilter } });
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
        displayName: "M11 Human",
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
    await prisma.balanceTransaction.deleteMany({ where: { userId: testUsers.human } });
    await prisma.playerBalance.deleteMany({ where: { userId: testUsers.human } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: testUsers.human } });
    await prisma.user.deleteMany({ where: { id: testUsers.human } });
    await cleanupBotUsers(prisma);
    pokerRooms.clear();
  });

  beforeEach(async () => {
    pokerRooms.clear();
    await getPrisma().user.update({
      where: { id: testUsers.human },
      data: { bankrollCents: 100_000 },
    });
  });

  async function createBotFillTournament(maxPlayers = 3, fillBotCount: number | null = 2) {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M11 ${nanoid(4)}`,
        entryFeeCents: 4000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.human,
      tournamentId: tournament.id,
      entryFeeCents: 4000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.human),
    });

    return tournament.id;
  }

  it("fills bot registrations at start without changing prize pool or human bankroll", async () => {
    const prisma = getPrisma();
    const tournamentId = await createBotFillTournament(4, 3);
    const humanBefore = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.human } });

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "STARTING" },
    });
    const added = await fillTournamentBotRegistrations(tournamentId);
    expect(added).toBe(3);

    const secondFill = await fillTournamentBotRegistrations(tournamentId);
    expect(secondFill).toBe(0);

    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(tournament.prizePoolCents).toBe(4000);

    const regs = await prisma.tournamentRegistration.findMany({ where: { tournamentId } });
    expect(regs.filter((reg) => reg.isBot)).toHaveLength(3);
    expect(regs.filter((reg) => !reg.isBot)).toHaveLength(1);

    const humanAfter = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.human } });
    expect(humanAfter.bankrollCents).toBe(humanBefore.bankrollCents);

    const botEntryTxs = await prisma.balanceTransaction.count({
      where: { tournamentId, type: "TOURNAMENT_ENTRY", userId: { startsWith: TOURNAMENT_BOT_USER_ID_PREFIX } },
    });
    expect(botEntryTxs).toBe(0);
  });

  it("seats humans and bots when director starts tournament", async () => {
    const prisma = getPrisma();
    const tournamentId = await createBotFillTournament(3, 2);
    await tournamentDirector.processTournament(tournamentId);

    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(tournament.status).toBe("RUNNING");

    const room = pokerRooms.get(tournament.roomId!)!;
    const seatedIds = [...room.state.playersById.keys()];
    expect(seatedIds).toContain(testUsers.human);
    expect(seatedIds.filter((id) => isTournamentBotUserId(id))).toHaveLength(2);

    for (const player of room.state.playersById.values()) {
      expect(player.stackCents).toBe(8000);
    }
  });

  it("marks bots in standings and pays only eligible humans", async () => {
    const prisma = getPrisma();
    const tournamentId = await createBotFillTournament(2, 1);
    await tournamentDirector.processTournament(tournamentId);

    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    const room = pokerRooms.get(tournament.roomId!)!;
    const botUserId = [...room.state.playersById.keys()].find((id) => isTournamentBotUserId(id))!;

    room.state.street = "WAITING";
    room.state.playersById.get(botUserId)!.stackCents = 0;

    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId,
      tableId: tournament.tableId!,
      roomId: tournament.roomId!,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
    });

    room.state.street = "WAITING";
    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId,
      tableId: tournament.tableId!,
      roomId: tournament.roomId!,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
    });

    const finished = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.prizePoolCents).toBe(0);

    const standings = await loadTournamentStandings(tournamentId);
    const botRow = standings.find((row) => row.isBot);
    const humanRow = standings.find((row) => row.userId === testUsers.human);
    expect(botRow?.isBot).toBe(true);
    expect(humanRow?.finishPlace).toBe(1);
    expect(humanRow?.payoutCents).toBe(0);
    expect(botRow?.payoutCents).toBe(0);

    const humanPayout = await prisma.balanceTransaction.findUnique({
      where: { externalRef: tournamentPayoutExternalRef(tournamentId, 1, testUsers.human) },
    });
    expect(humanPayout).toBeNull();

    const botPayoutCount = await prisma.balanceTransaction.count({
      where: {
        tournamentId,
        type: "TOURNAMENT_PAYOUT",
        userId: { startsWith: TOURNAMENT_BOT_USER_ID_PREFIX },
      },
    });
    expect(botPayoutCount).toBe(0);
  }, 15_000);
});
