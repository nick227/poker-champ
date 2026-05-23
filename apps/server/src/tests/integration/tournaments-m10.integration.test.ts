import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { processTournamentFinishResults } from "../../tournaments/tournament-result-processor.js";
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
  admin: `tourney_m10_admin_${testRunId}`,
  playerA: `tourney_m10_a_${testRunId}`,
  playerB: `tourney_m10_b_${testRunId}`,
};

let currentUserId = testUsers.admin;
let currentUserRole: "USER" | "ADMIN" = "ADMIN";

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: { user?: { id: string; role: string } }, _res: unknown, next: () => void) => {
    req.user = { id: currentUserId, role: currentUserRole };
    next();
  },
  attachAuthIfPresent: (req: { user?: { id: string; role: string } }, _res: unknown, next: () => void) => {
    req.user = { id: currentUserId, role: currentUserRole };
    next();
  },
}));

vi.mock("../../engine/auth/AdminMiddleware.js", () => ({
  requireAdmin: (req: { user?: { role: string } }, res: { sendStatus: (code: number) => void }, next: () => void) => {
    if (req.user?.role !== "ADMIN") {
      res.sendStatus(403);
      return;
    }
    next();
  },
}));

import { tournamentsRouter } from "../../http/TournamentsRouter.js";

const app = express();
app.use(express.json());
app.use("/api/tournaments", tournamentsRouter);

describe("Tournament M10 awards and stats", () => {
  let server: http.Server;
  let baseUrl: string;
  const tournamentIds: string[] = [];

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: body == null ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const prisma = getPrisma();
    const userIds = Object.values(testUsers);
    await prisma.awardGrantEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userAward.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userTournamentStats.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `${id}@tourney.test`,
        passwordHash: "hash",
        displayName: id,
        role: id === testUsers.admin ? "ADMIN" : "USER",
        bankrollCents: 100_000,
      })),
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const userIds = Object.values(testUsers);
    for (const id of tournamentIds) {
      await prisma.tournamentPlayerResult.deleteMany({ where: { tournamentId: id } });
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    await prisma.awardGrantEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userAward.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userTournamentStats.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    pokerRooms.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    pokerRooms.clear();
    currentUserRole = "USER";
    const prisma = getPrisma();
    const userIds = Object.values(testUsers);
    await prisma.awardGrantEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userAward.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userTournamentStats.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { bankrollCents: 100_000 },
    });
  });

  async function createRunningTournamentRoom() {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M10 ${nanoid(4)}`,
        entryFeeCents: 5000,
        startTime: new Date(Date.now() - 120_000),
        maxPlayers: 2,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

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
    const room = pokerRooms.get(updated.roomId!)!;
    return { tournament: updated, room, tableId: updated.tableId!, roomId: updated.roomId! };
  }

  async function finishHeadsUpTournament() {
    const { tournament, room, tableId, roomId } = await createRunningTournamentRoom();
    room.state.street = "WAITING";
    const busted = room.state.playersById.get(testUsers.playerB);
    busted!.stackCents = 0;

    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId: tournament.id,
      tableId,
      roomId,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
    });

    const prisma = getPrisma();
    for (let attempt = 0; attempt < 20; attempt++) {
      const row = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      if (row?.status === "FINISHED") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return tournament.id;
  }

  it("grants winner, paid finish, and first tournament awards with stat increments", async () => {
    const tournamentId = await finishHeadsUpTournament();
    const prisma = getPrisma();

    const winnerStats = await prisma.userTournamentStats.findUnique({ where: { userId: testUsers.playerA } });
    expect(winnerStats).toMatchObject({
      tournamentsPlayed: 1,
      tournamentWins: 1,
      tournamentCashes: 1,
      tournamentEarningsCents: 10_000,
    });

    const loserStats = await prisma.userTournamentStats.findUnique({ where: { userId: testUsers.playerB } });
    expect(loserStats).toMatchObject({
      tournamentsPlayed: 1,
      tournamentWins: 0,
      tournamentCashes: 0,
      tournamentEarningsCents: 0,
    });

    const winnerAwards = await prisma.userAward.findMany({ where: { userId: testUsers.playerA } });
    expect(winnerAwards.map((a) => a.awardId).sort()).toEqual(
      ["first_tournament_played", "tournament_paid_finish", "tournament_winner"].sort(),
    );

    const loserAwards = await prisma.userAward.findMany({ where: { userId: testUsers.playerB } });
    expect(loserAwards.map((a) => a.awardId)).toEqual(["first_tournament_played"]);

    const resultRows = await prisma.tournamentPlayerResult.count({ where: { tournamentId } });
    expect(resultRows).toBe(2);
  });

  it("does not duplicate awards or stats on finish result retry", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: "M10 Retry",
        entryFeeCents: 5000,
        startTime: new Date(),
        maxPlayers: 2,
        startingStackCents: 8000,
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

    await CashierService.processTournamentPayouts({ tournamentId: tournament.id, humanEntrantCount: 2 });
    await processTournamentFinishResults(tournament.id);
    await processTournamentFinishResults(tournament.id);

    const winnerStats = await prisma.userTournamentStats.findUniqueOrThrow({
      where: { userId: testUsers.playerA },
    });
    expect(winnerStats.tournamentsPlayed).toBe(1);
    expect(winnerStats.tournamentWins).toBe(1);

    const grantEvents = await prisma.awardGrantEvent.findMany({
      where: { userId: testUsers.playerA, awardId: "tournament_winner" },
    });
    expect(grantEvents).toHaveLength(1);

    const payoutCount = await prisma.balanceTransaction.count({
      where: {
        tournamentId: tournament.id,
        userId: testUsers.playerA,
        type: "TOURNAMENT_PAYOUT",
      },
    });
    expect(payoutCount).toBe(1);
    expect(
      await prisma.balanceTransaction.findUnique({
        where: { externalRef: tournamentPayoutExternalRef(tournament.id, 1, testUsers.playerA) },
      }),
    ).toBeTruthy();
  });
});
