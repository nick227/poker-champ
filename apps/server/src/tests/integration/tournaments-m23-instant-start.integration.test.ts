import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import { floorToMinute } from "../../tournaments/tournament-schedule.js";
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
  admin: `tourney_m23_admin_${testRunId}`,
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

describe.skipIf(!hasDatabase)("Tournament M23 — instantStart API", () => {
  let server: http.Server;
  let baseUrl: string;
  const tournamentIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    await prisma.user.deleteMany({ where: { id: testUsers.admin } });
    await prisma.user.create({
      data: {
        id: testUsers.admin,
        email: `${testUsers.admin}@tourney.test`,
        passwordHash: "hash",
        displayName: testUsers.admin,
        role: "ADMIN",
        bankrollCents: 100_000,
      },
    });

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
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId } });
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    await prisma.user.deleteMany({ where: { id: testUsers.admin } });
    pokerRooms.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    pokerRooms.clear();
    currentUserId = testUsers.admin;
    currentUserRole = "ADMIN";
  });

  it("POST instantStart opens late registration with startTime floored to now", async () => {
    const beforeMs = Date.now();
    const res = await fetch(`${baseUrl}/api/tournaments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify({
        name: `M23 Instant ${testRunId}`,
        entryFeeCents: 1000,
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        maxPlayers: 9,
        startingStackCents: 8000,
        blindStructureId: "standard_8min",
        lateRegMinutes: 16,
        instantStart: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    tournamentIds.push(body.id);

    const prisma = getPrisma();
    const row = await prisma.tournament.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.status).toBe("LATE_REG");
    expect(row.lateRegMinutes).toBeGreaterThan(0);

    const startMs = row.startTime.getTime();
    const flooredNow = floorToMinute(new Date(beforeMs)).getTime();
    expect(startMs).toBeGreaterThanOrEqual(flooredNow - 60_000);
    expect(startMs).toBeLessThanOrEqual(floorToMinute(new Date()).getTime() + 60_000);
    expect(body.status).toBe("LATE_REG");
  });
});
