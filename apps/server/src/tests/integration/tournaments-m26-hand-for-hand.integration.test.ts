import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import type { TableConfig } from "../../lobby/types.js";

// Phase 4 of the MTT proposal (docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md): hand-for-hand
// near the money bubble. Every live table holds after its current hand once the tournament-wide
// remaining-registration count is close enough to the paid places; balancing is suppressed while
// held; all tables release together once every one of them has reported ready.

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
        [...pokerRooms.entries()].map(([roomId]) => ({
          roomId,
          name: "poker",
          clients: 0,
          maxClients: 9,
          metadata: {},
        })),
      ),
    },
  };
});

const testRunId = nanoid(6);
const testUsers = {
  a: `tourney_m26_a_${testRunId}`,
  b: `tourney_m26_b_${testRunId}`,
  c: `tourney_m26_c_${testRunId}`,
  d: `tourney_m26_d_${testRunId}`,
  e: `tourney_m26_e_${testRunId}`,
};

async function registerFoundingPlayers(tournamentId: string, userIds: [string, string]) {
  for (const userId of userIds) {
    await CashierService.processTournamentRegister({
      userId,
      tournamentId,
      entryFeeCents: 0,
      externalRef: tournamentEntryExternalRef(tournamentId, userId),
    });
  }
}

async function registerOnTable(tournamentId: string, userId: string, tournamentTableId: string) {
  await CashierService.processTournamentRegister({
    userId,
    tournamentId,
    entryFeeCents: 0,
    externalRef: tournamentEntryExternalRef(tournamentId, userId),
  });
  await getPrisma().tournamentRegistration.update({
    where: { tournamentId_userId: { tournamentId, userId } },
    data: { tournamentTableId },
  });
  return tournamentDirector.ensureTournamentTableForJoinDetailed(tournamentId, userId);
}

