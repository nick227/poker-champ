import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "../../db/prisma.js";
import { handHistoryRouter } from "../HandHistoryRouter.js";
import { createTestUser, createAuthToken, cleanupTestUsers } from "../../__tests__/testUtils.js";

const app = express();
app.use(express.json());
app.use("/api/history", handHistoryRouter);

describe("GET /api/history/overview and /api/history/hands", () => {
  const prisma = getPrisma();
  let server: http.Server;
  let baseUrl: string;
  let user: { id: string; username: string };
  let token: string;
  let tableId: string;
  let pokerPlayerId: string;
  let handId: string;

  async function get(path: string, tokenHeader: string | null) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (tokenHeader) headers["Authorization"] = `Bearer ${tokenHeader}`;
    return fetch(`${baseUrl}${path}`, { method: "GET", headers });
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
    user = await createTestUser("history-overview-hands");
    token = await createAuthToken(user.id);

    tableId = `table_${nanoid(8)}`;
    await prisma.pokerTable.create({
      data: { id: tableId, name: "Test Table", maxSeats: 9 },
    });

    const pokerPlayer = await prisma.pokerPlayer.create({
      data: {
        tableId,
        externalId: user.id,
        userId: user.id,
        displayName: user.username,
        seat: 0,
      },
    });
    pokerPlayerId = pokerPlayer.id;

    handId = `hand_${nanoid(10)}`;
    const handCreatedAt = new Date();
    await prisma.hand.create({
      data: {
        id: handId,
        tableId,
        dealerSeat: 0,
        smallBlindCents: 100,
        bigBlindCents: 200,
        endedAt: handCreatedAt,
        reason: "SHOWDOWN",
        boardJson: ["Ah", "Kd", "2c"],
        players: {
          create: {
            id: nanoid(),
            playerId: pokerPlayerId,
            seat: 0,
            startingStackCents: 10000,
            endingStackCents: 10200,
            holeCardsJson: ["As", "Kh"],
          },
        },
      },
    });

    const handPlayer = await prisma.handPlayer.findFirst({
      where: { handId },
      select: { id: true },
    });
    if (!handPlayer) throw new Error("HandPlayer not created");

    await prisma.handAction.create({
      data: {
        id: nanoid(),
        handId,
        playerId: pokerPlayerId,
        seat: 0,
        actionIndex: 0,
        street: "PREFLOP",
        action: "CALL",
        amountCents: 200,
        potBeforeCents: 0,
        potAfterCents: 200,
      },
    });

    await prisma.handPayout.create({
      data: {
        id: nanoid(),
        handId,
        playerId: pokerPlayerId,
        payoutIndex: 0,
        amountCents: 400,
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.handPayout.deleteMany({ where: { handId } });
    await prisma.handAction.deleteMany({ where: { handId } });
    await prisma.handPlayer.deleteMany({ where: { handId } });
    await prisma.hand.deleteMany({ where: { id: handId } });
    await prisma.pokerPlayer.deleteMany({ where: { id: pokerPlayerId } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });
    await cleanupTestUsers();
  });

  it("returns 401 for GET /api/history/overview without token", async () => {
    const res = await get("/api/history/overview", null);
    expect(res.status).toBe(401);
  });

  it("returns 401 for GET /api/history/hands without token", async () => {
    const res = await get("/api/history/hands", null);
    expect(res.status).toBe(401);
  });

  it("GET /api/history/overview returns overview for authenticated user", async () => {
    const res = await get("/api/history/overview", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("totalHands");
    expect(body).toHaveProperty("totalProfitCents");
    expect(body).toHaveProperty("winningHands");
    expect(body).toHaveProperty("winRate");
    expect(body).toHaveProperty("avgPotCents");
    expect(body).toHaveProperty("biggestPotCents");
    expect(typeof body.totalHands).toBe("number");
    expect((body.totalHands as number) >= 1).toBe(true);
  });

  it("GET /api/history/hands returns hands list for authenticated user", async () => {
    const res = await get("/api/history/hands", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hands: Record<string, unknown>[]; nextCursor: string | null };
    expect(body).toHaveProperty("hands");
    expect(body).toHaveProperty("nextCursor");
    expect(Array.isArray(body.hands)).toBe(true);
    expect(body.hands.length).toBeGreaterThanOrEqual(1);
    const first = body.hands[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("playedAt");
    expect(first).toHaveProperty("tableName");
    expect(first).toHaveProperty("netResultCents");
    expect(first).toHaveProperty("bigBlindCents");
    expect(first).toHaveProperty("heroWonCents");
  });

  it("GET /api/history/hands?limit=1 returns at most one hand", async () => {
    const res = await fetch(`${baseUrl}/api/history/hands?limit=1`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hands: unknown[] };
    expect(body.hands.length).toBeLessThanOrEqual(1);
  });

  it("GET /api/history/hands/:id returns hand detail for participant", async () => {
    const res = await get(`/api/history/hands/${handId}`, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(handId);
    expect(body).toHaveProperty("boardCards");
    expect(body).toHaveProperty("bigBlindCents");
    expect(body).toHaveProperty("reason");
    expect(body).toHaveProperty("players");
    expect(body).toHaveProperty("actions");
    expect(body).toHaveProperty("payouts");
    expect(Array.isArray(body.players)).toBe(true);
    expect(Array.isArray(body.actions)).toBe(true);
    expect(Array.isArray(body.payouts)).toBe(true);
  });

  it("GET /api/history/hands/:id returns 404 for non-existent hand", async () => {
    const res = await get("/api/history/hands/hand_nonexistent123", token);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Hand not found");
  });
});
