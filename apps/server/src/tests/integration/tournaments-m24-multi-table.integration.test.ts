import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentEntryExternalRef, MAX_SEATS_PER_TABLE } from "../../tournaments/tournament.constants.js";
import type { TableConfig } from "../../lobby/types.js";

// Phase 1 of the MTT proposal (docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md): schema +
// ensureTournamentTableForJoinDetailed per-user routing + initial multi-table provisioning at
// STARTING. These tests cover the three things that proposal's Phase 1 sequencing step asks for:
//   1. Provisioning creates the right number of TournamentTable rows and distributes registrants.
//   2. Per-user routing sends two different users on a 2-table tournament to their assigned
//      (possibly different) tables, stably across repeated calls.
//   3. A single-table (N=1) tournament's join/rejoin behavior is byte-for-byte unchanged.

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
  humanA: `tourney_m24_a_${testRunId}`,
  humanB: `tourney_m24_b_${testRunId}`,
  single: `tourney_m24_single_${testRunId}`,
  humanC: `tourney_m24_c_${testRunId}`,
  humanD: `tourney_m24_d_${testRunId}`,
  humanE: `tourney_m24_e_${testRunId}`,
};

describe.skipIf(!hasDatabase)("Tournament M24 — multi-table (MTT) Phase 1: provisioning + per-user routing", () => {
  const tournamentIds: string[] = [];
  const bulkUserIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    for (const [key, userId] of Object.entries(testUsers)) {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@tourney.test`,
          passwordHash: "hash",
          displayName: `M24 ${key}`,
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
    const allUserIds = [...Object.values(testUsers), ...bulkUserIds];
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  });

  beforeEach(() => {
    pokerRooms.clear();
  });

  it("provisionTournamentTables creates ceil(N/MAX_SEATS_PER_TABLE) tables and distributes registrants evenly", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 provisioning ${nanoid(4)}`,
        entryFeeCents: 0,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 27,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 0,
        status: "STARTING",
      },
    });
    tournamentIds.push(tournament.id);

    const registrantCount = 20;
    const registrantUserIds: string[] = [];
    for (let i = 0; i < registrantCount; i++) {
      const userId = `tourney_m24_bulk_${testRunId}_${i}`;
      bulkUserIds.push(userId);
      registrantUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@tourney.test`,
          passwordHash: "hash",
          displayName: `Bulk ${i}`,
          role: "USER",
          bankrollCents: 0,
        },
      });
      await prisma.tournamentRegistration.create({
        data: { tournamentId: tournament.id, userId, isBot: false },
      });
    }

    // Exercise the same private assignment step startTournamentWithTable runs at STARTING, before
    // the primary room exists (no need to actually seat 20 players into one live Colyseus room --
    // that eager single-room seed is existing, unchanged behavior, now filtered down to just the
    // registrants assigned to table #1; this test is about the NEW per-table bookkeeping that
    // filter depends on).
    const assignment = await (tournamentDirector as unknown as {
      assignTournamentTables: (
        tournamentId: string,
        registrantUserIds: string[],
      ) => Promise<{ primaryTableId: string; primaryUserIds: Set<string> }>;
    }).assignTournamentTables(tournament.id, registrantUserIds);

    const expectedTableCount = Math.ceil(registrantCount / MAX_SEATS_PER_TABLE);
    expect(expectedTableCount).toBe(3);

    const tables = await prisma.tournamentTable.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { tableNumber: "asc" },
    });
    expect(tables).toHaveLength(expectedTableCount);
    expect(tables.map((t) => t.tableNumber)).toEqual([1, 2, 3]);
    expect(tables.every((t) => t.status === "OPEN")).toBe(true);

    // Nothing is provisioned (live room-wise) yet -- assignment runs before room creation.
    expect(tables.every((t) => t.tableId === null && t.roomId === null)).toBe(true);
    expect(assignment.primaryTableId).toBe(tables[0]!.id);

    const regs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id },
      select: { tournamentTableId: true },
    });
    expect(regs.every((r) => r.tournamentTableId != null)).toBe(true);

    const countsByTable = new Map<string, number>();
    for (const reg of regs) {
      countsByTable.set(reg.tournamentTableId!, (countsByTable.get(reg.tournamentTableId!) ?? 0) + 1);
    }
    const counts = tables.map((t) => countsByTable.get(t.id) ?? 0);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(registrantCount);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // Deterministic round-robin over a controlled, ordered input: 20 registrants / 3 tables = 7,7,6.
    expect(counts).toEqual([7, 7, 6]);
    // primaryUserIds (table #1's assignment) matches what would actually get seated eagerly.
    expect(assignment.primaryUserIds.size).toBe(7);

    // Finalizing mirrors the (now-created) primary room's ids onto table #1's row -- verifying
    // the second half of the provisioning contract startTournamentWithTable relies on.
    await (tournamentDirector as unknown as {
      finalizePrimaryTournamentTable: (primaryTableRowId: string, primaryTableId: string, primaryRoomId: string) => Promise<void>;
    }).finalizePrimaryTournamentTable(assignment.primaryTableId, "table_primary_fake", "room_primary_fake");
    const primaryAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: assignment.primaryTableId } });
    expect(primaryAfter.tableId).toBe("table_primary_fake");
    expect(primaryAfter.roomId).toBe("room_primary_fake");
  });

  it("per-user routing sends two users on a 2-table tournament to their assigned tables, stably across repeated calls", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 routing ${nanoid(4)}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.humanA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanA),
    });

    // Starts the tournament with a single registrant: provisions exactly one table (table #1,
    // 1 registrant / MAX_SEATS_PER_TABLE = 1 table) and eagerly seats humanA into its room --
    // exactly today's single-table behavior.
    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(started.status).toBe("RUNNING");
    expect(started.roomId).toBeTruthy();

    // Add table #2 (an OPEN, not-yet-provisioned table -- the state a genuine >MAX_SEATS_PER_TABLE
    // field would already be in from assignTournamentTables) and then register humanB as a
    // genuine late registrant, arriving after the tournament has already started. humanB was
    // never part of the original provisioning pass, so their tournamentTableId is unset -- this
    // is the real "unset" branch of resolveActiveTournamentTableForUser, not a synthetic
    // reassignment, so there is no risk of double-seating: humanB has never been seated anywhere
    // before their first ensure-table call.
    await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    await CashierService.processTournamentRegister({
      userId: testUsers.humanB,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanB),
    });

    const resultA1 = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanA);
    expect(resultA1.joinStatus).toBe("READY");
    expect(resultA1.roomId).toBe(started.roomId);
    expect(resultA1.tableId).toBe(started.tableId);

    const resultB1 = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanB);
    // humanB's table (table #2) had never been provisioned with a room before -- routed there and
    // provisioned fresh, exactly the "unset -> fewest-seated OPEN table" branch of
    // resolveActiveTournamentTableForUser (table #2 has 0 registrants vs table #1's 1).
    expect(resultB1.joinStatus).toBe("CREATING_TABLE");
    expect(resultB1.roomId).toBeTruthy();
    expect(resultB1.tableId).toBeTruthy();

    // The two users landed on genuinely different rooms/tables.
    expect(resultB1.roomId).not.toBe(resultA1.roomId);
    expect(resultB1.tableId).not.toBe(resultA1.tableId);

    const tableTwoAfter = await prisma.tournamentTable.findFirstOrThrow({
      where: { tournamentId: tournament.id, tableNumber: 2 },
    });
    expect(tableTwoAfter.roomId).toBe(resultB1.roomId);
    expect(tableTwoAfter.tableId).toBe(resultB1.tableId);
    expect(pokerRooms.size).toBe(2);

    const humanBReg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.humanB } },
    });
    expect(humanBReg.tournamentTableId).toBe(tableTwoAfter.id);

    // Stable across repeated calls (reconnect): both users land on the exact same room again.
    const resultA2 = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanA);
    expect(resultA2.joinStatus).toBe("READY");
    expect(resultA2.roomId).toBe(resultA1.roomId);

    const resultB2 = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanB);
    expect(resultB2.joinStatus).toBe("READY");
    expect(resultB2.roomId).toBe(resultB1.roomId);
    expect(resultB2.tableId).toBe(resultB1.tableId);

    const roomA = pokerRooms.get(resultA1.roomId!)!;
    const roomB = pokerRooms.get(resultB1.roomId!)!;
    expect(roomA.state.playersById.has(testUsers.humanA)).toBe(true);
    expect(roomB.state.playersById.has(testUsers.humanB)).toBe(true);
    expect(roomA.state.playersById.has(testUsers.humanB)).toBe(false);
    expect(roomB.state.playersById.has(testUsers.humanA)).toBe(false);
  });

  it("single-table (N=1) tournament join/rejoin is unchanged: exactly one mirrored TournamentTable row", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 single-table ${nanoid(4)}`,
        entryFeeCents: 1000,
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
      userId: testUsers.single,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.single),
    });

    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(started.status).toBe("RUNNING");
    expect(started.roomId).toBeTruthy();
    expect(started.tableId).toBeTruthy();

    const tables = await prisma.tournamentTable.findMany({ where: { tournamentId: tournament.id } });
    expect(tables).toHaveLength(1);
    expect(tables[0]!.tableNumber).toBe(1);
    expect(tables[0]!.tableId).toBe(started.tableId);
    expect(tables[0]!.roomId).toBe(started.roomId);
    expect(tables[0]!.status).toBe("OPEN");

    const reg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.single } },
    });
    expect(reg.tournamentTableId).toBe(tables[0]!.id);

    // Ensure-table / reconnect: exactly today's single-table behavior -- READY, same room, and no
    // second TournamentTable row appears.
    const result1 = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.single);
    expect(result1.joinStatus).toBe("READY");
    expect(result1.roomId).toBe(started.roomId);
    expect(result1.tableId).toBe(started.tableId);

    const result2 = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.single);
    expect(result2.joinStatus).toBe("READY");
    expect(result2.roomId).toBe(started.roomId);

    const tablesAfter = await prisma.tournamentTable.findMany({ where: { tournamentId: tournament.id } });
    expect(tablesAfter).toHaveLength(1);
  });

  it("seatRegistrantOnAssignedTable (the /register path) lands a late registrant on the emptier of two tables", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 register-routing ${nanoid(4)}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.humanA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanA),
    });
    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(started.status).toBe("RUNNING");

    // A second, still-empty table -- what a genuine >MAX_SEATS_PER_TABLE field would already have
    // from assignTournamentTables. humanA + bot are both on table #1 (2 registrants), table #2 has 0.
    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });

    // Mirrors exactly what the /register route now does: register, then
    // tryStartTournamentTable + seatRegistrantOnAssignedTable (table-aware, replacing the old
    // always-primary seatLateRegistrant call).
    await CashierService.processTournamentRegister({
      userId: testUsers.humanB,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanB),
    });
    await tournamentDirector.tryStartTournamentTable(tournament.id);
    await tournamentDirector.seatRegistrantOnAssignedTable(tournament.id, testUsers.humanB);

    const humanBReg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.humanB } },
    });
    expect(humanBReg.tournamentTableId).toBe(tableTwo.id);

    const tableTwoAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: tableTwo.id } });
    expect(tableTwoAfter.roomId).toBeTruthy();
    expect(tableTwoAfter.roomId).not.toBe(started.roomId);

    const roomA = pokerRooms.get(started.roomId!)!;
    const roomB = pokerRooms.get(tableTwoAfter.roomId!)!;
    expect(roomA.state.playersById.has(testUsers.humanB)).toBe(false);
    expect(roomB.state.playersById.has(testUsers.humanB)).toBe(true);
    expect(roomB.state.playersById.has(testUsers.humanA)).toBe(false);
  });

  it("resumeDeadTournamentRooms reconciles a dead secondary table independently, reseeding it, without disturbing a healthy primary table", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 resume-secondary ${nanoid(4)}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.humanA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanA),
    });
    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });

    await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    await CashierService.processTournamentRegister({
      userId: testUsers.humanB,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanB),
    });
    const routedB = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanB);
    expect(routedB.joinStatus).toBe("CREATING_TABLE");
    const originalSecondaryRoomId = routedB.roomId!;
    expect(pokerRooms.size).toBe(2);

    // Simulate the secondary table's room process dying (e.g. server restart) while the primary
    // table's room stays healthy -- exactly the scenario reconcileOrphanRunningTournaments already
    // handles per-table; this exercises the equivalent *resume* path.
    pokerRooms.delete(originalSecondaryRoomId);
    expect(pokerRooms.has(started.roomId!)).toBe(true);

    await tournamentDirector.resumeDeadTournamentRooms();

    const primaryAfter = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(primaryAfter.roomId).toBe(started.roomId);
    expect(pokerRooms.has(started.roomId!)).toBe(true);
    expect(pokerRooms.get(started.roomId!)!.state.playersById.has(testUsers.humanA)).toBe(true);

    const secondaryAfter = await prisma.tournamentTable.findFirstOrThrow({
      where: { tournamentId: tournament.id, tableNumber: 2 },
    });
    expect(secondaryAfter.roomId).toBeTruthy();
    expect(secondaryAfter.roomId).not.toBe(originalSecondaryRoomId);
    expect(secondaryAfter.status).toBe("OPEN");

    const resumedRoom = pokerRooms.get(secondaryAfter.roomId!)!;
    expect(resumedRoom.state.playersById.has(testUsers.humanB)).toBe(true);
  });

  // --- Concurrency regressions (adversarial review findings) -------------------------------
  // Both races below are fired via genuinely-concurrent Promise.all (not sequential awaits) so
  // the two call stacks actually interleave at real DB round-trips, not just logically overlap.

  it("Finding 1: racing claimTournamentTableAssignment calls for the same never-assigned registrant converge on one winner (CAS)", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 race-assign ${nanoid(4)}`,
        entryFeeCents: 0,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "RUNNING",
      },
    });
    tournamentIds.push(tournament.id);

    const [tableOne, tableTwo] = await Promise.all([
      prisma.tournamentTable.create({ data: { tournamentId: tournament.id, tableNumber: 1, status: "OPEN" } }),
      prisma.tournamentTable.create({ data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" } }),
    ]);
    await prisma.tournamentRegistration.create({
      data: { tournamentId: tournament.id, userId: testUsers.humanC, isBot: false },
    });

    // Two racing callers that (as a race would produce) independently computed *different*
    // "fewest seated" picks for the same never-before-assigned registrant. Both attempt the CAS
    // concurrently, guarded on the same observed currentTournamentTableId (null).
    const claim = (tournamentDirector as unknown as {
      claimTournamentTableAssignment: (
        tournamentId: string,
        userId: string,
        currentTournamentTableId: string | null,
        chosen: { id: string; tableNumber: number },
      ) => Promise<{ id: string; tableNumber: number }>;
    }).claimTournamentTableAssignment.bind(tournamentDirector);

    const [resultA, resultB] = await Promise.all([
      claim(tournament.id, testUsers.humanC, null, tableOne),
      claim(tournament.id, testUsers.humanC, null, tableTwo),
    ]);

    // Both callers must agree on the exact same winning table -- never two different answers.
    expect(resultA.id).toBe(resultB.id);
    expect([tableOne.id, tableTwo.id]).toContain(resultA.id);

    const reg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.humanC } },
    });
    expect(reg.tournamentTableId).toBe(resultA.id);
  });

  it("Finding 1 end-to-end: /register and /ensure-table racing for the same late registrant seat them exactly once", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 race-register-ensure ${nanoid(4)}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.humanA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanA),
    });
    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });

    await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    await CashierService.processTournamentRegister({
      userId: testUsers.humanD,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanD),
    });

    // Genuinely concurrent: the /register route's table-aware seat call and an /ensure-table call
    // for the very same never-before-assigned late registrant, at the same instant. This exercises
    // both the tournamentTableId assignment CAS (Finding 1) and the secondary-table room
    // provisioning CAS (Finding 2), since both paths also race to provision table #2's room.
    const [, ensureResult] = await Promise.all([
      tournamentDirector.seatRegistrantOnAssignedTable(tournament.id, testUsers.humanD),
      tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanD),
    ]);

    const reg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.humanD } },
    });
    expect(reg.tournamentTableId).toBeTruthy();

    const tableTwo = await prisma.tournamentTable.findFirstOrThrow({
      where: { tournamentId: tournament.id, tableNumber: 2 },
    });
    // Exactly one room was ever provisioned for table #2 -- not two.
    expect(tableTwo.roomId).toBeTruthy();
    expect(ensureResult.roomId).toBe(tableTwo.roomId);

    // humanD is seated in exactly the one room that won, never both the primary and a secondary
    // room simultaneously.
    const primaryRoom = pokerRooms.get(started.roomId!)!;
    const secondaryRoom = pokerRooms.get(tableTwo.roomId!)!;
    expect(primaryRoom.state.playersById.has(testUsers.humanD)).toBe(false);
    expect(secondaryRoom.state.playersById.has(testUsers.humanD)).toBe(true);
  });

  it("Finding 2: two users assigned to the same never-provisioned secondary table racing /ensure-table share exactly one provisioned room", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 race-provision ${nanoid(4)}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.humanA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanA),
    });
    await tournamentDirector.processTournament(tournament.id);

    // Both humanC and humanE are pre-assigned to table #2, which has never been provisioned --
    // exactly the "two different users assigned to the same not-yet-provisioned table both
    // hitting /ensure-table right at tournament start" scenario from the finding.
    const tableTwo = await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    for (const userId of [testUsers.humanC, testUsers.humanE]) {
      await CashierService.processTournamentRegister({
        userId,
        tournamentId: tournament.id,
        entryFeeCents: 1000,
        externalRef: tournamentEntryExternalRef(tournament.id, userId),
      });
      await prisma.tournamentRegistration.update({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
        data: { tournamentTableId: tableTwo.id },
      });
    }

    const [resultC, resultE] = await Promise.all([
      tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanC),
      tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanE),
    ]);

    // Both callers land on the exact same room -- only one matchMaker.createRoom call ever won.
    expect(resultC.roomId).toBeTruthy();
    expect(resultC.roomId).toBe(resultE.roomId);
    expect(resultC.tableId).toBe(resultE.tableId);

    const tableTwoAfter = await prisma.tournamentTable.findUniqueOrThrow({ where: { id: tableTwo.id } });
    expect(tableTwoAfter.roomId).toBe(resultC.roomId);
    expect(tableTwoAfter.status).toBe("OPEN");

    const room = pokerRooms.get(resultC.roomId!)!;
    expect(room.state.playersById.has(testUsers.humanC)).toBe(true);
    expect(room.state.playersById.has(testUsers.humanE)).toBe(true);
  });

  it("Finding 2: the resumeDeadTournamentRooms cron racing a live /ensure-table reconnect for the same dead secondary table never double-provisions", async () => {
    const prisma = getPrisma();
    // resumeDeadTournamentRooms() is a tick()-wide cron -- it processes every STARTING/LATE_REG/
    // RUNNING tournament, including ones left behind (with their pokerRooms wiped by beforeEach)
    // by earlier tests in this file. Finish those off first so this test's own call only ever
    // touches the one tournament/table it's actually racing.
    await prisma.tournament.updateMany({
      where: { id: { in: tournamentIds }, status: { in: ["STARTING", "LATE_REG", "RUNNING"] } },
      data: { status: "FINISHED", finishedAt: new Date() },
    });

    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 race-resume-vs-reconnect ${nanoid(4)}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
        fillBotsAtStart: true,
        fillBotCount: 1,
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.humanA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanA),
    });
    await tournamentDirector.processTournament(tournament.id);

    await prisma.tournamentTable.create({
      data: { tournamentId: tournament.id, tableNumber: 2, status: "OPEN" },
    });
    await CashierService.processTournamentRegister({
      userId: testUsers.humanB,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.humanB),
    });
    // First ensure-table call provisions table #2's room for real.
    const firstJoin = await tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanB);
    expect(firstJoin.joinStatus).toBe("CREATING_TABLE");
    const deadRoomId = firstJoin.roomId!;

    // Simulate that room dying (server restart) while humanB is about to reconnect at the exact
    // same moment the tick()-driven resume cron notices the same dead room.
    pokerRooms.delete(deadRoomId);

    const [, reconnectResult] = await Promise.all([
      tournamentDirector.resumeDeadTournamentRooms(),
      tournamentDirector.ensureTournamentTableForJoinDetailed(tournament.id, testUsers.humanB),
    ]);

    const tableTwoAfter = await prisma.tournamentTable.findFirstOrThrow({
      where: { tournamentId: tournament.id, tableNumber: 2 },
    });
    // Table #2 ends up pointing at exactly one live room -- whichever side won the claim -- never
    // stranded pointing at one room while a second orphan room exists unreferenced.
    expect(tableTwoAfter.roomId).toBeTruthy();
    expect(tableTwoAfter.roomId).not.toBe(deadRoomId);
    expect(pokerRooms.has(tableTwoAfter.roomId!)).toBe(true);
    expect(reconnectResult.roomId).toBe(tableTwoAfter.roomId);

    // humanB is seated in that one winning room.
    const winningRoom = pokerRooms.get(tableTwoAfter.roomId!)!;
    expect(winningRoom.state.playersById.has(testUsers.humanB)).toBe(true);
  });

  it("a late registrant who arrives after every existing table is full gets a newly-provisioned table instead of a silently-failed seat (bug found in manual QA)", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M24 overflow-table ${nanoid(4)}`,
        entryFeeCents: 0,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 20,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

    // Exactly MAX_SEATS_PER_TABLE (9) founding registrants -- the tournament starts with one
    // table sized for precisely the registrant count *at STARTING* (9/9, full), matching how the
    // original bug reproduced: late registration is allowed to keep growing the field past what
    // provisioning sized the table(s) for.
    for (let i = 0; i < MAX_SEATS_PER_TABLE; i++) {
      const userId = `tourney_m24_overflow_${testRunId}_${i}`;
      bulkUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@tourney.test`,
          passwordHash: "hash",
          displayName: `Overflow ${i}`,
          role: "USER",
          bankrollCents: 0,
        },
      });
      await CashierService.processTournamentRegister({
        userId,
        tournamentId: tournament.id,
        entryFeeCents: 0,
        externalRef: tournamentEntryExternalRef(tournament.id, userId),
      });
    }

    await tournamentDirector.processTournament(tournament.id);
    const started = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(started.status).toBe("RUNNING");

    const tables = await prisma.tournamentTable.findMany({ where: { tournamentId: tournament.id } });
    expect(tables).toHaveLength(1); // ceil(9/9) = 1 table, and it's exactly full
    const roomOne = pokerRooms.get(started.roomId!)!;
    expect(roomOne.state.playersById.size).toBe(MAX_SEATS_PER_TABLE);

    // A 10th player registers late, after table #1 is already at capacity.
    const lateUserId = `tourney_m24_overflow_${testRunId}_late`;
    bulkUserIds.push(lateUserId);
    await prisma.user.create({
      data: {
        id: lateUserId,
        email: `${lateUserId}@tourney.test`,
        passwordHash: "hash",
        displayName: "Overflow Late",
        role: "USER",
        bankrollCents: 0,
      },
    });
    await CashierService.processTournamentRegister({
      userId: lateUserId,
      tournamentId: tournament.id,
      entryFeeCents: 0,
      externalRef: tournamentEntryExternalRef(tournament.id, lateUserId),
    });
    // Mirrors the real /register route's sequence exactly.
    await tournamentDirector.tryStartTournamentTable(tournament.id);
    await tournamentDirector.seatRegistrantOnAssignedTable(tournament.id, lateUserId);

    // A second table was provisioned on demand -- not routed onto the already-full table #1.
    const tablesAfter = await prisma.tournamentTable.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { tableNumber: "asc" },
    });
    expect(tablesAfter).toHaveLength(2);
    expect(tablesAfter[1]!.tableNumber).toBe(2);

    const lateReg = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: lateUserId } },
    });
    expect(lateReg.tournamentTableId).toBe(tablesAfter[1]!.id);

    // They're actually, physically seated there -- not just assigned in the DB with no live room.
    expect(tablesAfter[1]!.roomId).toBeTruthy();
    const roomTwo = pokerRooms.get(tablesAfter[1]!.roomId!)!;
    expect(roomTwo).toBeDefined();
    expect(roomTwo.state.playersById.has(lateUserId)).toBe(true);

    // Table #1 is untouched -- still exactly full, nobody got bumped or double-seated.
    expect(roomOne.state.playersById.size).toBe(MAX_SEATS_PER_TABLE);
  });
});
