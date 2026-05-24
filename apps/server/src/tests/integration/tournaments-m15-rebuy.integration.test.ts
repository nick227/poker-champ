import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { loadTournamentStandings } from "../../tournaments/tournament-standings.js";
import {
  resolveRegisteredTournamentPlayerStatus,
} from "../../tournaments/tournament-player-status.js";
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
      query: vi.fn(async () => {
        return [...pokerRooms.entries()].map(([roomId, room]) => ({
          roomId,
          name: "poker",
          clients: 0,
          maxClients: 9,
          metadata: {
            tableId: room.state.tableId,
            name: room.state.tableName,
            tournamentId: room.getTournamentIdInternal(),
          },
        }));
      }),
    },
  };
});

const testRunId = nanoid(6);
const testUsers = {
  admin: `tourney_m15_admin_${testRunId}`,
  playerA: `tourney_m15_a_${testRunId}`,
  playerB: `tourney_m15_b_${testRunId}`,
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
import { economyRouter } from "../../http/EconomyRouter.js";

const app = express();
app.use(express.json());
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/economy", economyRouter);

async function ensureRebuyPendingSchema(): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.$queryRawUnsafe("SELECT rebuyPendingAt FROM TournamentRegistration LIMIT 1");
  } catch {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `TournamentRegistration` ADD COLUMN `rebuyPendingAt` DATETIME(3) NULL",
    );
  }
}

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

