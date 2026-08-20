import { afterAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { SIDE_BET_CATALOG_BY_KEY, SIDE_BET_MAX_STAKE_FLOOR_CENTS } from "@poker-champ/realtime-contract";
import { PlayerInteractionService, SIDE_BET_STAKE_OUT_OF_BOUNDS, DAILY_PAIR_CAP_EXCEEDED } from "../PlayerInteractionService.js";

/**
 * Verifies against the real dev DB (not a mocked Prisma) the parts of the side-bet UX overhaul
 * that are pure economic/resolution logic, independent of the WS/router layer:
 *  - stake bounds on a penny-BB table actually hit the new $1 ceiling floor while the minimum
 *    stays BB-relative
 *  - the daily per-pair cap's matching $5 floor
 *  - a bot recipient's affordability check (the fix for "bot sits PENDING until it silently
 *    expires")
 *  - resolutionNote text for each of the four catalog condition kinds, via directly persisted
 *    Hand/HandPlayer/HandAction/HandPayout fixtures (resolveSideBetsForHand is DB-driven by
 *    design, so this exercises the exact same read path production hand-end uses)
 */

const runId = nanoid(6);
const userIds: string[] = [];
const tableIds: string[] = [];
const handIds: string[] = [];
const playerIds: string[] = [];

async function makeUser(prefix: string, bankrollCents = 100_000) {
  const prisma = getPrisma();
  const id = `${prefix}_${nanoid(6)}_${runId}`;
  await prisma.user.create({
    data: { id, email: `${id}@sidebet-ux.test`, passwordHash: "hash", displayName: id, bankrollCents },
  });
  userIds.push(id);
  return id;
}

async function makeTable() {
  const prisma = getPrisma();
  const id = `table_sidebet_ux_${nanoid(6)}_${runId}`;
  await prisma.pokerTable.create({ data: { id, name: "Side Bet UX Test Table" } });
  tableIds.push(id);
  return id;
}

async function makePokerPlayer(tableId: string, userId: string, seat: number) {
  const prisma = getPrisma();
  const player = await prisma.pokerPlayer.create({
    data: { externalId: userId, userId, tableId, seat, displayName: userId },
  });
  playerIds.push(player.id);
  return player.id;
}

/** A completed 2-subject hand: subjectA's PokerPlayer gets `payoutA`, subjectB gets `payoutB`. */
async function makeHand(params: {
  tableId: string;
  bigBlindCents: number;
  reason: "SHOWDOWN" | "LAST_PLAYER";
  board: string[];
  subjects?: { playerId: string; holeCards: string[]; payoutCents: number }[];
  folds?: { playerId: string; actionIndex: number }[];
}) {
  const prisma = getPrisma();
  const { tableId, bigBlindCents, reason, board, subjects = [], folds = [] } = params;
  const id = `hand_sidebet_ux_${nanoid(6)}_${runId}`;
  await prisma.hand.create({
    data: {
      id,
      tableId,
      dealerSeat: 0,
      smallBlindCents: Math.max(1, Math.round(bigBlindCents / 2)),
      bigBlindCents,
      reason,
      boardJson: board,
      endedAt: new Date(),
    },
  });
  handIds.push(id);

  for (const [i, s] of subjects.entries()) {
    await prisma.handPlayer.create({
      data: {
        id: `${id}_hp_${i}`,
        handId: id,
        playerId: s.playerId,
        seat: i,
        startingStackCents: 10_000,
        holeCardsJson: s.holeCards,
      },
    });
    if (s.payoutCents > 0) {
      await prisma.handPayout.create({
        data: { id: `${id}_payout_${i}`, handId: id, playerId: s.playerId, payoutIndex: i, amountCents: s.payoutCents },
      });
    }
  }

  for (const [i, f] of folds.entries()) {
    await prisma.handAction.create({
      data: {
        id: `${id}_action_${i}`,
        handId: id,
        playerId: f.playerId,
        seat: i,
        actionIndex: f.actionIndex,
        street: "PREFLOP",
        action: "FOLD",
      },
    });
  }

  return id;
}

async function makeActiveSideBet(params: {
  tableId: string;
  handId: string;
  catalogKey: string;
  initiatorId: string;
  recipientId: string;
  stakeCents: number;
  subjectUserIds?: [string, string];
  predictedSubjectUserId?: string;
}) {
  const prisma = getPrisma();
  const id = `sidebet_ux_${nanoid(6)}_${runId}`;
  await prisma.playerInteraction.create({
    data: {
      id,
      type: "SIDE_BET",
      status: "ACTIVE",
      catalogKey: params.catalogKey,
      tableId: params.tableId,
      handId: params.handId,
      initiatorId: params.initiatorId,
      recipientId: params.recipientId,
      stakeCents: params.stakeCents,
      metadata: { subjectUserIds: params.subjectUserIds, predictedSubjectUserId: params.predictedSubjectUserId },
      externalRef: `sidebet_ux:${id}`,
    },
  });
  return id;
}

describe("side bet UX overhaul — real-DB verification", () => {
  afterAll(async () => {
    const prisma = getPrisma();
    if (handIds.length) {
      await prisma.handPayout.deleteMany({ where: { handId: { in: handIds } } });
      await prisma.handAction.deleteMany({ where: { handId: { in: handIds } } });
      await prisma.handPlayer.deleteMany({ where: { handId: { in: handIds } } });
      await prisma.playerInteraction.deleteMany({ where: { handId: { in: handIds } } });
      await prisma.hand.deleteMany({ where: { id: { in: handIds } } });
    }
    await prisma.playerInteraction.deleteMany({ where: { tableId: { in: tableIds } } });
    if (playerIds.length) await prisma.pokerPlayer.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    if (tableIds.length) await prisma.pokerTable.deleteMany({ where: { id: { in: tableIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("stake bound on a 1-cent-BB table: minimum stays BB-relative, ceiling hits the $1 floor", async () => {
    const initiatorId = await makeUser("stake_min");
    const recipientId = await makeUser("stake_min_r");
    const tableId = await makeTable();
    const bigBlindCents = 1; // penny-stakes table — this is exactly the "why only 5 cents" report
    const entry = SIDE_BET_CATALOG_BY_KEY.get("sidebet.river_rat")!;
    expect(entry.maxStakeBigBlinds * bigBlindCents).toBe(5); // the raw BB-relative cap really is 5 cents here
    // Not exercising resolution here — a real Hand row just to satisfy the FK.
    const handId = await makeHand({ tableId, bigBlindCents, reason: "SHOWDOWN", board: [] });

    // Minimum: still exactly 1 BB = 1 cent (must NOT be floored up to $1).
    const min = await PlayerInteractionService.proposeSideBet({
      initiatorId,
      recipientId,
      tableId,
      handId,
      catalogKey: entry.id,
      stakeCents: 1,
      bigBlindCents,
      clientRequestId: nanoid(8),
    });
    expect(min.stakeCents).toBe(1);

    // Ceiling: $1.00 (100 cents) must be ACCEPTED even though raw 5 BB = 5 cents.
    const maxOk = await PlayerInteractionService.proposeSideBet({
      initiatorId,
      recipientId,
      tableId,
      handId,
      catalogKey: entry.id,
      stakeCents: SIDE_BET_MAX_STAKE_FLOOR_CENTS,
      bigBlindCents,
      clientRequestId: nanoid(8),
    });
    expect(maxOk.stakeCents).toBe(100);

    // One cent over the floor must be REJECTED.
    await expect(
      PlayerInteractionService.proposeSideBet({
        initiatorId,
        recipientId,
        tableId,
        handId,
        catalogKey: entry.id,
        stakeCents: SIDE_BET_MAX_STAKE_FLOOR_CENTS + 1,
        bigBlindCents,
        clientRequestId: nanoid(8),
      }),
    ).rejects.toThrow(SIDE_BET_STAKE_OUT_OF_BOUNDS);
  });

  it("daily per-pair cap on a penny-BB table floors at $5, consistent with the $1 stake ceiling", async () => {
    const initiatorId = await makeUser("cap");
    const recipientId = await makeUser("cap_r");
    const tableId = await makeTable();
    const bigBlindCents = 1;
    const entry = SIDE_BET_CATALOG_BY_KEY.get("sidebet.river_rat")!;
    const handId = await makeHand({ tableId, bigBlindCents, reason: "SHOWDOWN", board: [] });

    // 5 x $1.00 = $5.00 exactly at the floor — every one of these must succeed.
    for (let i = 0; i < 5; i++) {
      const result = await PlayerInteractionService.proposeSideBet({
        initiatorId,
        recipientId,
        tableId,
        handId,
        catalogKey: entry.id,
        stakeCents: SIDE_BET_MAX_STAKE_FLOOR_CENTS,
        bigBlindCents,
        clientRequestId: nanoid(8),
      });
      expect(result.stakeCents).toBe(100);
    }

    // The 6th $1.00 bet would push the pair to $6.00 for the day — must be rejected.
    await expect(
      PlayerInteractionService.proposeSideBet({
        initiatorId,
        recipientId,
        tableId,
        handId,
        catalogKey: entry.id,
        stakeCents: SIDE_BET_MAX_STAKE_FLOOR_CENTS,
        bigBlindCents,
        clientRequestId: nanoid(8),
      }),
    ).rejects.toThrow(DAILY_PAIR_CAP_EXCEEDED);
  });

  it("bot recipient affordability: zero-bankroll bot cannot afford, funded bot can", async () => {
    const initiatorId = await makeUser("bot_affordability_init");
    const botId = await makeUser("bot_affordability_bot", 0); // mirrors ensureCashTableBotUser's bankrollCents: 0
    const tableId = await makeTable();
    const entry = SIDE_BET_CATALOG_BY_KEY.get("sidebet.river_rat")!;
    const stakeCents = 200;
    const handId = await makeHand({ tableId, bigBlindCents: 50, reason: "SHOWDOWN", board: [] });

    const offer = await PlayerInteractionService.proposeSideBet({
      initiatorId,
      recipientId: botId,
      tableId,
      handId,
      catalogKey: entry.id,
      stakeCents,
      bigBlindCents: 50,
      clientRequestId: nanoid(8),
    });

    const insolvent = await PlayerInteractionService.getRecipientAffordability(offer.interactionId, botId);
    expect(insolvent).not.toBeNull();
    expect(insolvent!.canAfford).toBe(false);
    expect(insolvent!.spendableCents).toBe(0);
    expect(insolvent!.exposureCents).toBe(stakeCents);

    // Fund the bot (what a real gift's CashierService.creditUser would do) to exactly cover it.
    await getPrisma().user.update({ where: { id: botId }, data: { bankrollCents: stakeCents } });
    const solvent = await PlayerInteractionService.getRecipientAffordability(offer.interactionId, botId);
    expect(solvent!.canAfford).toBe(true);

    // And the actual accept path succeeds now, same as a real RESPOND_SIDE_BET would exercise.
    const accepted = await PlayerInteractionService.respondSideBet({
      interactionId: offer.interactionId,
      recipientId: botId,
      accept: true,
      bigBlindCents: 50,
      clientRequestId: nanoid(8),
    });
    expect(accepted.status).toBe("ACTIVE");
  });

  it("initiator cancellation flips a PENDING offer to CANCELLED and reports both ids for broadcast", async () => {
    // The router broadcasts SIDE_BET_UPDATE to both initiatorId and recipientId off exactly
    // these returned fields (PokerRoomMessageRouter.ts's CANCEL_SIDE_BET handler) — this proves
    // the state transition and the ids the recipient's toast keys off are both correct.
    const initiatorId = await makeUser("cancel_init");
    const recipientId = await makeUser("cancel_recip");
    const tableId = await makeTable();
    const entry = SIDE_BET_CATALOG_BY_KEY.get("sidebet.river_rat")!;
    const handId = await makeHand({ tableId, bigBlindCents: 50, reason: "SHOWDOWN", board: [] });

    const offer = await PlayerInteractionService.proposeSideBet({
      initiatorId,
      recipientId,
      tableId,
      handId,
      catalogKey: entry.id,
      stakeCents: 150,
      bigBlindCents: 50,
      clientRequestId: nanoid(8),
    });

    const cancelled = await PlayerInteractionService.cancelSideBet({
      interactionId: offer.interactionId,
      initiatorId,
      clientRequestId: nanoid(8),
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.initiatorId).toBe(initiatorId);
    expect(cancelled.recipientId).toBe(recipientId);

    // A late RESPOND_SIDE_BET after cancellation must not resurrect it (CAS guard).
    const lateResponse = await PlayerInteractionService.respondSideBet({
      interactionId: offer.interactionId,
      recipientId,
      accept: true,
      bigBlindCents: 50,
      clientRequestId: nanoid(8),
    });
    expect(lateResponse.status).toBe("CANCELLED");
    expect(lateResponse.alreadyProcessed).toBe(true);
  });

  it("an unanswered PENDING offer is swept to EXPIRED, distinct from DECLINED", async () => {
    const initiatorId = await makeUser("expiry_init");
    const recipientId = await makeUser("expiry_recip");
    const tableId = await makeTable();
    const entry = SIDE_BET_CATALOG_BY_KEY.get("sidebet.river_rat")!;
    const handId = await makeHand({ tableId, bigBlindCents: 50, reason: "SHOWDOWN", board: [] });

    const offer = await PlayerInteractionService.proposeSideBet({
      initiatorId,
      recipientId,
      tableId,
      handId,
      catalogKey: entry.id,
      stakeCents: 150,
      bigBlindCents: 50,
      clientRequestId: nanoid(8),
    });

    // Force it past its TTL without waiting the real 30s — same effect as time passing.
    await getPrisma().playerInteraction.update({
      where: { id: offer.interactionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const swept = await PlayerInteractionService.sweepStaleSideBets();
    expect(swept.expired).toBeGreaterThanOrEqual(1);

    const row = await getPrisma().playerInteraction.findUniqueOrThrow({ where: { id: offer.interactionId } });
    expect(row.status).toBe("EXPIRED");

    // A late response after expiry must not resurrect it either (same CAS guard as cancellation).
    const lateResponse = await PlayerInteractionService.respondSideBet({
      interactionId: offer.interactionId,
      recipientId,
      accept: false,
      bigBlindCents: 50,
      clientRequestId: nanoid(8),
    });
    expect(lateResponse.status).toBe("EXPIRED"); // not DECLINED — the two stay distinct
    expect(lateResponse.alreadyProcessed).toBe(true);
  });

  it("resolutionNote for WINNER_IS (Coin Flip): names the winning subject, not a generic label", async () => {
    const initiatorId = await makeUser("winner_is_init");
    const recipientId = await makeUser("winner_is_recip");
    const subjectAUserId = await makeUser("winner_is_subjA");
    const subjectBUserId = await makeUser("winner_is_subjB");
    const tableId = await makeTable();
    const subjectAPlayerId = await makePokerPlayer(tableId, subjectAUserId, 0);
    const subjectBPlayerId = await makePokerPlayer(tableId, subjectBUserId, 1);

    const handId = await makeHand({
      tableId,
      bigBlindCents: 50,
      reason: "SHOWDOWN",
      board: ["Ah", "Kd", "2c", "7s", "9h"],
      subjects: [
        { playerId: subjectAPlayerId, holeCards: ["2h", "2d"], payoutCents: 500 }, // A wins
        { playerId: subjectBPlayerId, holeCards: ["3h", "3d"], payoutCents: 0 },
      ],
    });

    const betId = await makeActiveSideBet({
      tableId,
      handId,
      catalogKey: "sidebet.coin_flip",
      initiatorId,
      recipientId,
      stakeCents: 200,
      subjectUserIds: [subjectAUserId, subjectBUserId],
      predictedSubjectUserId: subjectAUserId, // initiator picked A, A wins -> initiator wins
    });

    const results = await PlayerInteractionService.resolveSideBetsForHand(tableId, handId);
    const result = results.find((r) => r.interactionId === betId)!;
    expect(result.winnerId).toBe(initiatorId);
    expect(result.resolutionNote).toMatch(/first subject won the pot/i);
  });

  it("resolutionNote for LOSER_HAND_RANK_AT_LEAST (Bad Beat Bounty): names the actual hand rank", async () => {
    const initiatorId = await makeUser("bad_beat_init");
    const recipientId = await makeUser("bad_beat_recip");
    const subjectAUserId = await makeUser("bad_beat_subjA");
    const subjectBUserId = await makeUser("bad_beat_subjB");
    const tableId = await makeTable();
    const subjectAPlayerId = await makePokerPlayer(tableId, subjectAUserId, 0);
    const subjectBPlayerId = await makePokerPlayer(tableId, subjectBUserId, 1);

    // Board + hole cards: A holds two pair (Aces & Kings) and loses to B's three of a kind.
    const handId = await makeHand({
      tableId,
      bigBlindCents: 50,
      reason: "SHOWDOWN",
      board: ["Ac", "Kc", "2h", "3s", "4d"],
      subjects: [
        { playerId: subjectAPlayerId, holeCards: ["Ah", "Kd"], payoutCents: 0 }, // loses: two pair (Aces & Kings)
        { playerId: subjectBPlayerId, holeCards: ["2d", "2s"], payoutCents: 500 }, // wins: trip 2s (2d/2s + board 2h)
      ],
    });

    const betId = await makeActiveSideBet({
      tableId,
      handId,
      catalogKey: "sidebet.bad_beat_bounty",
      initiatorId,
      recipientId,
      stakeCents: 200,
      subjectUserIds: [subjectAUserId, subjectBUserId],
    });

    const results = await PlayerInteractionService.resolveSideBetsForHand(tableId, handId);
    const result = results.find((r) => r.interactionId === betId)!;
    expect(result.winnerId).toBe(initiatorId); // loser (A) qualified with two pair -> initiator's "yes" side wins
    expect(result.resolutionNote).toMatch(/loser held two pair/i);
    expect(result.resolutionNote).toMatch(/qualifies/i);
  });

  it("resolutionNote for REACHED_SHOWDOWN (River Rat): states whether the hand reached showdown", async () => {
    const initiatorId = await makeUser("river_rat_init");
    const recipientId = await makeUser("river_rat_recip");
    const tableId = await makeTable();

    const handId = await makeHand({ tableId, bigBlindCents: 50, reason: "SHOWDOWN", board: ["Ah", "Kd", "2c", "7s", "9h"] });

    const betId = await makeActiveSideBet({
      tableId,
      handId,
      catalogKey: "sidebet.river_rat",
      initiatorId,
      recipientId,
      stakeCents: 150,
    });

    const results = await PlayerInteractionService.resolveSideBetsForHand(tableId, handId);
    const result = results.find((r) => r.interactionId === betId)!;
    expect(result.winnerId).toBe(initiatorId); // initiator is always the "yes, it reached showdown" side
    expect(result.resolutionNote).toMatch(/hand reached showdown/i);
  });

  it("resolutionNote for FOLD_ORDER (First to Fold): names which subject folded first", async () => {
    const initiatorId = await makeUser("fold_order_init");
    const recipientId = await makeUser("fold_order_recip");
    const subjectAUserId = await makeUser("fold_order_subjA");
    const subjectBUserId = await makeUser("fold_order_subjB");
    const tableId = await makeTable();
    const subjectAPlayerId = await makePokerPlayer(tableId, subjectAUserId, 0);
    const subjectBPlayerId = await makePokerPlayer(tableId, subjectBUserId, 1);

    const handId = await makeHand({
      tableId,
      bigBlindCents: 50,
      reason: "LAST_PLAYER",
      board: [],
      subjects: [
        { playerId: subjectAPlayerId, holeCards: ["2h", "2d"], payoutCents: 0 },
        { playerId: subjectBPlayerId, holeCards: ["3h", "3d"], payoutCents: 500 },
      ],
      folds: [{ playerId: subjectAPlayerId, actionIndex: 0 }],
    });

    const betId = await makeActiveSideBet({
      tableId,
      handId,
      catalogKey: "sidebet.first_to_fold",
      initiatorId,
      recipientId,
      stakeCents: 150,
      subjectUserIds: [subjectAUserId, subjectBUserId],
      predictedSubjectUserId: subjectBUserId, // initiator predicted B folds first; A actually folded first -> initiator loses
    });

    const results = await PlayerInteractionService.resolveSideBetsForHand(tableId, handId);
    const result = results.find((r) => r.interactionId === betId)!;
    expect(result.winnerId).toBe(recipientId);
    expect(result.resolutionNote).toMatch(/first subject folded first/i);
  });
});
