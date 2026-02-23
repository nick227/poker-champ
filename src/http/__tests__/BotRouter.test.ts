import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import * as prismaDb from "../../db/prisma.js";
import { botRouter } from "../BotRouter.js";

const app = express();
app.use(express.json());
app.use("/api/bots", botRouter);

describe("BotRouter", () => {
  let server: http.Server;
  let baseUrl: string;

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /api/bots returns enabled bot summaries only", async () => {
    const response = await fetch(`${baseUrl}/api/bots`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body?.bots)).toBe(true);
    expect(body.bots.length).toBeGreaterThan(0);
    expect(body.bots[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
      }),
    );
    expect(body.bots[0].brainType).toBeUndefined();
  });

  it("GET /api/bots/:id/stats returns defaults when no stats row exists", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ botStats: { findUnique } } as any);

    const response = await fetch(`${baseUrl}/api/bots/nash_nate/stats`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith({ where: { botId: "nash_nate" } });
    expect(body).toEqual({
      bot: {
        id: "nash_nate",
        name: "Nash Nate",
        avatarUrl: undefined,
      },
      stats: {
        botId: "nash_nate",
        handsPlayed: 0,
        netCents: 0,
        grossWonCents: 0,
        grossLostCents: 0,
        updatedAt: null,
      },
    });
  });

  it("GET /api/bots/:id/stats returns 404 for unknown bot ids", async () => {
    const response = await fetch(`${baseUrl}/api/bots/not_a_bot/stats`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Bot not found" });
  });

  it("GET /api/bots/:id/stats maps bigint fields to numbers", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      botId: "nash_nate",
      handsPlayed: 42,
      netCents: BigInt(1500),
      grossWonCents: BigInt(4200),
      grossLostCents: BigInt(2700),
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
    });
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ botStats: { findUnique } } as any);

    const response = await fetch(`${baseUrl}/api/bots/nash_nate/stats`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stats).toEqual({
      botId: "nash_nate",
      handsPlayed: 42,
      netCents: 1500,
      grossWonCents: 4200,
      grossLostCents: 2700,
      updatedAt: "2026-02-23T00:00:00.000Z",
    });
  });
});