async function waitForDealerIdle(room: PokerRoom, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (room.dealerRef.getQueueDepth() > 0 && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForTableWaiting(room: PokerRoom, timeoutMs = 15_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await waitForDealerIdle(room, 500);
    if (room.state.street === "WAITING" && room.dealerRef.getQueueDepth() === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for table WAITING state");
}

async function bustPlayerAndReconcile(params: {
  tournamentId: string;
  tableId: string;
  roomId: string;
  room: PokerRoom;
  bustedUserId: string;
  removeBustedPlayer?: (userId: string) => Promise<void>;
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
    removeBustedPlayer:
      params.removeBustedPlayer ??
      ((userId) => params.room.removeTournamentBustedPlayer(userId)),
    onOverlayUpdated: (overlay) => setRoomOverlay(params.room, overlay),
    onPlayEnded: () => {
      playEnded = true;
    },
  });
  return { playEnded };
}

async function captureHeroSnapshot(
  room: PokerRoom,
  userId: string,
): Promise<TableSnapshotPayload | null> {
  let payload: TableSnapshotPayload | null = null;
  room.dealerRef.bindClient(userId, {
    send: (_type: string, message: TableSnapshotPayload) => {
      payload = message;
    },
  } as never);
  await room.dealerRef.emitSnapshotToUser(userId, "JOIN");
  return payload;
}

describe.skipIf(!hasDatabase)("Tournament M15 rebuy E2E", () => {
  let server: http.Server;
  let baseUrl: string;
  const tournamentIds: string[] = [];
  const startingStackCents = 8000;
  const entryFeeCents = 5000;

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: body == null ? undefined : JSON.stringify(body),
    });
  }

  async function get(path: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: "Bearer test" },
    });
  }

  beforeAll(async () => {
    await ensureRebuyPendingSchema();

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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    pokerRooms.clear();
    vi.mocked(matchMaker.query).mockClear();
    currentUserRole = "USER";
    await getPrisma().user.updateMany({
      where: { id: { in: Object.values(testUsers) } },
      data: { bankrollCents: 100_000 },
    });
  });

  async function adminCreateRebuyTournament() {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const res = await post("/api/tournaments", {
      name: `M15 Rebuy ${testRunId}`,
      entryFeeCents,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 2,
      startingStackCents,
      blindStructureId: "standard_8min",
      lateRegMinutes: 0,
      playFormat: "REBUY",
      maxRebuysPerPlayer: 1,
      rebuyPeriodMinutes: 60,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    tournamentIds.push(body.id);
    return body as { id: string };
  }

  async function registerViaApi(tournamentId: string, userId: string) {
    currentUserId = userId;
    currentUserRole = "USER";
    const res = await post(`/api/tournaments/${tournamentId}/register`);
    expect(res.status).toBe(200);
  }

  it("REBUY: bust → pending → rebuy re-seat → second bust → winner", async () => {
    const tournament = await adminCreateRebuyTournament();
    const prisma = getPrisma();

    await registerViaApi(tournament.id, testUsers.playerA);
    await registerViaApi(tournament.id, testUsers.playerB);

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { startTime: new Date(Date.now() - 60_000) },
    });

    await tournamentDirector.processTournament(tournament.id);

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.status).toBe("RUNNING");
    expect(running.playFormat).toBe("REBUY");

    const room = pokerRooms.get(running.roomId!)!;
    expect(room.state.playersById.has(testUsers.playerA)).toBe(true);
    expect(room.state.playersById.has(testUsers.playerB)).toBe(true);

    const { playEnded: endedAfterFirstBust } = await bustPlayerAndReconcile({
      tournamentId: tournament.id,
      tableId: running.tableId!,
      roomId: running.roomId!,
      room,
      bustedUserId: testUsers.playerB,
    });

    expect(endedAfterFirstBust).toBe(false);

    const regBAfterFirstBust = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB } },
    });
    expect(regBAfterFirstBust.finishPlace).toBeNull();
    expect(regBAfterFirstBust.rebuyPendingAt).not.toBeNull();
    expect(room.state.playersById.has(testUsers.playerB)).toBe(false);

    const regAAfterFirstBust = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerA } },
    });
    expect(regAAfterFirstBust.finishPlace).toBeNull();

    const tourneyAfterFirstBust = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(tourneyAfterFirstBust.status).toBe("RUNNING");

    expect(
      resolveRegisteredTournamentPlayerStatus(tourneyAfterFirstBust, regBAfterFirstBust, 0),
    ).toBe("REBUY_PENDING");
    expect(
      resolveRegisteredTournamentPlayerStatus(tourneyAfterFirstBust, regAAfterFirstBust, 0),
    ).toBe("ACTIVE");

    const { resolveTournamentJoin } = await import("../../tournaments/tournament-join-guard.js");
    const joinResolution = await resolveTournamentJoin({
      tournamentId: tournament.id,
      userId: testUsers.playerB,
    });
    expect(joinResolution).toMatchObject({
      mode: "SPECTATE",
      finishPlace: null,
      rebuyPending: true,
    });

    currentUserId = testUsers.playerB;
    const detailRes = await get(`/api/tournaments/${tournament.id}`);
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.playerStatus).toBe("REBUY_PENDING");

    await waitForDealerIdle(room);
    await refreshRoomTournamentOverlay(room, tournament.id);

    const snapshotB = await captureHeroSnapshot(room, testUsers.playerB);
    expect(snapshotB?.hero.tournamentViewer?.rebuyPending).toBe(true);
    expect(snapshotB?.hero.tournamentViewer?.isEliminated).toBe(false);
    expect(snapshotB?.hero.youAreSeated).toBe(false);

    const snapshotA = await captureHeroSnapshot(room, testUsers.playerA);
    expect(snapshotA?.hero.tournamentViewer?.isWinner).not.toBe(true);
    expect(snapshotA?.hero.tournamentViewer?.isEliminated).not.toBe(true);

    const bankrollBeforeRebuy = (
      await prisma.user.findUniqueOrThrow({ where: { id: testUsers.playerB } })
    ).bankrollCents;

    const buyInRes = await post("/api/economy/buy-in", {
      tableId: running.tableId,
      amountCents: startingStackCents,
    });
    expect(buyInRes.status).toBe(200);

    await waitForTableWaiting(room);

    const regBAfterRebuy = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB } },
    });
    expect(regBAfterRebuy.rebuyPendingAt).toBeNull();
    expect(regBAfterRebuy.finishPlace).toBeNull();

    const rebuyPlayer = room.state.playersById.get(testUsers.playerB);
    expect(rebuyPlayer).toBeDefined();
    expect(rebuyPlayer!.stackCents).toBeGreaterThan(0);
    expect(rebuyPlayer!.stackCents).toBeLessThanOrEqual(startingStackCents);
    expect(room.state.playersById.get(testUsers.playerA)?.stackCents).toBeGreaterThan(0);

    const rebuyTxCount = await prisma.balanceTransaction.count({
      where: { tournamentId: tournament.id, userId: testUsers.playerB, type: "BUYIN" },
    });
    expect(rebuyTxCount).toBe(1);

    const bankrollAfterRebuy = (
      await prisma.user.findUniqueOrThrow({ where: { id: testUsers.playerB } })
    ).bankrollCents;
    expect(bankrollAfterRebuy).toBe(bankrollBeforeRebuy - startingStackCents);

    const seatedWithChips = [...room.state.playersById.values()].filter((p) => p.stackCents > 0);
    expect(seatedWithChips.length).toBe(2);

    room.state.nextHandAtTs = 0;
    await waitForTableWaiting(room);

    const { playEnded: endedAfterSecondBust } = await bustPlayerAndReconcile({
      tournamentId: tournament.id,
      tableId: running.tableId!,
      roomId: running.roomId!,
      room,
      bustedUserId: testUsers.playerB,
      removeBustedPlayer: async (userId) => {
        room.state.playersById.delete(userId);
      },
    });
    expect(endedAfterSecondBust).toBe(true);

    const finished = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(finished.status).toBe("FINISHED");

    const regBFinal = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB } },
    });
    const regAFinal = await prisma.tournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerA } },
    });
    expect(regBFinal.finishPlace).toBe(2);
    expect(regBFinal.rebuyPendingAt).toBeNull();
    expect(regAFinal.finishPlace).toBe(1);

    const payoutTx = await prisma.balanceTransaction.findUnique({
      where: { externalRef: tournamentPayoutExternalRef(tournament.id, 1, testUsers.playerA) },
    });
    expect(payoutTx?.type).toBe("TOURNAMENT_PAYOUT");

    const standings = await loadTournamentStandings(tournament.id);
    expect(standings.find((s) => s.userId === testUsers.playerA)?.finishPlace).toBe(1);
    expect(standings.find((s) => s.userId === testUsers.playerB)?.finishPlace).toBe(2);

    currentUserId = testUsers.playerB;
    const detailAfterFinish = await get(`/api/tournaments/${tournament.id}`);
    const detailAfterFinishBody = await detailAfterFinish.json();
    expect(detailAfterFinishBody.playerStatus).toBe("ELIMINATED");

    currentUserId = testUsers.playerA;
    const detailWinner = await get(`/api/tournaments/${tournament.id}`);
    const detailWinnerBody = await detailWinner.json();
    expect(detailWinnerBody.playerStatus).toBe("WINNER");
  });
});
