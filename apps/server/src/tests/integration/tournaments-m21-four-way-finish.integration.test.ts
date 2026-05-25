import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import {
  computeHumanPayoutAmountsByUserId,
  tournamentPayoutExternalRef,
} from "../../tournaments/tournament-payouts.js";
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
  playerA: `tourney_m21_a_${testRunId}`,
  playerB: `tourney_m21_b_${testRunId}`,
  playerC: `tourney_m21_c_${testRunId}`,
  playerD: `tourney_m21_d_${testRunId}`,
};

describe.skipIf(!hasDatabase)("Tournament M21 — four-player freezeout finish order", () => {
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

  async function bustAndReconcile(params: {
    tournamentId: string;
    tableId: string;
    room: PokerRoom;
    bustedUserId: string;
  }): Promise<boolean> {
    params.room.state.street = "WAITING";
    const busted = params.room.state.playersById.get(params.bustedUserId);
    expect(busted).toBeDefined();
    busted!.stackCents = 0;

    let playEnded = false;
    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId: params.tournamentId,
      tableId: params.tableId,
      roomId: params.room.roomId,
      state: params.room.state,
      tableName: params.room.state.tableName,
      removeBustedPlayer: async (userId) => {
        params.room.state.playersById.delete(userId);
      },
      onOverlayUpdated: () => {},
      onPlayEnded: () => {
        playEnded = true;
      },
    });
    return playEnded;
  }

  it("assigns finish places 4→3→2→1 and pays out after sequential busts", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M21 ${testRunId}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() - 120_000),
        maxPlayers: 4,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        fillBotsAtStart: false,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

    for (const userId of Object.values(testUsers)) {
      await registerUser(tournament.id, userId, tournament.entryFeeCents);
    }

    await tournamentDirector.processTournament(tournament.id);
    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.status).toBe("RUNNING");
    expect(running.prizePoolCents).toBe(4000);

    const room = pokerRooms.get(running.roomId!)!;
    for (const userId of Object.values(testUsers)) {
      expect(room.state.playersById.has(userId)).toBe(true);
    }

    const bustOrder = [testUsers.playerC, testUsers.playerD, testUsers.playerB] as const;
    for (let i = 0; i < bustOrder.length; i++) {
      const bustedUserId = bustOrder[i]!;
      const ended = await bustAndReconcile({
        tournamentId: tournament.id,
        tableId: running.tableId!,
        room,
        bustedUserId,
      });
      expect(room.state.playersById.has(bustedUserId)).toBe(false);
      if (i < bustOrder.length - 1) {
        expect(ended).toBe(false);
        const mid = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
        expect(mid.status).toBe("RUNNING");
      } else {
        expect(ended).toBe(true);
      }
    }

    const finished = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(finished.status).toBe("FINISHED");

    const regs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, isBot: false },
    });
    const placeByUser = new Map(regs.map((r) => [r.userId, r.finishPlace]));
    expect(placeByUser.get(testUsers.playerC)).toBe(4);
    expect(placeByUser.get(testUsers.playerD)).toBe(3);
    expect(placeByUser.get(testUsers.playerB)).toBe(2);
    expect(placeByUser.get(testUsers.playerA)).toBe(1);

    const humanFinishers = regs.map((r) => ({
      userId: r.userId,
      finishPlace: r.finishPlace!,
    }));
    const expectedPayouts = computeHumanPayoutAmountsByUserId(
      finished.prizePoolCents,
      4,
      humanFinishers,
    );

    for (const [userId, amountCents] of expectedPayouts) {
      const place = placeByUser.get(userId)!;
      const tx = await prisma.balanceTransaction.findUnique({
        where: { externalRef: tournamentPayoutExternalRef(tournament.id, place, userId) },
      });
      expect(tx?.type).toBe("TOURNAMENT_PAYOUT");
      expect(tx?.amountCents).toBe(amountCents);
    }
  });
});
