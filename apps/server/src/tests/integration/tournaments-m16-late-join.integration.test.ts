import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentEntryExternalRef } from "../../tournaments/tournament.constants.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
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

const hasDatabase = Boolean(process.env.DATABASE_URL);

const testRunId = nanoid(6);
const testUsers = {
  admin: `tourney_m16_admin_${testRunId}`,
  humanA: `tourney_m16_a_${testRunId}`,
  humanB: `tourney_m16_b_${testRunId}`,
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

describe.skipIf(!hasDatabase)("Tournament M16 late join and orphan protection", () => {
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
    currentUserRole = "USER";
    await getPrisma().user.updateMany({
      where: { id: { in: Object.values(testUsers) } },
      data: { bankrollCents: 100_000 },
    });
  });

  async function createBotFillTournament() {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const res = await post("/api/tournaments", {
      name: `M16 Bot Fill ${testRunId}`,
      entryFeeCents: 5000,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      maxPlayers: 6,
      startingStackCents: 8000,
      blindStructureId: "standard_8min",
      lateRegMinutes: 60,
      fillBotsAtStart: true,
      fillBotCount: 2,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    tournamentIds.push(body.id);
    return body as { id: string };
  }

  async function registerUser(tournamentId: string, userId: string, entryFeeCents = 5000) {
    await CashierService.processTournamentRegister({
      userId,
      tournamentId,
      entryFeeCents,
      externalRef: tournamentEntryExternalRef(tournamentId, userId),
    });
  }

  async function startTournament(tournamentId: string) {
    const prisma = getPrisma();
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { startTime: new Date(Date.now() - 60_000) },
    });
    await tournamentDirector.processTournament(tournamentId);
  }

  async function captureSnapshot(room: PokerRoom, userId: string): Promise<TableSnapshotPayload | null> {
    let payload: TableSnapshotPayload | null = null;
    room.dealerRef.bindClient(userId, {
      send: (_type: string, message: TableSnapshotPayload) => {
        payload = message;
      },
    } as never);
    await room.dealerRef.emitSnapshotToUser(userId, "JOIN");
    return payload;
  }

  it("director tick does not finish a healthy RUNNING bot-fill tournament", async () => {
    const prisma = getPrisma();
    const tournament = await createBotFillTournament();
    await registerUser(tournament.id, testUsers.humanA);
    await startTournament(tournament.id);

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.status).toBe("RUNNING");
    expect(running.roomId).toBeTruthy();

    await tournamentDirector.tick();

    const afterTick = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterTick.status).toBe("RUNNING");
    expect(afterTick.finishedAt).toBeNull();
  });

  it("human ensure-table join on RUNNING bot-fill stays RUNNING with live overlay", async () => {
    const prisma = getPrisma();
    const tournament = await createBotFillTournament();
    await registerUser(tournament.id, testUsers.humanA);
    await startTournament(tournament.id);

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const room = pokerRooms.get(running.roomId!)!;

    currentUserId = testUsers.humanA;
    const ensureRes = await post(`/api/tournaments/${tournament.id}/ensure-table`);
    expect(ensureRes.status).toBe(200);
    const ensureBody = await ensureRes.json();
    expect(ensureBody.joinStatus).toMatch(/READY|RESTORED|CREATING_TABLE/);
    expect(ensureBody.tournamentStatus).toBe("RUNNING");

    const afterJoin = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterJoin.status).toBe("RUNNING");
    expect(afterJoin.finishedAt).toBeNull();
    expect(room.state.playersById.has(testUsers.humanA)).toBe(true);

    const snapshot = await captureSnapshot(room, testUsers.humanA);
    expect(snapshot?.table.tournament?.status).not.toBe("FINISHED");
    expect(snapshot?.hero.tournamentViewer?.isEliminated).not.toBe(true);
    expect(snapshot?.hero.tournamentViewer?.isWinner).not.toBe(true);
  });

  it("does not finish bot-only table while registered human has not joined", async () => {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.create({
      data: {
        name: `M16 Bot Only Until Join ${testRunId}`,
        entryFeeCents: 5000,
        startTime: new Date(Date.now() - 60_000),
        maxPlayers: 6,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 60,
        fillBotsAtStart: true,
        fillBotCount: 2,
        status: "REGISTERING",
      },
    });
    tournamentIds.push(tournament.id);

    await tournamentDirector.beginLateRegistration(tournament.id);
    const provisioned = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(provisioned.status).toBe("LATE_REG");
    expect(provisioned.roomId).toBeTruthy();

    const room = pokerRooms.get(provisioned.roomId!)!;
    room.state.street = "WAITING";
    const botIds = [...room.state.playersById.values()].filter((p) => p.kind === "BOT").map((p) => p.id);
    expect(botIds.length).toBeGreaterThanOrEqual(2);

    for (const botId of botIds.slice(1)) {
      const bot = room.state.playersById.get(botId);
      if (!bot) continue;
      bot.stackCents = 0;
      await tournamentTableReconciler.reconcileAfterHand({
        tournamentId: tournament.id,
        tableId: provisioned.tableId!,
        roomId: provisioned.roomId!,
        state: room.state,
        tableName: room.state.tableName,
        removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
        onOverlayUpdated: () => {},
        onPlayEnded: () => {},
      });
    }

    const beforeHumanJoin = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(beforeHumanJoin.status).not.toBe("FINISHED");

    await registerUser(tournament.id, testUsers.humanA);
    currentUserId = testUsers.humanA;
    const ensureRes = await post(`/api/tournaments/${tournament.id}/ensure-table`);
    expect(ensureRes.status).toBe(200);
    const ensureBody = await ensureRes.json();
    expect(ensureBody.tournamentStatus).not.toBe("FINISHED");

    const afterHumanJoin = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterHumanJoin.status).not.toBe("FINISHED");
    expect(afterHumanJoin.finishedAt).toBeNull();
    expect(room.state.playersById.has(testUsers.humanA)).toBe(true);
  });

  it("late registrant joins RUNNING tournament via register + ensure-table without finishing", async () => {
    const prisma = getPrisma();
    const tournament = await createBotFillTournament();
    await registerUser(tournament.id, testUsers.humanA);
    await startTournament(tournament.id);

    currentUserId = testUsers.humanB;
    const registerRes = await post(`/api/tournaments/${tournament.id}/register`);
    expect(registerRes.status).toBe(200);

    const ensureRes = await post(`/api/tournaments/${tournament.id}/ensure-table`);
    expect(ensureRes.status).toBe(200);
    const ensureBody = await ensureRes.json();
    expect(ensureBody.tournamentStatus).toBe("RUNNING");
    expect(ensureBody.playerStatus).toBe("ACTIVE");

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.status).toBe("RUNNING");
    expect(running.finishedAt).toBeNull();

    const room = pokerRooms.get(running.roomId!)!;
    expect(room.state.playersById.has(testUsers.humanB)).toBe(true);

    await tournamentDirector.tick();

    const afterTick = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterTick.status).toBe("RUNNING");
  });

  it("orphan reconciler does not finish RUNNING tournament cleared for stale-room restore", async () => {
    const prisma = getPrisma();
    const tournament = await createBotFillTournament();
    await registerUser(tournament.id, testUsers.humanA);
    await startTournament(tournament.id);

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(running.roomId).toBeTruthy();

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { roomId: null, tableId: null },
    });

    await tournamentDirector.reconcileOrphanRunningTournaments();

    const afterOrphan = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(afterOrphan.status).toBe("RUNNING");
    expect(afterOrphan.finishedAt).toBeNull();
  });

  it("GET detail returns RUNNING for active registrant after ensure-table join", async () => {
    const tournament = await createBotFillTournament();
    await registerUser(tournament.id, testUsers.humanA);
    await startTournament(tournament.id);

    currentUserId = testUsers.humanA;
    expect((await post(`/api/tournaments/${tournament.id}/ensure-table`)).status).toBe(200);

    const detailRes = await get(`/api/tournaments/${tournament.id}`);
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.status).toBe("RUNNING");
    expect(detail.playerStatus).toBe("ACTIVE");
  });
});
