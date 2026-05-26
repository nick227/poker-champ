import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
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
  playerA: `tourney_m22_a_${testRunId}`,
  playerB: `tourney_m22_b_${testRunId}`,
};

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

describe.skipIf(!hasDatabase)("Tournament M22 — dealer triggers tournament reconcile", () => {
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
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    pokerRooms.clear();
    vi.stubEnv("HAND_RESULT_HOLD_MS", "0");
    vi.stubEnv("POKER_BOT_DELAY_MS", "0");
    vi.stubEnv("RUNOUT_STAGE_DELAY_MS", "0");
  });

  it("dealer drive at WAITING invokes reconcileAfterHand after bust", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M22 ${testRunId}`,
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
    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const room = pokerRooms.get(running.roomId!)!;

    room.dealerRef.suspendGameplayTransitions("M22_TEST_HOLD");
    for (let i = 0; i < 200 && room.dealerRef.getQueueDepth() > 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    room.state.street = "WAITING";
    room.state.handId = "";
    room.state.roundState = "HAND_COMPLETE";
    room.state.toActSeat = -1;
    room.state.nextHandAtTs = Date.now() + 60 * 60 * 1000;
    room.state.playersById.get(testUsers.playerB)!.stackCents = 0;

    const reconcileSpy = vi.spyOn(tournamentTableReconciler, "reconcileAfterHand");

    await (room.dealerRef as unknown as { requestDrive: (reason: string) => Promise<void> }).requestDrive(
      "M22_BUST_RECONCILE",
    );
    await flushAsyncWork();
    room.dealerRef.resumeGameplayTransitions("M22_TEST_HOLD");

    expect(reconcileSpy).toHaveBeenCalled();
    expect(reconcileSpy.mock.calls.some((call) => call[0]?.tournamentId === tournament.id)).toBe(
      true,
    );

    const regB = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: {
        tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB },
      },
    });
    expect(regB.finishPlace).toBe(2);

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(after.status).toBe("FINISHED");

    reconcileSpy.mockRestore();
  });
});
