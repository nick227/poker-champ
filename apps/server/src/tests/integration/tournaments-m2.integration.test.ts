import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import {
  tournamentCancelExternalRef,
  tournamentEntryExternalRef,
} from "../../tournaments/tournament.constants.js";
import { isTournamentTableMetadata } from "../../tournaments/lobby-table-filter.js";
import { buildTournamentTableConfig } from "../../tournaments/tournament-table-config.js";
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
  playerA: `tourney_m2_a_${testRunId}`,
  playerB: `tourney_m2_b_${testRunId}`,
  outsider: `tourney_m2_out_${testRunId}`,
};

describe("Tournament M2 director and table flow", () => {
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
        bankrollCents: 50_000,
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

  beforeEach(() => {
    pokerRooms.clear();
  });

  async function createDueTournament(maxPlayers = 6, entryFee = 1000) {
    const prisma = getPrisma();
    const startTime = new Date(Date.now() - 60_000);
    const tournament = await prisma.tournament.create({
      data: {
        name: `M2 Tourney ${nanoid(4)}`,
        entryFeeCents: entryFee,
        startTime,
        maxPlayers,
        startingStackCents: 12_000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);
    return tournament;
  }

  async function registerUser(tournamentId: string, userId: string, entryFee: number) {
    await CashierService.processTournamentRegister({
      userId,
      tournamentId,
      entryFeeCents: entryFee,
      externalRef: tournamentEntryExternalRef(tournamentId, userId),
    });
  }

  it("defers cancel until late registration closes when only one player registered", async () => {
    const prisma = getPrisma();
    const tournament = await createDueTournament();
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { lateRegMinutes: 16 },
    });
    await registerUser(tournament.id, testUsers.playerA, tournament.entryFeeCents);

    await tournamentDirector.beginLateRegistration(tournament.id);
    let updated = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    expect(updated?.status).toBe("LATE_REG");

    await tournamentDirector.closeLateRegistration(
      tournament.id,
      new Date(tournament.startTime.getTime() + 16 * 60 * 1000 + 1000),
    );
    updated = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    expect(updated?.status).toBe("CANCELLED");
    expect(user?.bankrollCents).toBe(50_000);
  });

  it("auto-cancels and refunds when only one player registered", async () => {
    const tournament = await createDueTournament();
    await registerUser(tournament.id, testUsers.playerA, tournament.entryFeeCents);

    await tournamentDirector.processTournament(tournament.id);

    const prisma = getPrisma();
    const updated = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });

    expect(updated?.status).toBe("CANCELLED");
    expect(updated?.prizePoolCents).toBe(0);
    expect(user?.bankrollCents).toBe(50_000);
    const regCount = await prisma.tournamentRegistration.count({ where: { tournamentId: tournament.id } });
    expect(regCount).toBe(1);
  });

  it("starts tournament with table link and equal stacks for two players", async () => {
    const tournament = await createDueTournament();
    await registerUser(tournament.id, testUsers.playerA, tournament.entryFeeCents);
    await registerUser(tournament.id, testUsers.playerB, tournament.entryFeeCents);

    await tournamentDirector.processTournament(tournament.id);

    const prisma = getPrisma();
    const updated = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    expect(updated?.status).toBe("RUNNING");
    expect(updated?.tableId).toBeTruthy();
    expect(updated?.roomId).toBeTruthy();
    expect(updated?.currentLevel).toBe(1);
    expect(updated?.nextLevelAt).toBeInstanceOf(Date);

    const room = pokerRooms.get(updated!.roomId!);
    expect(room).toBeDefined();
    expect(room!.getTournamentIdInternal()).toBe(tournament.id);

    const stackA = room!.state.playersById.get(testUsers.playerA)?.stackCents;
    const stackB = room!.state.playersById.get(testUsers.playerB)?.stackCents;
    expect(stackA).toBe(12_000);
    expect(stackB).toBe(12_000);
    expect(room!.state.smallBlindCents).toBe(25);
    expect(room!.state.bigBlindCents).toBe(50);
  });

  it("excludes tournament tables from cash lobby metadata filter", () => {
    expect(isTournamentTableMetadata({ tournamentId: "t1" })).toBe(true);
    expect(isTournamentTableMetadata({ tableId: "table_x" })).toBe(false);
    const cfg = buildTournamentTableConfig({
      tournamentId: "t1",
      name: "T",
      maxPlayers: 6,
      startingStackCents: 10_000,
      blindStructureId: "standard_8min",
    });
    expect(cfg.tournamentId).toBe("t1");
    expect(cfg.minBuyInCents).toBe(10_000);
    expect(cfg.maxBuyInCents).toBe(10_000);
  });

  it("join guard rejects unregistered user on tournament table", async () => {
    const tournament = await createDueTournament();
    await registerUser(tournament.id, testUsers.playerA, tournament.entryFeeCents);
    await registerUser(tournament.id, testUsers.playerB, tournament.entryFeeCents);
    await tournamentDirector.processTournament(tournament.id);

    const prisma = getPrisma();
    const updated = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    const room = pokerRooms.get(updated!.roomId!);
    expect(room).toBeDefined();

    const { assertTournamentJoinAllowed } = await import("../../tournaments/tournament-join-guard.js");
    await expect(
      assertTournamentJoinAllowed({ tournamentId: tournament.id, userId: testUsers.outsider }),
    ).rejects.toThrow("TOURNAMENT_NOT_REGISTERED");

    const allowed = await assertTournamentJoinAllowed({
      tournamentId: tournament.id,
      userId: testUsers.playerA,
    });
    expect(allowed.startingStackCents).toBe(12_000);
  });

  it("idempotent director claim does not restart a running tournament", async () => {
    const tournament = await createDueTournament();
    await registerUser(tournament.id, testUsers.playerA, tournament.entryFeeCents);
    await registerUser(tournament.id, testUsers.playerB, tournament.entryFeeCents);

    await tournamentDirector.processTournament(tournament.id);
    const prisma = getPrisma();
    const first = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    const firstRoomId = first?.roomId;

    await tournamentDirector.processTournament(tournament.id);
    const second = await prisma.tournament.findUnique({ where: { id: tournament.id } });

    expect(second?.roomId).toBe(firstRoomId);
    expect(pokerRooms.size).toBe(1);
  });
});
