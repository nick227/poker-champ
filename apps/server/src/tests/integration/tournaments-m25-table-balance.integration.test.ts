import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { tournamentTableBalancer } from "../../tournaments/tournament-table-balancer.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import type { TableConfig } from "../../lobby/types.js";

// Phase 2 of the MTT proposal (docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md): table
// balancing (move + break) on top of Phase 1's provisioning/routing, plus the multi-table-aware
// winner-detection fix it depends on (a table narrowing to 1 local survivor must never finish the
// tournament while other tables still have live players).

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
  a: `tourney_m25_a_${testRunId}`,
  b: `tourney_m25_b_${testRunId}`,
  c: `tourney_m25_c_${testRunId}`,
  d: `tourney_m25_d_${testRunId}`,
  e: `tourney_m25_e_${testRunId}`,
  f: `tourney_m25_f_${testRunId}`,
};

// processTournament auto-cancels ("low entries") anything under 2 total registrations, so the
// founding pair (both landing on table #1 via the normal seeding path) has to be 2 players, not 1.
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

// Hand-for-hand (MTT proposal Phase 4) activates once tournament-wide remaining registrations
// drop to paidPlaces + HAND_FOR_HAND_BUBBLE_BUFFER (3 + 3 = 6 today), which would otherwise fire
// during these balancing-focused tests given their small live-seated counts. Pad the tournament's
// remaining-registration count with DB-only "phantom" registrants (no live room seat, no
// tournamentTableId) so table-balance math -- which only ever looks at *live* OPEN tables -- is
// unaffected, while the reconciler's tournament-wide remaining count stays comfortably above the
// bubble threshold.
const phantomUserIds: string[] = [];
async function padRemainingRegistrationCount(tournamentId: string, count: number): Promise<void> {
  const prisma = getPrisma();
  for (let i = 0; i < count; i++) {
    const userId = `tourney_m25_phantom_${testRunId}_${phantomUserIds.length}`;
    phantomUserIds.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@tourney.test`,
        passwordHash: "hash",
        displayName: `Phantom ${phantomUserIds.length}`,
        role: "USER",
        bankrollCents: 0,
      },
    });
    await prisma.tournamentRegistration.create({
      data: { tournamentId, userId, isBot: false },
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

describe.skipIf(!hasDatabase)("Tournament M25 — table balancing (MTT Phase 2)", () => {
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
          displayName: `M25 ${key}`,
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
    const allUserIds = [...Object.values(testUsers), ...phantomUserIds];
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  });

  beforeEach(() => {
    pokerRooms.clear();
  });

  // Seeded (disconnected) players auto-fold near-instantly once a hand starts, and any table that
  // reaches >= 2 non-out players auto-deals -- including as an immediate side effect of a
  // balancer move landing a 3rd player on an already-live 2-player table. These tests need
  // controlled, static populations/stacks to assert against, so suspend gameplay transitions on
  // every room as soon as it's seeded (same primitive tournaments-m15-rebuy.integration.test.ts
  // uses to drive bust/rebuy steps deterministically) -- purely a test-harness concern.
  function holdDealerHands(room: PokerRoom): void {
    room.dealerRef.suspendGameplayTransitions("M25_TEST_HOLD");
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
      removePlayerForTableTransfer: (userId) => room.removeTournamentPlayerForTableTransfer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
      onTableBreaking: () => {},
      onHandForHandHold: () => {},
      onHandForHandRelease: () => {},
    });
  }

  it("rebalance moves exactly one player from the fullest table to the emptiest when they differ by more than 1", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M25 rebalance ${nanoid(4)}`,
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

    // Table #1 starts with A + B, seeded by the normal tournament-start path.
    await registerFoundingPlayers(tournament.id, [testUsers.a, testUsers.b]);
    await tournamentDirector.processTournament(tournament.id);
    // Keep remaining registrations comfortably above the hand-for-hand bubble threshold (added
    // after the table is already established, so these never enter the round-robin distribution).
    await padRemainingRegistrationCount(tournament.id, 4);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const roomOne = pokerRooms.get(started.roomId!)!;
    holdDealerHands(roomOne);
    const tableOneId = (
      await prisma.tournamentTable.findFirstOrThrow({ where: { tournamentId: tournament.id, tableNumber: 1 } })
    ).id;

    // Table #2, created empty, exactly like a real >MAX_SEATS_PER_TABLE field would already have.
    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });

    // C also lands on table #1 (pre-assigned there directly, mirroring what
    // distributeRegistrantsAcrossTables would have done for a genuine large field), D lands on
    // table #2 alone. Table #1: 3 players, table #2: 1 player -- gap of 2, over the >1 threshold.
    const resultC = await registerOnTable(tournament.id, testUsers.c, tableOneId);
    expect(resultC.roomId).toBe(started.roomId);

    const resultD = await registerOnTable(tournament.id, testUsers.d, tableTwo.id);
    expect(resultD.roomId).toBeTruthy();
    expect(resultD.roomId).not.toBe(started.roomId);

    const roomTwo = pokerRooms.get(resultD.roomId!)!;
    holdDealerHands(roomTwo);
    expect(roomOne.state.playersById.size).toBe(3);
    expect(roomTwo.state.playersById.size).toBe(1);

    // Trigger the post-hand pass on table #1 (the fullest) -- it should elect itself and move one
    // player over to table #2.
    await reconcileRoom(tournament.id, roomOne);

    expect(roomOne.state.playersById.size).toBe(2);
    expect(roomTwo.state.playersById.size).toBe(2);

    const tableTwoAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: tableTwo.id } });
    expect(tableTwoAfter.status).toBe("OPEN");

    const regsByTable = await prisma.tournamentRegistration.groupBy({
      by: ["tournamentTableId"],
      where: { tournamentId: tournament.id, finishPlace: null, tournamentTableId: { in: [tableOneId, tableTwo.id] } },
      _count: { _all: true },
    });
    const counts = new Map(regsByTable.map((r) => [r.tournamentTableId, r._count._all]));
    expect([...counts.values()].sort()).toEqual([2, 2]);
  });

  it("break closes the least-populated table, redistributes its players, and doesn't lose any stack", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M25 break ${nanoid(4)}`,
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

    // Table #1: E + F (both founding, 2 players). Table #2: D alone.
    await registerFoundingPlayers(tournament.id, [testUsers.e, testUsers.f]);
    await tournamentDirector.processTournament(tournament.id);
    // Keep remaining registrations comfortably above the hand-for-hand bubble threshold (added
    // after the table is already established, so these never enter the round-robin distribution).
    await padRemainingRegistrationCount(tournament.id, 4);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const roomOne = pokerRooms.get(started.roomId!)!;
    holdDealerHands(roomOne);
    const tableOne = await prisma.tournamentTable.findFirstOrThrow({
      where: { tournamentId: tournament.id, tableNumber: 1 },
    });

    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    const resultD = await registerOnTable(tournament.id, testUsers.d, tableTwo.id);

    const roomTwo = pokerRooms.get(resultD.roomId!)!;
    holdDealerHands(roomTwo);
    expect(roomOne.state.playersById.size).toBe(2);
    expect(roomTwo.state.playersById.size).toBe(1);
    const dStackBefore = roomTwo.state.playersById.get(testUsers.d)!.stackCents;

    // Total remaining (3) fits in ceil(3/9)=1 table, well under the 2 currently OPEN -- table #2
    // (fewest populated, 1 player) is the elected target. Trigger its own post-hand pass.
    await reconcileRoom(tournament.id, roomTwo);

    const tableTwoAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: tableTwo.id } });
    expect(tableTwoAfter.status).toBe("CLOSED");
    expect(tableTwoAfter.closedAt).not.toBeNull();
    expect(roomTwo.state.playersById.size).toBe(0);
    expect(roomOne.state.playersById.size).toBe(3);

    const dMoved = roomOne.state.playersById.get(testUsers.d);
    expect(dMoved).toBeDefined();
    expect(dMoved!.stackCents).toBe(dStackBefore); // exact stack carried over, no money lost

    const dReg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.d } },
    });
    expect(dReg.tournamentTableId).toBe(tableOne.id);
  });

  it("a table narrowing to 1 local survivor does not finish the tournament while another table still has players", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M25 no-early-finish ${nanoid(4)}`,
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

    // Table #1: A + B (founding). Table #2: C + D (still very much alive).
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
    expect(roomOne.state.playersById.size).toBe(2);
    expect(roomTwo.state.playersById.size).toBe(2);

    // Bust B at table #1 -- table #1's OWN PokerState now shows exactly 1 survivor with chips
    // (A), which pre-fix would have been read as "the tournament is over."
    const busted = roomOne.state.playersById.get(testUsers.b)!;
    busted.stackCents = 0;
    await reconcileRoom(tournament.id, roomOne);

    const afterFirstBust = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterFirstBust.status).toBe("RUNNING");

    const bReg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.b } },
    });
    expect(bReg.finishPlace).not.toBeNull(); // B is correctly eliminated...
    expect(afterFirstBust.status).toBe("RUNNING"); // ...but the tournament itself is not over.
  });

  it("forceRebalance (admin manual override, MTT Phase 5) moves a player immediately without waiting for a hand to end", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M25 force-rebalance ${nanoid(4)}`,
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

    await registerFoundingPlayers(tournament.id, [testUsers.a, testUsers.b]);
    await tournamentDirector.processTournament(tournament.id);
    await padRemainingRegistrationCount(tournament.id, 4);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const roomOne = pokerRooms.get(started.roomId!)!;
    holdDealerHands(roomOne);
    const tableOneId = (
      await prisma.tournamentTable.findFirstOrThrow({ where: { tournamentId: tournament.id, tableNumber: 1 } })
    ).id;

    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    const resultC = await registerOnTable(tournament.id, testUsers.c, tableOneId);
    expect(resultC.roomId).toBe(started.roomId);
    const resultD = await registerOnTable(tournament.id, testUsers.d, tableTwo.id);
    const roomTwo = pokerRooms.get(resultD.roomId!)!;
    holdDealerHands(roomTwo);

    // Table #1: A, B, C (3). Table #2: D (1). Gap of 2 -- no hand has ended anywhere, so the
    // automatic post-hand trigger would never fire here; forceRebalance acts immediately anyway.
    expect(roomOne.state.playersById.size).toBe(3);
    expect(roomTwo.state.playersById.size).toBe(1);

    const result = await tournamentTableBalancer.forceRebalance(tournament.id);
    expect(result.moved).toBe(true);

    expect(roomOne.state.playersById.size).toBe(2);
    expect(roomTwo.state.playersById.size).toBe(2);

    // Already balanced now -- a second call is a no-op, not a forced move regardless.
    const second = await tournamentTableBalancer.forceRebalance(tournament.id);
    expect(second).toEqual({ moved: false, reason: "already_balanced" });
    expect(roomOne.state.playersById.size).toBe(2);
    expect(roomTwo.state.playersById.size).toBe(2);
  });
});
