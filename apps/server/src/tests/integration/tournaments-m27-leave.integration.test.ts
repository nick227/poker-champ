import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { finalizeEliminatedRegistration } from "../../tournaments/tournament-rebuy.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import { tournamentPayoutExternalRef } from "../../tournaments/tournament-payouts.js";
import type { TournamentTableOverlay } from "../../tournaments/tournament-overlay.js";
import { getBlindLevel } from "../../tournaments/blind-structure.js";
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
  playerA: `tourney_m27_a_${testRunId}`,
  playerB: `tourney_m27_b_${testRunId}`,
};

function setRoomOverlay(room: PokerRoom, overlay: TournamentTableOverlay | null): void {
  (room as unknown as { tournamentOverlay: TournamentTableOverlay | null }).tournamentOverlay = overlay;
}

async function refreshRoomTournamentOverlay(room: PokerRoom, tournamentId: string): Promise<void> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return;
  const level = getBlindLevel(tournament.blindStructureId, tournament.currentLevel);
  setRoomOverlay(room, {
    tournamentId: tournament.id,
    status: tournament.status,
    currentLevel: tournament.currentLevel,
    smallBlindCents: level.smallBlindCents,
    bigBlindCents: level.bigBlindCents,
    anteCents: level.anteCents,
    nextLevelAtTs: tournament.nextLevelAt?.getTime() ?? null,
    playFormat: tournament.playFormat as "FREEZEOUT" | "REBUY",
  });
}

async function bustPlayerAndReconcile(params: {
  tournamentId: string;
  tableId: string;
  roomId: string;
  room: PokerRoom;
  bustedUserId: string;
}): Promise<{ playEnded: boolean }> {
  params.room.state.street = "WAITING";
  params.room.state.nextHandAtTs = 0;
  const busted = params.room.state.playersById.get(params.bustedUserId);
  expect(busted).toBeDefined();
  busted!.stackCents = 0;

  let playEnded = false;
  await tournamentTableReconciler.reconcileAfterHand({
    tournamentId: params.tournamentId,
    tableId: params.tableId,
    roomId: params.roomId,
    state: params.room.state,
    tableName: params.room.state.tableName,
    removeBustedPlayer: async (userId) => {
      await params.room.removeTournamentBustedPlayer(userId);
    },
    removePlayerForTableTransfer: async (userId) => params.room.removeTournamentPlayerForTableTransfer(userId),
    onOverlayUpdated: (overlay) => setRoomOverlay(params.room, overlay),
    onPlayEnded: () => {
      playEnded = true;
    },
    onTableBreaking: () => {},
    onHandForHandHold: () => {},
    onHandForHandRelease: () => {},
  });
  return { playEnded };
}

describe.skipIf(!hasDatabase)("Tournament M27 — explicit leave (decline rebuy)", () => {
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

  it("finalizes elimination immediately on explicit leave, without waiting for the rebuy window", async () => {
    const prisma = getPrisma();
    const startTime = new Date(Date.now() - 60_000);
    const tournament = await prisma.tournament.create({
      data: {
        name: `M27 ${testRunId}`,
        entryFeeCents: 1000,
        startTime,
        maxPlayers: 2,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        playFormat: "REBUY",
        maxRebuysPerPlayer: 2,
        rebuyPeriodMinutes: 60,
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
    expect(running.status).toBe("RUNNING");

    const room = pokerRooms.get(running.roomId!)!;
    await refreshRoomTournamentOverlay(room, tournament.id);

    const afterBust = await bustPlayerAndReconcile({
      tournamentId: tournament.id,
      tableId: running.tableId!,
      roomId: running.roomId!,
      room,
      bustedUserId: testUsers.playerB,
    });
    expect(afterBust.playEnded).toBe(false);

    const regBPending = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB } },
    });
    expect(regBPending.finishPlace).toBeNull();
    expect(regBPending.rebuyPendingAt).not.toBeNull();

    // Player B explicitly leaves instead of rebuying — well inside the 60-minute rebuy window,
    // so this must not depend on the sweep's timeout to take effect.
    const finalized = await finalizeEliminatedRegistration(tournament.id, testUsers.playerB);
    expect(finalized).toBe(true);

    const regBLeft = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB } },
    });
    expect(regBLeft.finishPlace).toBe(2);
    expect(regBLeft.rebuyPendingAt).toBeNull();
    expect(regBLeft.eliminatedAt).not.toBeNull();

    // Race guard: a second call (e.g. the sweep firing concurrently) must be a no-op, not a
    // double-elimination or a finishPlace overwrite.
    const finalizedAgain = await finalizeEliminatedRegistration(tournament.id, testUsers.playerB);
    expect(finalizedAgain).toBe(false);
    const regBUnchanged = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB } },
    });
    expect(regBUnchanged.finishPlace).toBe(2);

    // The next post-hand reconcile should now see remainingRegistrationCount == 1 and finish.
    room.state.street = "WAITING";
    let playEnded = false;
    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId: tournament.id,
      tableId: running.tableId!,
      roomId: running.roomId!,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: async (userId) => {
        await room.removeTournamentBustedPlayer(userId);
      },
      removePlayerForTableTransfer: async (userId) => room.removeTournamentPlayerForTableTransfer(userId),
      onOverlayUpdated: (overlay) => setRoomOverlay(room, overlay),
      onPlayEnded: () => {
        playEnded = true;
      },
      onTableBreaking: () => {},
      onHandForHandHold: () => {},
      onHandForHandRelease: () => {},
    });
    expect(playEnded).toBe(true);

    const done = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(done.status).toBe("FINISHED");

    const regA = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerA } },
    });
    expect(regA.finishPlace).toBe(1);

    const payoutTx = await prisma.balanceTransaction.findUnique({
      where: { externalRef: tournamentPayoutExternalRef(tournament.id, 1, testUsers.playerA) },
    });
    expect(payoutTx?.type).toBe("TOURNAMENT_PAYOUT");
  });
});
