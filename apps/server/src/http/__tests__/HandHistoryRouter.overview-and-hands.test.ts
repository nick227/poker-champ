import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { handHistoryRouter } from "../HandHistoryRouter.js";
import { createTestUser, createAuthToken, cleanupTestUsers } from "../../__tests__/testUtils.js";

const app = express();
app.use(express.json());
app.use("/api/history", handHistoryRouter);

describe("GET /api/history/overview and /api/history/hands", () => {
  const prisma = getPrisma();
  let server: http.Server;
  let baseUrl: string;
  let user: { id: string; username: string | null };
  let opponentUser: { id: string; username: string | null };
  let token: string;
  let tableId: string;
  let pokerPlayerId: string;
  let opponentPokerPlayerId: string;
  let handId: string;
  const handIdsForCleanup: string[] = [];

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
    opponentUser = await createTestUser("history-overview-hands-opponent");
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
        displayName: user.username ?? "testuser",
        seat: 0,
      },
    });
    pokerPlayerId = pokerPlayer.id;
    const opponentPokerPlayer = await prisma.pokerPlayer.create({
      data: {
        tableId,
        externalId: opponentUser.id,
        userId: opponentUser.id,
        displayName: opponentUser.username ?? "villain",
        seat: 1,
      },
    });
    opponentPokerPlayerId = opponentPokerPlayer.id;

    handId = `hand_${nanoid(10)}`;
    handIdsForCleanup.push(handId);
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

    const huStealHandId = `hand_${nanoid(10)}`;
    handIdsForCleanup.push(huStealHandId);
    await prisma.hand.create({
      data: {
        id: huStealHandId,
        tableId,
        dealerSeat: 0,
        smallBlindCents: 100,
        bigBlindCents: 200,
        endedAt: new Date(),
        reason: "LAST_PLAYER",
        boardJson: [],
        players: {
          create: [
            {
              id: nanoid(),
              playerId: pokerPlayerId,
              seat: 0,
              startingStackCents: 10000,
              endingStackCents: 10150,
            },
            {
              id: nanoid(),
              playerId: opponentPokerPlayerId,
              seat: 1,
              startingStackCents: 10000,
              endingStackCents: 9850,
            },
          ],
        },
      },
    });
    await prisma.handAction.createMany({
      data: [
        {
          id: nanoid(),
          handId: huStealHandId,
          playerId: pokerPlayerId,
          seat: 0,
          actionIndex: 0,
          street: "PREFLOP",
          action: "RAISE",
          amountCents: 200,
          potBeforeCents: 0,
          potAfterCents: 300,
        },
        {
          id: nanoid(),
          handId: huStealHandId,
          playerId: opponentPokerPlayerId,
          seat: 1,
          actionIndex: 1,
          street: "PREFLOP",
          action: "FOLD",
          amountCents: 0,
          potBeforeCents: 300,
          potAfterCents: 300,
        },
      ],
    });
    await prisma.handPayout.create({
      data: {
        id: nanoid(),
        handId: huStealHandId,
        playerId: pokerPlayerId,
        payoutIndex: 0,
        amountCents: 300,
      },
    });

    const huFoldBbHandId = `hand_${nanoid(10)}`;
    handIdsForCleanup.push(huFoldBbHandId);
    await prisma.hand.create({
      data: {
        id: huFoldBbHandId,
        tableId,
        dealerSeat: 0,
        smallBlindCents: 100,
        bigBlindCents: 200,
        endedAt: new Date(),
        reason: "LAST_PLAYER",
        boardJson: [],
        players: {
          create: [
            {
              id: nanoid(),
              playerId: pokerPlayerId,
              seat: 1,
              startingStackCents: 10000,
              endingStackCents: 9800,
            },
            {
              id: nanoid(),
              playerId: opponentPokerPlayerId,
              seat: 0,
              startingStackCents: 10000,
              endingStackCents: 10200,
            },
          ],
        },
      },
    });
    await prisma.handAction.createMany({
      data: [
        {
          id: nanoid(),
          handId: huFoldBbHandId,
          playerId: opponentPokerPlayerId,
          seat: 0,
          actionIndex: 0,
          street: "PREFLOP",
          action: "RAISE",
          amountCents: 200,
          potBeforeCents: 0,
          potAfterCents: 300,
        },
        {
          id: nanoid(),
          handId: huFoldBbHandId,
          playerId: pokerPlayerId,
          seat: 1,
          actionIndex: 1,
          street: "PREFLOP",
          action: "FOLD",
          amountCents: 0,
          potBeforeCents: 300,
          potAfterCents: 300,
        },
      ],
    });
    await prisma.handPayout.create({
      data: {
        id: nanoid(),
        handId: huFoldBbHandId,
        playerId: opponentPokerPlayerId,
        payoutIndex: 0,
        amountCents: 300,
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.handPayout.deleteMany({ where: { handId: { in: handIdsForCleanup } } });
    await prisma.handAction.deleteMany({ where: { handId: { in: handIdsForCleanup } } });
    await prisma.handPlayer.deleteMany({ where: { handId: { in: handIdsForCleanup } } });
    await prisma.hand.deleteMany({ where: { id: { in: handIdsForCleanup } } });
    await prisma.pokerPlayer.deleteMany({ where: { id: { in: [pokerPlayerId, opponentPokerPlayerId] } } });
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
    expect(body).toHaveProperty("losingHands");
    expect(body).toHaveProperty("breakEvenHands");
    expect(body).toHaveProperty("winRate");
    expect(body).toHaveProperty("avgProfitPerHandCents");
    expect(body).toHaveProperty("bbPer100");
    expect(body).toHaveProperty("avgPotCents");
    expect(body).toHaveProperty("biggestPotCents");
    expect(body).toHaveProperty("biggestWinCents");
    expect(body).toHaveProperty("biggestLossCents");
    expect(body).toHaveProperty("showdownHands");
    expect(body).toHaveProperty("showdownRate");
    expect(body).toHaveProperty("vpipHands");
    expect(body).toHaveProperty("vpipPct");
    expect(body).toHaveProperty("pfrHands");
    expect(body).toHaveProperty("pfrPct");
    expect(body).toHaveProperty("threeBetHands");
    expect(body).toHaveProperty("threeBetOpportunities");
    expect(body).toHaveProperty("threeBetPct");
    expect(body).toHaveProperty("foldToThreeBetHands");
    expect(body).toHaveProperty("foldToThreeBetOpportunities");
    expect(body).toHaveProperty("foldToThreeBetPct");
    expect(body).toHaveProperty("stealAttempts");
    expect(body).toHaveProperty("stealOpportunities");
    expect(body).toHaveProperty("stealAttemptPct");
    expect(body).toHaveProperty("foldBbToStealHands");
    expect(body).toHaveProperty("foldBbToStealOpportunities");
    expect(body).toHaveProperty("foldBbToStealPct");
    expect(body).toHaveProperty("grossWonCents");
    expect(body).toHaveProperty("grossLostCents");
    expect(body).toHaveProperty("profitFactor");
    expect(typeof body.totalHands).toBe("number");
    expect((body.totalHands as number) >= 1).toBe(true);
    expect(body.stealOpportunities).toBe(1);
    expect(body.stealAttempts).toBe(1);
    expect(body.stealAttemptPct).toBe(100);
    expect(body.foldBbToStealOpportunities).toBe(1);
    expect(body.foldBbToStealHands).toBe(1);
    expect(body.foldBbToStealPct).toBe(100);
  });

  it("GET /api/history/overview computes seeded stat values accurately", async () => {
    const res = await get("/api/history/overview", token);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      totalHands: number;
      totalProfitCents: number;
      winningHands: number;
      losingHands: number;
      breakEvenHands: number;
      winRate: number;
      avgProfitPerHandCents: number;
      bbPer100: number;
      avgPotCents: number;
      biggestPotCents: number;
      biggestWinCents: number;
      biggestLossCents: number;
      showdownHands: number;
      showdownRate: number;
      vpipHands: number;
      vpipPct: number;
      pfrHands: number;
      pfrPct: number;
      threeBetHands: number;
      threeBetOpportunities: number;
      threeBetPct: number;
      foldToThreeBetHands: number;
      foldToThreeBetOpportunities: number;
      foldToThreeBetPct: number;
      stealAttempts: number;
      stealOpportunities: number;
      stealAttemptPct: number;
      foldBbToStealHands: number;
      foldBbToStealOpportunities: number;
      foldBbToStealPct: number;
      grossWonCents: number;
      grossLostCents: number;
      profitFactor: number | null;
    };

    expect(body.totalHands).toBe(3);
    expect(body.totalProfitCents).toBe(150);
    expect(body.winningHands).toBe(2);
    expect(body.losingHands).toBe(1);
    expect(body.breakEvenHands).toBe(0);
    expect(body.winRate).toBeCloseTo(66.6667, 3);
    expect(body.avgProfitPerHandCents).toBeCloseTo(50, 4);
    expect(body.bbPer100).toBeCloseTo(25, 4);
    expect(body.avgPotCents).toBeCloseTo(333.3333, 3);
    expect(body.biggestPotCents).toBe(400);
    expect(body.biggestWinCents).toBe(200);
    expect(body.biggestLossCents).toBe(-200);
    expect(body.showdownHands).toBe(1);
    expect(body.showdownRate).toBeCloseTo(33.3333, 3);
    expect(body.vpipHands).toBe(2);
    expect(body.vpipPct).toBeCloseTo(66.6667, 3);
    expect(body.pfrHands).toBe(1);
    expect(body.pfrPct).toBeCloseTo(33.3333, 3);
    expect(body.threeBetHands).toBe(0);
    expect(body.threeBetOpportunities).toBe(1);
    expect(body.threeBetPct).toBe(0);
    expect(body.foldToThreeBetHands).toBe(0);
    expect(body.foldToThreeBetOpportunities).toBe(0);
    expect(body.foldToThreeBetPct).toBe(0);
    expect(body.stealAttempts).toBe(1);
    expect(body.stealOpportunities).toBe(1);
    expect(body.stealAttemptPct).toBe(100);
    expect(body.foldBbToStealHands).toBe(1);
    expect(body.foldBbToStealOpportunities).toBe(1);
    expect(body.foldBbToStealPct).toBe(100);
    expect(body.grossWonCents).toBe(350);
    expect(body.grossLostCents).toBe(200);
    expect(body.profitFactor).toBeCloseTo(1.75, 6);
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

  it("when overview has totalHands > 0, GET /hands returns same-count shape (no response-shape or post-filter bug)", async () => {
    const overviewRes = await get("/api/history/overview", token);
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as { totalHands: number };
    expect(overview.totalHands).toBeGreaterThan(0);

    const handsRes = await get("/api/history/hands?limit=50", token);
    expect(handsRes.status).toBe(200);
    const raw = await handsRes.json();
    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty("data");
    expect(raw).toHaveProperty("hands");
    expect(raw).toHaveProperty("nextCursor");
    expect(raw.hands).not.toBeNull();
    expect(Array.isArray(raw.hands)).toBe(true);
    expect((raw.hands as unknown[]).length).toBeGreaterThanOrEqual(1);
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

  it("GET /api/history/hands/:id includes snapshots array for replay", async () => {
    const res = await get(`/api/history/hands/${handId}`, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("snapshots");
    expect(Array.isArray(body.snapshots)).toBe(true);
  });

  it("GET /api/history/hands/:id returns 404 for non-existent hand", async () => {
    const res = await get("/api/history/hands/hand_nonexistent123", token);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Hand not found");
  });
});

