/**
 * Validates the hand-history persistence pipe round-trip:
 * ensureTableAndPlayers -> startHand -> endHand produces a Hand that is
 * queryable by userId (so overview/hands API will return it).
 *
 * Single path: no redundant or alternate writers. Game code must call
 * 1) ensureTableAndPlayers(fullRoster) before any hand,
 * 2) startHand when a hand starts,
 * 3) recordAction / recordPayout during the hand,
 * 4) endHand when the hand completes (via SettlementService.finalizePersistedHand).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "../../../db/prisma.js";
import { HandHistoryService } from "../HandHistoryService.js";
import { createTestUser, cleanupTestUsers } from "../../../__tests__/testUtils.js";

describe("HandHistoryService round-trip", () => {
  const prisma = getPrisma();
  let userId: string;
  let tableId: string;
  let handId: string;
  let service: HandHistoryService;

  beforeAll(async () => {
    const user = await createTestUser("history-roundtrip");
    userId = user.id;
    tableId = `table_${nanoid(8)}`;
    handId = `hand_${nanoid(10)}`;
    service = new HandHistoryService(prisma, tableId);
  });

  afterAll(async () => {
    await prisma.handPayout.deleteMany({ where: { handId } });
    await prisma.handAction.deleteMany({ where: { handId } });
    await prisma.handPlayer.deleteMany({ where: { handId } });
    await prisma.hand.deleteMany({ where: { id: handId } });
    await prisma.pokerPlayer.deleteMany({ where: { tableId } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });
    await cleanupTestUsers();
  });

  it("ensureTableAndPlayers -> startHand -> endHand produces hand queryable by userId", async () => {
    const botId = `bot_${nanoid(8)}`;
    const humanName = "Human";
    const botName = "Bot";

    await service.ensureTableAndPlayers([
      { id: userId, name: humanName, seat: 0, userId },
      { id: botId, name: botName, seat: 1, userId: null },
    ]);

    await service.startHand({
      tableId,
      handId,
      dealerSeat: 0,
      smallBlindCents: 100,
      bigBlindCents: 200,
      players: [
        { id: userId, seat: 0, startingStackCents: 10000, holeCards: ["As", "Kh"] },
        { id: botId, seat: 1, startingStackCents: 10000, holeCards: ["Qd", "Jc"] },
      ],
    });

    await service.endHand({
      tableId,
      handId,
      reason: "SHOWDOWN",
      board: ["Ah", "Kd", "2c"],
      endingStacks: [
        { playerId: userId, endingStackCents: 10200 },
        { playerId: botId, endingStackCents: 9800 },
      ],
    });

    const handsForUser = await prisma.hand.findMany({
      where: {
        id: handId,
        endedAt: { not: null },
        players: { some: { player: { userId } } },
      },
      select: {
        id: true,
        endedAt: true,
        reason: true,
        players: {
          select: {
            playerId: true,
            player: { select: { userId: true, externalId: true } },
          },
        },
      },
    });

    expect(handsForUser.length).toBe(1);
    expect(handsForUser[0]!.endedAt).toBeDefined();
    expect(handsForUser[0]!.reason).toBe("SHOWDOWN");
    const playerUserIds = handsForUser[0]!.players.map((p) => p.player?.userId).filter(Boolean);
    expect(playerUserIds).toContain(userId);
  });
});
