import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../../engine/economy/CashierService.js";
import {
  tournamentCancelExternalRef,
  tournamentEntryExternalRef,
  tournamentRefundExternalRef,
} from "../../tournaments/tournament.constants.js";

const testRunId = nanoid(6);
const testUsers = {
  playerA: `tourney_player_a_${testRunId}`,
  playerB: `tourney_player_b_${testRunId}`,
  playerC: `tourney_player_c_${testRunId}`,
  admin: `tourney_admin_${testRunId}`,
};

let currentUserId = testUsers.playerA;
let currentUserRole: "USER" | "ADMIN" = "USER";

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: { user?: { id: string; role: string } }, _res: unknown, next: () => void) => {
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

describe("Tournament M1 planning and money", () => {
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
    return fetch(`${baseUrl}${path}`);
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
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    currentUserId = testUsers.playerA;
    currentUserRole = "USER";

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
        bankrollCents: 50_000,
      })),
    });
  });

  async function createTournamentViaApi(maxPlayers = 2, entryFeeCents = 1000) {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await post("/api/tournaments", {
      name: `Test Tourney ${nanoid(4)}`,
      entryFeeCents,
      startTime,
      maxPlayers,
      startingStackCents: 10_000,
      blindStructureId: "standard_8min",
      lateRegMinutes: 0,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    tournamentIds.push(body.id);
    currentUserId = testUsers.playerA;
    currentUserRole = "USER";
    return body as {
      id: string;
      maxPlayers: number;
      entryFeeCents: number;
      registeredCount: number;
      prizePoolCents: number;
    };
  }

  it("registers a player and moves entry fee to prize pool", async () => {
    const tournament = await createTournamentViaApi(2, 2000);
    currentUserId = testUsers.playerA;

    const regRes = await post(`/api/tournaments/${tournament.id}/register`);
    expect(regRes.status).toBe(200);

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    const tourney = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    expect(user?.bankrollCents).toBe(48_000);
    expect(tourney?.prizePoolCents).toBe(2000);
  });

  it("duplicate register is idempotent without extra charge", async () => {
    const tournament = await createTournamentViaApi(2, 1500);
    currentUserId = testUsers.playerA;

    await post(`/api/tournaments/${tournament.id}/register`);
    const second = await post(`/api/tournaments/${tournament.id}/register`);
    expect(second.status).toBe(200);

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    const regCount = await prisma.tournamentRegistration.count({ where: { tournamentId: tournament.id } });
    const tourney = await prisma.tournament.findUnique({ where: { id: tournament.id } });

    expect(user?.bankrollCents).toBe(48_500);
    expect(regCount).toBe(1);
    expect(tourney?.prizePoolCents).toBe(1500);
  });

  it("rejects registration when tournament is full", async () => {
    const tournament = await createTournamentViaApi(2, 1000);

    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);

    currentUserId = testUsers.playerB;
    await post(`/api/tournaments/${tournament.id}/register`);

    currentUserId = testUsers.playerC;
    const fullRes = await post(`/api/tournaments/${tournament.id}/register`);
    expect(fullRes.status).toBe(400);
    const body = await fullRes.json();
    expect(body.error).toBe("TOURNAMENT_FULL");
  });

  it("unregisters and refunds entry fee", async () => {
    const tournament = await createTournamentViaApi(2, 2500);
    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);

    const unregRes = await post(`/api/tournaments/${tournament.id}/unregister`);
    expect(unregRes.status).toBe(200);

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    const tourney = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    const regCount = await prisma.tournamentRegistration.count({ where: { tournamentId: tournament.id } });

    expect(user?.bankrollCents).toBe(50_000);
    expect(tourney?.prizePoolCents).toBe(0);
    expect(regCount).toBe(0);
  });

  it("admin cancel refunds all registrants", async () => {
    const tournament = await createTournamentViaApi(3, 3000);

    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);
    currentUserId = testUsers.playerB;
    await post(`/api/tournaments/${tournament.id}/register`);

    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const cancelRes = await post(`/api/tournaments/${tournament.id}/cancel`);
    expect(cancelRes.status).toBe(200);
    const cancelBody = await cancelRes.json();
    expect(cancelBody.refundedCount).toBe(2);

    const prisma = getPrisma();
    const tourney = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    const userA = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    const userB = await prisma.user.findUnique({ where: { id: testUsers.playerB } });

    expect(tourney?.status).toBe("CANCELLED");
    expect(tourney?.prizePoolCents).toBe(0);
    expect(userA?.bankrollCents).toBe(50_000);
    expect(userB?.bankrollCents).toBe(50_000);
  });

  it("list and detail expose registeredCount, maxPlayers, and scheduling fields", async () => {
    const tournament = await createTournamentViaApi(4, 500);
    currentUserId = testUsers.playerA;
    await post(`/api/tournaments/${tournament.id}/register`);

    const listRes = await get("/api/tournaments");
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const listed = listBody.tournaments.find((t: { id: string }) => t.id === tournament.id);
    expect(listed).toBeDefined();
    expect(listed.registeredCount).toBe(1);
    expect(listed.maxPlayers).toBe(4);
    expect(listed.currentLevel).toBe(1);
    expect(listed.blindStructureId).toBe("standard_8min");

    const detailRes = await get(`/api/tournaments/${tournament.id}`);
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.registeredCount).toBe(1);
    expect(detail.maxPlayers).toBe(4);
    expect(detail.startingStackCents).toBe(10_000);
    expect(detail.tableId).toBeNull();
    expect(detail.roomId).toBeNull();
    expect(detail.nextLevelAt).toBeNull();
  });

  it("processTournamentRefund is idempotent on externalRef", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: "Refund Idempotency",
        entryFeeCents: 1000,
        startTime: new Date(Date.now() + 3600_000),
        maxPlayers: 2,
        startingStackCents: 10_000,
        blindStructureId: "standard_8min",
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.playerA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerA),
    });

    const refundRef = tournamentRefundExternalRef(tournament.id, testUsers.playerA);
    await CashierService.processTournamentRefund({
      userId: testUsers.playerA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: refundRef,
    });
    await CashierService.processTournamentRefund({
      userId: testUsers.playerA,
      tournamentId: tournament.id,
      entryFeeCents: 1000,
      externalRef: refundRef,
    });

    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    expect(user?.bankrollCents).toBe(50_000);
  });

  it("processTournamentCancel is idempotent on externalRef", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: "Cancel Idempotency",
        entryFeeCents: 800,
        startTime: new Date(Date.now() + 3600_000),
        maxPlayers: 2,
        startingStackCents: 10_000,
        blindStructureId: "standard_8min",
      },
    });
    tournamentIds.push(tournament.id);

    await CashierService.processTournamentRegister({
      userId: testUsers.playerA,
      tournamentId: tournament.id,
      entryFeeCents: 800,
      externalRef: tournamentEntryExternalRef(tournament.id, testUsers.playerA),
    });

    const cancelRef = tournamentCancelExternalRef(tournament.id);
    const first = await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId: testUsers.admin,
      externalRef: cancelRef,
    });
    const second = await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId: testUsers.admin,
      externalRef: cancelRef,
    });

    expect(first.refundedCount).toBe(1);
    expect(second.refundedCount).toBe(0);

    const user = await prisma.user.findUnique({ where: { id: testUsers.playerA } });
    expect(user?.bankrollCents).toBe(50_000);
  });
});
