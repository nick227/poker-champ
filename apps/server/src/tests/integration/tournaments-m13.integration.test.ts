import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { getTournamentBotUserId } from "../../tournaments/tournament-bot-users.js";
import { getUserTournamentStats } from "../../tournaments/tournament-user-stats.js";
import { loadTournamentStandings } from "../../tournaments/tournament-standings.js";

const testRunId = nanoid(6);
const testUsers = {
  admin: `tourney_m13_admin_${testRunId}`,
  player: `tourney_m13_player_${testRunId}`,
};

let currentUserId = testUsers.admin;
let currentUserRole: "ADMIN" | "USER" = "ADMIN";

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

describe("Tournament M13 release audit", () => {
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
    await prisma.user.deleteMany({ where: { id: { in: Object.values(testUsers) } } });
    await prisma.user.createMany({
      data: [
        {
          id: testUsers.admin,
          email: `${testUsers.admin}@tourney.test`,
          passwordHash: "hash",
          displayName: "M13 Admin",
          role: "ADMIN",
          bankrollCents: 100_000,
        },
        {
          id: testUsers.player,
          email: `${testUsers.player}@tourney.test`,
          passwordHash: "hash",
          displayName: "M13 Player",
          role: "USER",
          bankrollCents: 100_000,
        },
      ],
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const botUserId = getTournamentBotUserId("chaos_carl");
    for (const id of tournamentIds) {
      await prisma.tournamentPlayerResult.deleteMany({ where: { tournamentId: id } });
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    await prisma.tournamentPlayerResult.deleteMany({ where: { userId: testUsers.player } });
    await prisma.userTournamentStats.deleteMany({ where: { userId: testUsers.player } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: [testUsers.player, botUserId] } } });
    await prisma.tournamentRegistration.deleteMany({
      where: { userId: { in: [testUsers.player, botUserId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [...Object.values(testUsers), botUserId] } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("allows any authenticated user to create tournaments", async () => {
    currentUserId = testUsers.player;
    currentUserRole = "USER";
    const res = await post("/api/tournaments", {
      name: "Player Created",
      entryFeeCents: 1000,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 2,
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    tournamentIds.push(created.id);
    expect(created.createdByUserId).toBe(testUsers.player);
    expect(created.isCreator).toBe(true);
  });

  it("allows creator to delete empty registering tournament", async () => {
    currentUserId = testUsers.player;
    currentUserRole = "USER";
    const createRes = await post("/api/tournaments", {
      name: "Creator Delete",
      entryFeeCents: 1000,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 2,
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    tournamentIds.push(created.id);

    const cancelRes = await post(`/api/tournaments/${created.id}/cancel`);
    expect(cancelRes.status).toBe(200);
    const body = await cancelRes.json();
    expect(body.refundedCount).toBe(0);
  });

  it("rejects creator delete when registrations exist", async () => {
    currentUserId = testUsers.player;
    currentUserRole = "USER";
    const createRes = await post("/api/tournaments", {
      name: "Creator Blocked Delete",
      entryFeeCents: 1000,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 4,
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    tournamentIds.push(created.id);

    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    await post(`/api/tournaments/${created.id}/register`);

    currentUserId = testUsers.player;
    currentUserRole = "USER";
    const cancelRes = await post(`/api/tournaments/${created.id}/cancel`);
    expect(cancelRes.status).toBe(400);
    const body = await cancelRes.json();
    expect(body.error).toBe("TOURNAMENT_HAS_REGISTRATIONS");
  });

  it("rejects tournament cancel for non-creator non-admin users", async () => {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const createRes = await post("/api/tournaments", {
      name: "Cancel Guard",
      entryFeeCents: 1000,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 2,
      fillBotsAtStart: false,
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    tournamentIds.push(created.id);

    currentUserId = testUsers.player;
    currentUserRole = "USER";
    const cancelRes = await post(`/api/tournaments/${created.id}/cancel`);
    expect(cancelRes.status).toBe(403);
  });

  it("returns bot-fill and registration fields on tournament API responses", async () => {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const createRes = await post("/api/tournaments", {
      name: "OpenAPI Fields",
      entryFeeCents: 2000,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 4,
      fillBotsAtStart: true,
      fillBotCount: 3,
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    tournamentIds.push(created.id);
    expect(created.fillBotsAtStart).toBe(true);
    expect(created.fillBotCount).toBe(3);

    currentUserId = testUsers.player;
    currentUserRole = "USER";
    await post(`/api/tournaments/${created.id}/register`);

    const detailRes = await get(`/api/tournaments/${created.id}`);
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.isRegistered).toBe(true);
    expect(detail.fillBotsAtStart).toBe(true);
    expect(detail.fillBotCount).toBe(3);
  });

  it("exposes isBot on standings rows", async () => {
    const prisma = getPrisma();
    const botUserId = getTournamentBotUserId("chaos_carl");
    await prisma.user.upsert({
      where: { id: botUserId },
      create: {
        id: botUserId,
        email: `${botUserId}@tournament-bot.local`,
        passwordHash: "tournament_bot",
        displayName: "Chaos Carl",
        role: "USER",
        bankrollCents: 0,
      },
      update: {},
    });

    const tournament = await prisma.tournament.create({
      data: {
        name: "Standings isBot",
        entryFeeCents: 1000,
        startTime: new Date(),
        maxPlayers: 2,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        status: "FINISHED",
        fillBotsAtStart: true,
      },
    });
    tournamentIds.push(tournament.id);

    await prisma.tournamentRegistration.createMany({
      data: [
        { tournamentId: tournament.id, userId: testUsers.player, finishPlace: 1, isBot: false },
        { tournamentId: tournament.id, userId: botUserId, finishPlace: 2, isBot: true, eliminatedAt: new Date() },
      ],
    });

    const standings = await loadTournamentStandings(tournament.id);
    const botRow = standings.find((row) => row.isBot);
    const humanRow = standings.find((row) => row.userId === testUsers.player);
    expect(botRow?.isBot).toBe(true);
    expect(humanRow?.isBot).toBe(false);
  });

  it("returns empty tournament stats for bot user ids", async () => {
    const stats = await getUserTournamentStats(getTournamentBotUserId("chaos_carl"));
    expect(stats.tournamentsPlayed).toBe(0);
    expect(stats.tournamentWins).toBe(0);
  });
});
