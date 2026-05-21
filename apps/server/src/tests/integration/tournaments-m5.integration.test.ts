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
import { loadTournamentStandings } from "../../tournaments/tournament-standings.js";
import { filterCashLobbyTables, isTournamentTableMetadata } from "../../tournaments/lobby-table-filter.js";
import {
  tournamentEntryExternalRef,
  tournamentRefundExternalRef,
} from "../../tournaments/tournament.constants.js";
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
  admin: `tourney_m5_admin_${testRunId}`,
  playerA: `tourney_m5_a_${testRunId}`,
  playerB: `tourney_m5_b_${testRunId}`,
  playerC: `tourney_m5_c_${testRunId}`,
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

describe("Tournament M5 hardening and E2E smoke", () => {
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

  async function get(path: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: "Bearer test" },
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
    currentUserId = testUsers.playerA;
    currentUserRole = "USER";
    await getPrisma().user.updateMany({
      where: { id: { in: Object.values(testUsers) } },
      data: { bankrollCents: 100_000 },
    });
  });

  async function adminCreateTournament(maxPlayers = 2, entryFeeCents = 5000) {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const res = await post("/api/tournaments", {
      name: `M5 Smoke ${nanoid(4)}`,
      entryFeeCents,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers,
      startingStackCents: 8000,
      blindStructureId: "standard_8min",
      lateRegMinutes: 0,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    tournamentIds.push(body.id);
    return body as { id: string; entryFeeCents: number; maxPlayers: number };
  }

  it("E2E: admin create, register, start, join, bust, payout, standings", async () => {
    const tournament = await adminCreateTournament(2, 5000);
    const prisma = getPrisma();

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { startTime: new Date(Date.now() - 60_000) },
    });

    currentUserId = testUsers.playerA;
    expect((await post(`/api/tournaments/${tournament.id}/register`)).status).toBe(200);
    currentUserId = testUsers.playerB;
    expect((await post(`/api/tournaments/${tournament.id}/register`)).status).toBe(200);

    await tournamentDirector.processTournament(tournament.id);

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.status).toBe("RUNNING");
    expect(running.tableId).toBeTruthy();
    expect(running.roomId).toBeTruthy();

    const { assertTournamentJoinAllowed } = await import("../../tournaments/tournament-join-guard.js");
    await expect(
      assertTournamentJoinAllowed({ tournamentId: tournament.id, userId: testUsers.playerA }),
    ).resolves.toMatchObject({ startingStackCents: 8000 });
    await expect(
      assertTournamentJoinAllowed({ tournamentId: tournament.id, userId: testUsers.playerB }),
    ).resolves.toMatchObject({ startingStackCents: 8000 });

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "STARTING" },
    });
    await expect(
      assertTournamentJoinAllowed({ tournamentId: tournament.id, userId: testUsers.playerA }),
    ).resolves.toBeDefined();
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "RUNNING" },
    });

    const room = pokerRooms.get(running.roomId!)!;
    room.state.street = "WAITING";
    const busted = room.state.playersById.get(testUsers.playerB);
    expect(busted).toBeDefined();
    busted!.stackCents = 0;

    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId: tournament.id,
      tableId: running.tableId!,
      roomId: running.roomId!,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
    });

    for (let i = 0; i < 20; i++) {
      const row = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      if (row?.status === "FINISHED") break;
      await new Promise((r) => setTimeout(r, 25));
    }

    const finished = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.prizePoolCents).toBe(0);
    expect(room.state.playersById.has(testUsers.playerB)).toBe(false);

    const winner = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.playerA } });
    expect(winner.bankrollCents).toBe(105_000);

    const payoutTx = await prisma.balanceTransaction.findUnique({
      where: { externalRef: tournamentPayoutExternalRef(tournament.id, 1, testUsers.playerA) },
    });
    expect(payoutTx?.type).toBe("TOURNAMENT_PAYOUT");
    expect(payoutTx?.amountCents).toBe(10_000);

    const standings = await loadTournamentStandings(tournament.id);
    expect(standings[0]?.finishPlace).toBe(1);
    expect(standings[0]?.payoutCents).toBe(10_000);
    expect(standings[1]?.finishPlace).toBe(2);

    const standingsRes = await get(`/api/tournaments/${tournament.id}/standings`);
    expect(standingsRes.status).toBe(200);
    const standingsBody = await standingsRes.json();
    expect(standingsBody.standings).toHaveLength(2);
  });

  it("duplicate unregister is idempotent", async () => {
    const tournament = await adminCreateTournament(2, 1000);
    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);

    const first = await post(`/api/tournaments/${tournament.id}/unregister`);
    const second = await post(`/api/tournaments/${tournament.id}/unregister`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: testUsers.playerA } });
    expect(user.bankrollCents).toBe(100_000);
  });

  it("director tick is safe to retry while running", async () => {
    const tournament = await adminCreateTournament(2, 1000);
    const prisma = getPrisma();
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { startTime: new Date(Date.now() - 60_000) },
    });

    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);
    currentUserId = testUsers.playerB;
    await post(`/api/tournaments/${tournament.id}/register`);

    await tournamentDirector.tick(new Date());
    const first = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const firstRoomId = first.roomId;

    await tournamentDirector.tick(new Date());
    const second = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });

    expect(second.roomId).toBe(firstRoomId);
    expect(pokerRooms.size).toBe(1);
    expect(second.status).toBe("RUNNING");
  });

  it("resumes STARTING tournaments without a room after restart", async () => {
    const tournament = await adminCreateTournament(2, 1000);
    const prisma = getPrisma();
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { startTime: new Date(Date.now() - 60_000) },
    });

    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);
    currentUserId = testUsers.playerB;
    await post(`/api/tournaments/${tournament.id}/register`);

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "STARTING", roomId: null, tableId: null },
    });

    await tournamentDirector.tick(new Date());

    const updated = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(updated.status).toBe("RUNNING");
    expect(updated.roomId).toBeTruthy();
    expect(updated.tableId).toBeTruthy();
  });

  it("excludes tournament tables from lobby matchMaker query", async () => {
    const tournament = await adminCreateTournament(2, 1000);
    const prisma = getPrisma();
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { startTime: new Date(Date.now() - 60_000) },
    });
    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);
    currentUserId = testUsers.playerB;
    await post(`/api/tournaments/${tournament.id}/register`);
    await tournamentDirector.processTournament(tournament.id);

    const rooms = (await matchMaker.query({ name: "poker" })) as Array<{
      metadata?: Record<string, unknown>;
    }>;
    const cashRooms = filterCashLobbyTables(rooms);
    expect(rooms.some((r) => isTournamentTableMetadata(r.metadata))).toBe(true);
    expect(cashRooms.every((r) => !isTournamentTableMetadata(r.metadata))).toBe(true);
    expect(cashRooms.length).toBeLessThan(rooms.length);
  });

  it("rejects registration when tournament is already full", async () => {
    const tournament = await adminCreateTournament(2, 1000);
    const prisma = getPrisma();

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

    await expect(
      CashierService.processTournamentRegister({
        userId: testUsers.playerC,
        tournamentId: tournament.id,
        entryFeeCents: 1000,
        externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerC),
      }),
    ).rejects.toThrow("TOURNAMENT_FULL");

    const regCount = await prisma.tournamentRegistration.count({ where: { tournamentId: tournament.id } });
    expect(regCount).toBe(2);
  });
});
