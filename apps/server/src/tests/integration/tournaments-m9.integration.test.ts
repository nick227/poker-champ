import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { PokerError } from "../../engine/errors.js";
import { tournamentDirector } from "../../tournaments/TournamentDirector.js";
import { tournamentTableReconciler } from "../../tournaments/TournamentTableReconciler.js";
import { TOURNAMENT_SPECTATOR_READONLY } from "../../tournaments/tournament.errors.js";
import { assertNotTournamentTableSpectator } from "../../tournaments/tournament-table-spectator.js";
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
  admin: `tourney_m9_admin_${testRunId}`,
  playerA: `tourney_m9_a_${testRunId}`,
  playerB: `tourney_m9_b_${testRunId}`,
  outsider: `tourney_m9_out_${testRunId}`,
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

describe("Tournament M9 eliminated spectator", () => {
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
    for (const id of tournamentIds) {
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    const userIds = Object.values(testUsers);
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tournamentRegistration.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    pokerRooms.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    pokerRooms.clear();
    currentUserRole = "USER";
  });

  async function adminCreateTournament(maxPlayers = 2, entryFeeCents = 5000) {
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
    const res = await post("/api/tournaments", {
      name: `M9 ${testRunId}`,
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
    return body as { id: string; entryFeeCents: number };
  }

  async function registerViaApi(tournamentId: string, userId: string) {
    currentUserId = userId;
    currentUserRole = "USER";
    const res = await post(`/api/tournaments/${tournamentId}/register`);
    expect(res.status).toBe(200);
  }

  it("resolveTournamentJoin: active PLAY, eliminated SPECTATE, outsider blocked", async () => {
    const tournament = await adminCreateTournament();
    const prisma = getPrisma();
    await registerViaApi(tournament.id, testUsers.playerA);
    await registerViaApi(tournament.id, testUsers.playerB);
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "RUNNING", startTime: new Date(Date.now() - 60_000) },
    });
    await prisma.tournamentRegistration.update({
      where: {
        tournamentId_userId: { tournamentId: tournament.id, userId: testUsers.playerB },
      },
      data: { finishPlace: 2, eliminatedAt: new Date() },
    });

    const { resolveTournamentJoin, assertTournamentJoinAllowed } = await import(
      "../../tournaments/tournament-join-guard.js"
    );

    await expect(
      resolveTournamentJoin({ tournamentId: tournament.id, userId: testUsers.outsider }),
    ).rejects.toThrow("TOURNAMENT_NOT_REGISTERED");

    const active = await resolveTournamentJoin({ tournamentId: tournament.id, userId: testUsers.playerA });
    expect(active).toMatchObject({ mode: "PLAY", startingStackCents: 8000 });

    const eliminated = await resolveTournamentJoin({ tournamentId: tournament.id, userId: testUsers.playerB });
    expect(eliminated).toMatchObject({ mode: "SPECTATE", finishPlace: 2 });

    await expect(
      assertTournamentJoinAllowed({ tournamentId: tournament.id, userId: testUsers.playerB }),
    ).rejects.toThrow("TOURNAMENT_JOIN_CLOSED");
  });

  it("blocks table actions for eliminated tournament spectators", async () => {
    const tournament = await adminCreateTournament();
    const prisma = getPrisma();
    await registerViaApi(tournament.id, testUsers.playerA);
    await registerViaApi(tournament.id, testUsers.playerB);
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { startTime: new Date(Date.now() - 60_000) },
    });
    await tournamentDirector.processTournament(tournament.id);

    const running = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const room = pokerRooms.get(running.roomId!)!;
    room.state.street = "WAITING";
    const busted = room.state.playersById.get(testUsers.playerB);
    busted!.stackCents = 0;

    await tournamentTableReconciler.reconcileAfterHand({
      tournamentId: tournament.id,
      tableId: running.tableId!,
      roomId: running.roomId!,
      state: room.state,
      tableName: room.state.tableName,
      removeBustedPlayer: (userId) => room.removeTournamentBustedPlayer(userId),
      removePlayerForTableTransfer: (userId) => room.removeTournamentPlayerForTableTransfer(userId),
      onOverlayUpdated: () => {},
      onPlayEnded: () => {},
      onTableBreaking: () => {},
      onHandForHandHold: () => {},
      onHandForHandRelease: () => {},
    });

    expect(room.state.playersById.has(testUsers.playerB)).toBe(false);
    expect(room.state.playersById.has(testUsers.playerA)).toBe(true);

    let caught: PokerError | null = null;
    try {
      assertNotTournamentTableSpectator({
        tournamentId: tournament.id,
        hasPlayer: (userId) => room.state.playersById.has(userId),
        userId: testUsers.playerB,
      });
    } catch (err) {
      caught = err instanceof PokerError ? err : null;
    }
    expect(caught?.code).toBe(TOURNAMENT_SPECTATOR_READONLY);

    expect(() =>
      assertNotTournamentTableSpectator({
        tournamentId: tournament.id,
        hasPlayer: (userId) => room.state.playersById.has(userId),
        userId: testUsers.playerA,
      }),
    ).not.toThrow();
  });
});
