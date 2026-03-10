import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { handHistoryRouter } from "../HandHistoryRouter.js";
import { createTestUser, createAuthToken, cleanupTestUsers } from "../../__tests__/testUtils.js";

describe("Hand History Payout Integrity", () => {
  const prisma = getPrisma();
  let server: http.Server;
  let baseUrl: string;

  let heroUser: { id: string; username: string | null };
  let villainUser: { id: string; username: string | null };
  let heroToken: string;

  let tableId: string;
  let heroPlayerId: string;
  let villainPlayerId: string;
  let payoutHandId: string;
  let zeroPayoutHandId: string;

  async function get(path: string, token: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
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

    heroUser = await createTestUser(`history-payout-hero-${nanoid(6)}`);
    villainUser = await createTestUser(`history-payout-villain-${nanoid(6)}`);
    heroToken = await createAuthToken(heroUser.id);

    tableId = `table_${nanoid(8)}`;
    await prisma.pokerTable.create({
      data: { id: tableId, name: "History Payout Table", maxSeats: 6 },
    });

    const heroPlayer = await prisma.pokerPlayer.create({
      data: {
        tableId,
        externalId: heroUser.id,
        userId: heroUser.id,
        displayName: heroUser.username ?? "hero",
        seat: 0,
      },
    });
    heroPlayerId = heroPlayer.id;

    const villainPlayer = await prisma.pokerPlayer.create({
      data: {
        tableId,
        externalId: villainUser.id,
        userId: villainUser.id,
        displayName: villainUser.username ?? "villain",
        seat: 1,
      },
    });
    villainPlayerId = villainPlayer.id;

    payoutHandId = `hand_${nanoid(10)}`;
    await prisma.hand.create({
      data: {
        id: payoutHandId,
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
              playerId: heroPlayerId,
              seat: 0,
              startingStackCents: 5000,
              endingStackCents: 5600,
              holeCardsJson: ["As", "Ad"],
            },
            {
              id: nanoid(),
              playerId: villainPlayerId,
              seat: 1,
              startingStackCents: 5000,
              endingStackCents: 4400,
              holeCardsJson: ["Kh", "Kd"],
            },
          ],
        },
      },
    });

    await prisma.handPayout.createMany({
      data: [
        { id: nanoid(), handId: payoutHandId, playerId: heroPlayerId, payoutIndex: 0, amountCents: 600 },
        { id: nanoid(), handId: payoutHandId, playerId: villainPlayerId, payoutIndex: 1, amountCents: 400 },
      ],
    });

    await prisma.balanceTransaction.createMany({
      data: [
        {
          id: nanoid(),
          tableId,
          userId: heroUser.id,
          handId: payoutHandId,
          amountCents: 600,
          type: "PAYOUT",
        },
        {
          id: nanoid(),
          tableId,
          userId: villainUser.id,
          handId: payoutHandId,
          amountCents: 400,
          type: "PAYOUT",
        },
      ],
    });

    zeroPayoutHandId = `hand_${nanoid(10)}`;
    await prisma.hand.create({
      data: {
        id: zeroPayoutHandId,
        tableId,
        dealerSeat: 1,
        smallBlindCents: 50,
        bigBlindCents: 100,
        endedAt: new Date(),
        reason: "SHOWDOWN",
        boardJson: ["2h", "3d", "4c", "5s", "6h"],
        players: {
          create: [
            {
              id: nanoid(),
              playerId: heroPlayerId,
              seat: 0,
              startingStackCents: 5000,
              endingStackCents: 5000,
              holeCardsJson: ["7s", "8s"],
            },
            {
              id: nanoid(),
              playerId: villainPlayerId,
              seat: 1,
              startingStackCents: 5000,
              endingStackCents: 5000,
              holeCardsJson: ["9h", "Th"],
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.balanceTransaction.deleteMany({ where: { handId: { in: [payoutHandId, zeroPayoutHandId] } } });
    await prisma.handPayout.deleteMany({ where: { handId: { in: [payoutHandId, zeroPayoutHandId] } } });
    await prisma.handAction.deleteMany({ where: { handId: { in: [payoutHandId, zeroPayoutHandId] } } });
    await prisma.handPlayer.deleteMany({ where: { handId: { in: [payoutHandId, zeroPayoutHandId] } } });
    await prisma.hand.deleteMany({ where: { id: { in: [payoutHandId, zeroPayoutHandId] } } });
    await prisma.pokerPlayer.deleteMany({ where: { id: { in: [heroPlayerId, villainPlayerId] } } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });
    await cleanupTestUsers();
  });

  it("should ensure payout sums match pot integrity", async () => {
    const response = await get(`/api/history/hands/${payoutHandId}`, heroToken);
    expect(response.status).toBe(200);

    const handDetail = await response.json();
    const totalPayouts = handDetail.payouts.reduce((sum: number, payout: { amountCents: number }) => {
      return sum + payout.amountCents;
    }, 0);

    expect(totalPayouts).toBe(1000);
    handDetail.payouts.forEach((payout: { amountCents: number; userId: string; displayName: string }) => {
      expect(payout.amountCents).toBeGreaterThan(0);
      expect(payout.userId).toBeTruthy();
      expect(payout.displayName).toBeTruthy();
    });
  });

  it("should maintain payout consistency with SettlementService", async () => {
    const response = await get(`/api/history/hands/${payoutHandId}`, heroToken);
    expect(response.status).toBe(200);
    const handDetail = await response.json();

    const transactions = await prisma.balanceTransaction.findMany({
      where: { handId: payoutHandId, type: "PAYOUT" },
    });

    const transactionTotal = transactions.reduce((sum, tx) => sum + tx.amountCents, 0);
    const historyTotal = handDetail.payouts.reduce((sum: number, payout: { amountCents: number }) => {
      return sum + payout.amountCents;
    }, 0);

    expect(transactionTotal).toBe(historyTotal);
    for (const tx of transactions) {
      const matchingPayout = handDetail.payouts.find((p: { userId: string; amountCents: number }) => {
        return p.userId === tx.userId && p.amountCents === tx.amountCents;
      });
      expect(matchingPayout).toBeDefined();
    }
  });

  it("should handle zero-payout hands correctly", async () => {
    const response = await get(`/api/history/hands/${zeroPayoutHandId}`, heroToken);
    expect(response.status).toBe(200);

    const handDetail = await response.json();
    expect(Array.isArray(handDetail.payouts)).toBe(true);
    expect(handDetail.payouts.length).toBe(0);
    expect(handDetail.reason).toBeTruthy();
  });
});