describe.skipIf(!hasDatabase)("Tournament M26 — hand-for-hand (MTT Phase 4)", () => {
  const tournamentIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    for (const [key, userId] of Object.entries(testUsers)) {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@tourney.test`,
          passwordHash: "hash",
          displayName: `M26 ${key}`,
          role: "USER",
          bankrollCents: 100_000,
        },
      });
    }
  });

  afterAll(async () => {
    const prisma = getPrisma();
    for (const id of tournamentIds) {
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentTable.deleteMany({ where: { tournamentId: id } });
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    const allUserIds = Object.values(testUsers);
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  });

  beforeEach(() => {
    pokerRooms.clear();
  });

  function holdDealerHands(room: PokerRoom): void {
    room.dealerRef.suspendGameplayTransitions("M26_TEST_HOLD");
    room.state.nextHandAtTs = Date.now() + 60 * 60 * 1000;
  }

  async function reconcileRoom(tournamentId: string, room: PokerRoom) {
    room.state.street = "WAITING";
    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId,
      tableId: room.state.tableId,
      roomId: room.roomId,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      removePlayerForTableTransfer: (userId, destinationTableNumber) =>
        room.removeTournamentPlayerForTableTransfer(userId, destinationTableNumber),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
      onTableBreaking: () => {},
      // Mirror PokerRoom's real wiring (onTournamentWaitingAfterHand) so tests can assert on the
      // room-level hold flag, instead of the no-op the other reconciler test files use.
      onHandForHandHold: () => {
        (room as unknown as { tournamentHandForHandWaiting: boolean }).tournamentHandForHandWaiting = true;
      },
      onHandForHandRelease: () => {
        (room as unknown as { tournamentHandForHandWaiting: boolean }).tournamentHandForHandWaiting = false;
      },
    });
  }

  it("activates near the bubble, holds the triggering table, and suppresses balancing despite a large population gap", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M26 activate ${nanoid(4)}`,
        entryFeeCents: 0,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

    // Table #1: A, B (founding) + C, D (4 players). Table #2: E alone. Gap of 3 -- well over the
    // >1 rebalance threshold -- so this proves hand-for-hand suppresses balancing, not just that
    // balancing never happened to trigger. Total remaining = 5, humanEntrantCount = 5 -> paidPlaces
    // (current top-3 cap) = 3, HAND_FOR_HAND_BUBBLE_BUFFER = 3 -> threshold 6. 5 <= 6: activates.
    await registerFoundingPlayers(tournament.id, [testUsers.a, testUsers.b]);
    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const roomOne = pokerRooms.get(started.roomId!)!;
    holdDealerHands(roomOne);
    const tableOneId = (
      await prisma.tournamentTable.findFirstOrThrow({ where: { tournamentId: tournament.id, tableNumber: 1 } })
    ).id;

    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });

    for (const userId of [testUsers.c, testUsers.d]) {
      const result = await registerOnTable(tournament.id, userId, tableOneId);
      expect(result.roomId).toBe(started.roomId);
    }
    const resultE = await registerOnTable(tournament.id, testUsers.e, tableTwo.id);
    const roomTwo = pokerRooms.get(resultE.roomId!)!;
    holdDealerHands(roomTwo);

    expect(roomOne.state.playersById.size).toBe(4);
    expect(roomTwo.state.playersById.size).toBe(1);

    await reconcileRoom(tournament.id, roomOne);

    const tournamentAfter = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(tournamentAfter.handForHandActive).toBe(true);

    const tableOneAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: tableOneId } });
    expect(tableOneAfter.handForHandReady).toBe(true);
    const tableTwoAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: tableTwo.id } });
    expect(tableTwoAfter.handForHandReady).toBe(false); // table #2 hasn't reported yet -- no release

    // Balancing suppressed: despite a 4-vs-1 gap, nobody moved.
    expect(roomOne.state.playersById.size).toBe(4);
    expect(roomTwo.state.playersById.size).toBe(1);
  });

  it("releases every table together once all live tables have reported ready", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M26 release ${nanoid(4)}`,
        entryFeeCents: 0,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

    // Table #1: A, B. Table #2: C, D. Total remaining = 4, well within the bubble threshold for
    // this small a field (paidPlaces=3 + buffer=3 = 6).
    await registerFoundingPlayers(tournament.id, [testUsers.a, testUsers.b]);
    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const roomOne = pokerRooms.get(started.roomId!)!;
    holdDealerHands(roomOne);

    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    let roomTwoId: string | null = null;
    for (const userId of [testUsers.c, testUsers.d]) {
      const result = await registerOnTable(tournament.id, userId, tableTwo.id);
      roomTwoId = result.roomId!;
    }
    const roomTwo = pokerRooms.get(roomTwoId!)!;
    holdDealerHands(roomTwo);

    // Table #1's hand ends first -- activates and holds, table #2 not ready yet.
    await reconcileRoom(tournament.id, roomOne);
    let tournamentMid = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(tournamentMid.handForHandActive).toBe(true);
    expect((roomOne as unknown as { tournamentHandForHandWaiting: boolean }).tournamentHandForHandWaiting).toBe(true);

    // Table #2's hand ends next -- now every live table has reported ready, so this same pass
    // releases everyone (including table #1, via the mocked remoteRoomCall -> releaseHandForHandHold).
    await reconcileRoom(tournament.id, roomTwo);

    const tournamentAfter = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(tournamentAfter.handForHandActive).toBe(false);

    const tablesAfter = await prisma.tournamentTable.findMany({ where: { tournamentId: tournament.id } });
    expect(tablesAfter.every((t) => t.handForHandReady === false)).toBe(true);

    expect((roomOne as unknown as { tournamentHandForHandWaiting: boolean }).tournamentHandForHandWaiting).toBe(false);
    expect((roomTwo as unknown as { tournamentHandForHandWaiting: boolean }).tournamentHandForHandWaiting).toBe(false);
  });
});
