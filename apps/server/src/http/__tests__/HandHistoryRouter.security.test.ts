import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { handHistoryRouter } from "../HandHistoryRouter.js";
import { createTestUser, createAuthToken, cleanupTestUsers } from "../../__tests__/testUtils.js";

describe("Hand History Security", () => {
  const prisma = getPrisma();
  let server: http.Server;
  let baseUrl: string;

  let userA: { id: string; username: string | null };
  let userB: { id: string; username: string | null };
  let userAToken: string;
  let userBToken: string;

  let tableId: string;
  let playerAId: string;
  let playerBId: string;
  let sharedHandId: string;
  let userBOnlyHandId: string;

  async function get(path: string, token: string | null) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { method: "GET", headers });
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/history", handHistoryRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    userA = await createTestUser(`history-security-a-${nanoid(6)}`);
    userB = await createTestUser(`history-security-b-${nanoid(6)}`);
    userAToken = await createAuthToken(userA.id);
    userBToken = await createAuthToken(userB.id);

    tableId = `table_${nanoid(8)}`;
    await prisma.pokerTable.create({
      data: { id: tableId, name: "History Security Table", maxSeats: 6 },
    });

    const playerA = await prisma.pokerPlayer.create({
      data: {
        tableId,
        externalId: userA.id,
        userId: userA.id,
        displayName: userA.username ?? "userA",
        seat: 0,
      },
    });
    playerAId = playerA.id;

    const playerB = await prisma.pokerPlayer.create({
      data: {
        tableId,
        externalId: userB.id,
        userId: userB.id,
        displayName: userB.username ?? "userB",
        seat: 1,
      },
    });
    playerBId = playerB.id;

    sharedHandId = `hand_${nanoid(10)}`;
    await prisma.hand.create({
      data: {
        id: sharedHandId,
        tableId,
        dealerSeat: 0,
        smallBlindCents: 50,
        bigBlindCents: 100,
        endedAt: new Date(),
        reason: "SHOWDOWN",
        boardJson: ["Ah", "Kd", "2c", "7s", "9h"],
        players: {
          create: [
            {
              id: nanoid(),
              playerId: playerAId,
              seat: 0,
              startingStackCents: 5000,
              endingStackCents: 5300,
              holeCardsJson: ["As", "Ad"],
            },
            {
              id: nanoid(),
              playerId: playerBId,
              seat: 1,
              startingStackCents: 5000,
              endingStackCents: 4700,
              holeCardsJson: ["Kh", "Kd"],
            },
          ],
        },
      },
    });

    userBOnlyHandId = `hand_${nanoid(10)}`;
    await prisma.hand.create({
      data: {
        id: userBOnlyHandId,
        tableId,
        dealerSeat: 1,
        smallBlindCents: 50,
        bigBlindCents: 100,
        endedAt: new Date(),
        reason: "LAST_PLAYER",
        boardJson: [],
        players: {
          create: {
            id: nanoid(),
            playerId: playerBId,
            seat: 1,
            startingStackCents: 5000,
            endingStackCents: 5050,
            holeCardsJson: ["Qs", "Qd"],
          },
        },
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.handPayout.deleteMany({ where: { handId: { in: [sharedHandId, userBOnlyHandId] } } });
    await prisma.handAction.deleteMany({ where: { handId: { in: [sharedHandId, userBOnlyHandId] } } });
    await prisma.handPlayer.deleteMany({ where: { handId: { in: [sharedHandId, userBOnlyHandId] } } });
    await prisma.hand.deleteMany({ where: { id: { in: [sharedHandId, userBOnlyHandId] } } });
    await prisma.pokerPlayer.deleteMany({ where: { id: { in: [playerAId, playerBId] } } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });
    await cleanupTestUsers();
  });

  it("should prevent User A from fetching hand belonging only to User B", async () => {
    const response = await get(`/api/history/hands/${userBOnlyHandId}`, userAToken);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Hand not found");
  });

  it("should allow User A to fetch hand where A participated", async () => {
    const response = await get(`/api/history/hands/${sharedHandId}`, userAToken);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe(sharedHandId);
    expect(Array.isArray(data.players)).toBe(true);
    expect(Array.isArray(data.actions)).toBe(true);
    expect(Array.isArray(data.payouts)).toBe(true);
  });

  it("should prevent unauthorized access without token", async () => {
    const response = await get(`/api/history/hands/${sharedHandId}`, null);
    expect(response.status).toBe(401);
  });

  it("should return 404 for non-existent hand ID", async () => {
    const fakeHandId = `hand_${nanoid(12)}`;
    const response = await get(`/api/history/hands/${fakeHandId}`, userAToken);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Hand not found");
  });

  it("should validate hand ID max length", async () => {
    const invalidHandId = "x".repeat(192);
    const response = await get(`/api/history/hands/${invalidHandId}`, userAToken);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid hand ID");
  });
});

