import express from "express";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "../db/prisma.js";
import { ReplayFrameService } from "../engine/persistence/ReplayFrameService.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

const HandsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const HandIdSchema = z.object({
  id: z.string().min(1).max(191),
});

// Feature flag for learning reveal mode
const ENABLE_LEARNING_REVEAL = process.env.ENABLE_LEARNING_REVEAL === "true";
const HISTORY_CURSOR_SEPARATOR = "::";
const PREFLOP_VOLUNTARY_ACTIONS = new Set(["CALL", "BET", "RAISE", "ALL_IN"]);
const PREFLOP_AGGRESSIVE_ACTIONS = new Set(["BET", "RAISE", "ALL_IN"]);

router.use(requireAuth);

type OverviewPreflopAction = {
  action: string;
  actionIndex: number;
  amountCents: number;
  seat: number;
  player: { userId: string | null };
};

function nextOccupiedSeat(fromSeat: number, occupiedSet: Set<number>, maxSeats: number): number | null {
  for (let step = 1; step <= maxSeats; step += 1) {
    const seat = (fromSeat + step) % maxSeats;
    if (occupiedSet.has(seat)) return seat;
  }
  return null;
}

function previousOccupiedSeat(fromSeat: number, occupiedSet: Set<number>, maxSeats: number): number | null {
  for (let step = 1; step <= maxSeats; step += 1) {
    const seat = (fromSeat - step + maxSeats) % maxSeats;
    if (occupiedSet.has(seat)) return seat;
  }
  return null;
}

function resolvePositionalSeats(
  occupiedSeats: number[],
  dealerSeat: number,
  maxSeats: number,
): { buttonSeat: number; sbSeat: number; bbSeat: number; coSeat: number | null } | null {
  if (occupiedSeats.length < 2 || maxSeats < 2) return null;

  const occupiedSet = new Set(occupiedSeats);
  const buttonSeat = occupiedSet.has(dealerSeat) ? dealerSeat : occupiedSeats[0]!;
  const isHeadsUp = occupiedSeats.length === 2;
  const sbSeat = isHeadsUp ? buttonSeat : nextOccupiedSeat(buttonSeat, occupiedSet, maxSeats);
  if (sbSeat == null) return null;
  const bbSeat = isHeadsUp ? nextOccupiedSeat(buttonSeat, occupiedSet, maxSeats) : nextOccupiedSeat(sbSeat, occupiedSet, maxSeats);
  if (bbSeat == null) return null;

  let coSeat: number | null = null;
  if (occupiedSeats.length >= 4) {
    const maybeCo = previousOccupiedSeat(buttonSeat, occupiedSet, maxSeats);
    if (maybeCo != null && maybeCo !== sbSeat && maybeCo !== bbSeat) {
      coSeat = maybeCo;
    }
  }

  return { buttonSeat, sbSeat, bbSeat, coSeat };
}

function getPreflopHeroActionStats(params: {
  actions: OverviewPreflopAction[];
  userId: string;
  heroSeat: number;
  occupiedSeats: number[];
  dealerSeat: number;
  maxSeats: number;
}): {
  vpip: boolean;
  pfr: boolean;
  threeBetOpportunity: boolean;
  threeBet: boolean;
  foldToThreeBetOpportunity: boolean;
  foldToThreeBet: boolean;
  stealOpportunity: boolean;
  stealAttempt: boolean;
  foldBbToStealOpportunity: boolean;
  foldBbToSteal: boolean;
} {
  const { actions, userId, heroSeat, occupiedSeats, dealerSeat, maxSeats } = params;
  const preflopActions = [...actions].sort((a, b) => a.actionIndex - b.actionIndex);
  const normalizedMaxSeats = Number.isInteger(maxSeats) && maxSeats > 1
    ? maxSeats
    : Math.max(2, ...occupiedSeats.map((s) => s + 1));
  const positions = resolvePositionalSeats(occupiedSeats, dealerSeat, normalizedMaxSeats);

  const preflopVoluntaryActions = preflopActions.filter(
    (a) => PREFLOP_VOLUNTARY_ACTIONS.has(a.action) && a.amountCents > 0
  );

  const heroActions = preflopActions.filter(
    (a) => a.player?.userId === userId
  );

  const heroVoluntaryActions = heroActions.filter(
    (a) => PREFLOP_VOLUNTARY_ACTIONS.has(a.action) && a.amountCents > 0
  );

  const heroAggressiveActions = heroActions.filter((a) => PREFLOP_AGGRESSIVE_ACTIONS.has(a.action));

  const aggressiveActions = preflopActions.filter(
    (a) => PREFLOP_AGGRESSIVE_ACTIONS.has(a.action) && a.amountCents > 0
  );

  const heroFirstRaise = heroAggressiveActions[0];
  const firstOpponentRaiseBeforeHero = aggressiveActions.find(
    (a) =>
      a.player?.userId !== userId &&
      (heroFirstRaise == null || a.actionIndex < heroFirstRaise.actionIndex)
  );

  let threeBetOpportunity = false;
  let threeBet = false;
  if (firstOpponentRaiseBeforeHero) {
    const heroResponse = heroActions.find((a) => a.actionIndex > firstOpponentRaiseBeforeHero.actionIndex);
    if (heroResponse) {
      threeBetOpportunity = true;
      threeBet = PREFLOP_AGGRESSIVE_ACTIONS.has(heroResponse.action);
    }
  }

  let foldToThreeBetOpportunity = false;
  let foldToThreeBet = false;
  if (heroFirstRaise) {
    const opponentReraise = aggressiveActions.find(
      (a) => a.player?.userId !== userId && a.actionIndex > heroFirstRaise.actionIndex
    );
    if (opponentReraise) {
      const heroResponse = heroActions.find((a) => a.actionIndex > opponentReraise.actionIndex);
      if (heroResponse) {
        foldToThreeBetOpportunity = true;
        foldToThreeBet = heroResponse.action === "FOLD";
      }
    }
  }

  let stealOpportunity = false;
  let stealAttempt = false;
  let foldBbToStealOpportunity = false;
  let foldBbToSteal = false;

  const heroFirstAction = heroActions[0];
  const stealSeatSet = new Set<number>();
  if (positions) {
    stealSeatSet.add(positions.buttonSeat);
    stealSeatSet.add(positions.sbSeat);
    if (positions.coSeat != null) stealSeatSet.add(positions.coSeat);
  }

  if (positions && heroFirstAction && stealSeatSet.has(heroSeat)) {
    const hadPriorVoluntaryAction = preflopVoluntaryActions.some(
      (a) => a.player?.userId !== userId && a.actionIndex < heroFirstAction.actionIndex
    );
    if (!hadPriorVoluntaryAction) {
      stealOpportunity = true;
      stealAttempt = PREFLOP_AGGRESSIVE_ACTIONS.has(heroFirstAction.action);
    }
  }

  if (positions && heroSeat === positions.bbSeat) {
    const firstAggressiveAction = aggressiveActions[0];
    const hadPriorVoluntaryActionBeforeOpen = firstAggressiveAction
      ? preflopVoluntaryActions.some((a) => a.actionIndex < firstAggressiveAction.actionIndex)
      : false;
    if (
      firstAggressiveAction &&
      !hadPriorVoluntaryActionBeforeOpen &&
      firstAggressiveAction.player?.userId !== userId &&
      stealSeatSet.has(firstAggressiveAction.seat)
    ) {
      const heroResponse = heroActions.find((a) => a.actionIndex > firstAggressiveAction.actionIndex);
      if (heroResponse) {
        foldBbToStealOpportunity = true;
        foldBbToSteal = heroResponse.action === "FOLD";
      }
    }
  }

  return {
    vpip: heroVoluntaryActions.length > 0,
    pfr: heroVoluntaryActions.some((a) => a.action === "RAISE" || a.action === "ALL_IN"),
    threeBetOpportunity,
    threeBet,
    foldToThreeBetOpportunity,
    foldToThreeBet,
    stealOpportunity,
    stealAttempt,
    foldBbToStealOpportunity,
    foldBbToSteal,
  };
}

function encodeHistoryCursor(hand: { createdAt: Date; id: string }): string {
  return `${hand.createdAt.toISOString()}${HISTORY_CURSOR_SEPARATOR}${hand.id}`;
}

async function decodeHistoryCursor(
  cursor: string | undefined,
): Promise<{ createdAt: Date; id: string } | null> {
  if (!cursor) return null;

  if (cursor.includes(HISTORY_CURSOR_SEPARATOR)) {
    const [createdAtIso, id] = cursor.split(HISTORY_CURSOR_SEPARATOR);
    if (!createdAtIso || !id) return null;
    const createdAt = new Date(createdAtIso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  }

  // Backward compatibility for legacy id-only cursors.
  const prisma = getPrisma();
  const row = await prisma.hand.findUnique({
    where: { id: cursor },
    select: { id: true, createdAt: true },
  });
  if (!row) return null;
  return { id: row.id, createdAt: row.createdAt };
}

// GET /api/history/overview
router.get("/overview", async (req, res) => {
  try {
    const prisma = getPrisma();
    const userId = req.user!.id;
    logger.info({ authedUserId: userId }, "/overview authed user");

    const hands = await prisma.hand.findMany({
      where: {
        endedAt: { not: null },
        players: {
          some: {
            player: { userId },
          },
        },
      },
      select: {
        reason: true,
        bigBlindCents: true,
        dealerSeat: true,
        table: {
          select: {
            maxSeats: true,
          },
        },
        players: {
          select: {
            seat: true,
            startingStackCents: true,
            endingStackCents: true,
            player: { select: { userId: true } },
          },
        },
        payouts: {
          select: {
            amountCents: true,
            player: { select: { userId: true } },
          },
        },
        actions: {
          where: {
            street: "PREFLOP",
          },
          select: {
            action: true,
            actionIndex: true,
            amountCents: true,
            seat: true,
            player: { select: { userId: true } },
          },
        },
      },
    });

    logger.info({ authedUserId: userId, overviewRawCount: hands.length }, "/overview query result");

    let totalHands = 0;
    let totalProfitCents = 0;
    let totalProfitBb = 0;
    let winningHands = 0;
    let losingHands = 0;
    let breakEvenHands = 0;
    let totalPotCents = 0;
    let biggestPotCents = 0;
    let biggestWinCents = 0;
    let biggestLossCents = 0;
    let grossWonCents = 0;
    let grossLostCents = 0;
    let showdownHands = 0;
    let vpipHands = 0;
    let pfrHands = 0;
    let threeBetOpportunities = 0;
    let threeBetHands = 0;
    let foldToThreeBetOpportunities = 0;
    let foldToThreeBetHands = 0;
    let stealOpportunities = 0;
    let stealAttempts = 0;
    let foldBbToStealOpportunities = 0;
    let foldBbToStealHands = 0;

    for (const hand of hands) {
      const hero = hand.players.find((hp) => hp.player?.userId === userId);
      if (!hero) continue;
      totalHands += 1;
      const endingStack = hero.endingStackCents ?? hero.startingStackCents;
      const netResult = endingStack - hero.startingStackCents;
      const potCents = hand.payouts.reduce((sum, payout) => sum + payout.amountCents, 0);

      totalProfitCents += netResult;
      if (netResult > 0) {
        winningHands += 1;
        grossWonCents += netResult;
      } else if (netResult < 0) {
        losingHands += 1;
        grossLostCents += Math.abs(netResult);
      } else {
        breakEvenHands += 1;
      }

      totalPotCents += potCents;
      if (potCents > biggestPotCents) biggestPotCents = potCents;
      if (netResult > biggestWinCents) biggestWinCents = netResult;
      if (netResult < biggestLossCents) biggestLossCents = netResult;

      if (hand.reason === "SHOWDOWN") showdownHands += 1;

      const bb = hand.bigBlindCents > 0 ? hand.bigBlindCents : 0;
      if (bb > 0) {
        totalProfitBb += netResult / bb;
      }

      const preflopHeroStats = getPreflopHeroActionStats({
        actions: hand.actions,
        userId,
        heroSeat: hero.seat,
        occupiedSeats: hand.players.map((p) => p.seat),
        dealerSeat: hand.dealerSeat,
        maxSeats: hand.table.maxSeats,
      });
      if (preflopHeroStats.vpip) vpipHands += 1;
      if (preflopHeroStats.pfr) pfrHands += 1;
      if (preflopHeroStats.threeBetOpportunity) threeBetOpportunities += 1;
      if (preflopHeroStats.threeBet) threeBetHands += 1;
      if (preflopHeroStats.foldToThreeBetOpportunity) foldToThreeBetOpportunities += 1;
      if (preflopHeroStats.foldToThreeBet) foldToThreeBetHands += 1;
      if (preflopHeroStats.stealOpportunity) stealOpportunities += 1;
      if (preflopHeroStats.stealAttempt) stealAttempts += 1;
      if (preflopHeroStats.foldBbToStealOpportunity) foldBbToStealOpportunities += 1;
      if (preflopHeroStats.foldBbToSteal) foldBbToStealHands += 1;
    }

    const winRate = totalHands > 0 ? (winningHands / totalHands) * 100 : 0;
    const avgPotCents = totalHands > 0 ? totalPotCents / totalHands : 0;
    const avgProfitPerHandCents = totalHands > 0 ? totalProfitCents / totalHands : 0;
    const bbPer100 = totalHands > 0 ? (totalProfitBb / totalHands) * 100 : 0;
    const showdownRate = totalHands > 0 ? (showdownHands / totalHands) * 100 : 0;
    const vpipPct = totalHands > 0 ? (vpipHands / totalHands) * 100 : 0;
    const pfrPct = totalHands > 0 ? (pfrHands / totalHands) * 100 : 0;
    const threeBetPct = threeBetOpportunities > 0 ? (threeBetHands / threeBetOpportunities) * 100 : 0;
    const foldToThreeBetPct =
      foldToThreeBetOpportunities > 0 ? (foldToThreeBetHands / foldToThreeBetOpportunities) * 100 : 0;
    const stealAttemptPct = stealOpportunities > 0 ? (stealAttempts / stealOpportunities) * 100 : 0;
    const foldBbToStealPct =
      foldBbToStealOpportunities > 0 ? (foldBbToStealHands / foldBbToStealOpportunities) * 100 : 0;
    const profitFactor = grossLostCents > 0 ? grossWonCents / grossLostCents : null;

    res.json({
      totalHands,
      totalProfitCents,
      winningHands,
      losingHands,
      breakEvenHands,
      winRate,
      avgProfitPerHandCents,
      bbPer100,
      avgPotCents,
      biggestPotCents,
      biggestWinCents,
      biggestLossCents,
      showdownHands,
      showdownRate,
      vpipHands,
      vpipPct,
      pfrHands,
      pfrPct,
      threeBetHands,
      threeBetOpportunities,
      threeBetPct,
      foldToThreeBetHands,
      foldToThreeBetOpportunities,
      foldToThreeBetPct,
      stealAttempts,
      stealOpportunities,
      stealAttemptPct,
      foldBbToStealHands,
      foldBbToStealOpportunities,
      foldBbToStealPct,
      grossWonCents,
      grossLostCents,
      profitFactor,
    });
  } catch (error) {
    console.error("Error fetching history overview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/history/hands?cursor=&limit=
router.get("/hands", async (req, res) => {
  try {
    const parsed = HandsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }

    const { cursor, limit } = parsed.data;
    const decodedCursor = await decodeHistoryCursor(cursor);
    const prisma = getPrisma();
    const userId = req.user!.id;
    logger.info({ authedUserId: userId, cursor, limit }, "/hands authed user and query");

    const skipCursorForTesting = process.env.SKIP_HISTORY_CURSOR === "true";

    // Core security: Only return hands involving the authenticated user (same where as /overview)
    const hands = await prisma.hand.findMany({
      where: {
        endedAt: { not: null },
        players: {
          some: {
            player: { userId },
          },
        },
        ...(skipCursorForTesting || !decodedCursor
          ? {}
          : {
              OR: [
                { createdAt: { lt: decodedCursor.createdAt } },
                {
                  AND: [{ createdAt: decodedCursor.createdAt }, { id: { lt: decodedCursor.id } }],
                },
              ],
            }),
      },
      select: {
        id: true,
        createdAt: true,
        table: {
          select: {
            name: true,
          },
        },
        bigBlindCents: true,
        players: {
          select: {
            startingStackCents: true,
            endingStackCents: true,
            player: { select: { userId: true } },
          },
        },
        payouts: {
          select: {
            amountCents: true,
            player: { select: { userId: true } },
          },
        },
        actions: {
          select: {
            action: true,
            street: true,
            amountCents: true,
            actionIndex: true,
            player: { select: { userId: true } },
          },
          orderBy: { actionIndex: "desc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    logger.info({ handsFoundDb: hands.length }, "/hands db result");

    const handIds = hands.map((h) => h.id);
    let handIdsWithReplay = new Set<string>();
    try {
      const replayRows = await prisma.tableSnapshotLog.findMany({
        where: {
          handId: { in: handIds },
          payloadJson: { path: "$.hero.userId", equals: "SYSTEM" },
        },
        select: { handId: true },
      });
      handIdsWithReplay = new Set(
        replayRows.map((r) => r.handId).filter((id): id is string => id != null)
      );
    } catch (err) {
      logger.warn({ err, handCount: handIds.length }, "/hands hasReplay query failed; defaulting to empty set");
    }

    const handListItems = hands.map(hand => {
      const heroPlayer = hand.players.find((hp) => hp.player?.userId === userId);
      if (!heroPlayer) {
        logger.warn({ handId: hand.id, userId }, "hands list: no hero player for hand, skipping");
        return null;
      }

      const heroPayouts = hand.payouts.filter((p) => p.player?.userId === userId);
      const heroPayout = heroPayouts[0]?.amountCents ?? 0;
      const endingStack = heroPlayer.endingStackCents ?? heroPlayer.startingStackCents;
      const netResult = endingStack - heroPlayer.startingStackCents;

      const potCents = hand.payouts.reduce((sum, payout) => sum + payout.amountCents, 0);

      const heroActions = hand.actions.filter((a) => a.player?.userId === userId);
      const lastHeroAction = heroActions[0];
      let heroActionSummary = "";
      if (lastHeroAction) {
        if (lastHeroAction.action === "FOLD") {
          heroActionSummary = `Folded ${lastHeroAction.street.toLowerCase()}`;
        } else if (lastHeroAction.action === "CALL") {
          heroActionSummary = `Called ${lastHeroAction.street.toLowerCase()}`;
        } else if (lastHeroAction.action === "BET" || lastHeroAction.action === "RAISE") {
          heroActionSummary = `${lastHeroAction.action} ${lastHeroAction.street.toLowerCase()}`;
        } else if (lastHeroAction.action === "ALL_IN") {
          heroActionSummary = `All-in on ${lastHeroAction.street.toLowerCase()}`;
        }
      } else if (heroPayout > 0) {
        heroActionSummary = "Won at showdown";
      }

      return {
        id: hand.id,
        playedAt: hand.createdAt,
        tableName: hand.table.name,
        netResultCents: netResult,
        bigBlindCents: hand.bigBlindCents,
        heroWonCents: potCents,
        heroActionSummary: heroActionSummary || undefined,
        hasReplay: handIdsWithReplay.has(hand.id),
      };
    }).filter(Boolean); // Filter out null entries

    if (hands.length > 0 && handListItems.length === 0) {
      logger.warn(
        { handsFromDb: hands.length, userId, sampleHandIds: hands.slice(0, 3).map((h) => h.id) },
        "/hands post-filter: all hands dropped (no hero player match)"
      );
    }
    logger.info({ handsReturned: handListItems.length }, "/hands response count");

    const nextCursor = hands.length === limit ? encodeHistoryCursor(hands[hands.length - 1]) : null;
    const payload = { hands: handListItems, nextCursor };
    res.json(payload);
  } catch (error) {
    console.error("Error fetching hand history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/history/hands/:id
router.get("/hands/:id", async (req, res) => {
  try {
    const parsed = HandIdSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid hand ID", details: parsed.error.flatten() });
      return;
    }

    const { id } = parsed.data;
    const prisma = getPrisma();
    const userId = req.user!.id;

    const hand = await prisma.hand.findFirst({
      where: {
        id,
        endedAt: { not: null },
        // Security: Only if user participated in this hand
        players: {
          some: {
            player: { userId },
          },
        },
      },
      select: {
        id: true,
        boardJson: true,
        bigBlindCents: true,
        reason: true,
        players: {
          select: {
            playerId: true,
            player: {
              select: {
                userId: true,
                displayName: true,
              },
            },
            seat: true,
            startingStackCents: true,
            endingStackCents: true,
            holeCardsJson: true,
          },
        },
        actions: {
          orderBy: {
            actionIndex: "asc",
          },
          select: {
            street: true,
            action: true,
            amountCents: true,
            player: {
              select: {
                userId: true,
                displayName: true,
              },
            },
          },
        },
        payouts: {
          select: {
            amountCents: true,
            player: {
              select: {
                userId: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!hand) {
      res.status(404).json({ error: "Hand not found" });
      return;
    }

    // Process board cards
    const boardCards = hand.boardJson as string[] || [];

    // Process players with hole card privacy rules
    const players = hand.players.map((player) => {
      let holeCards: string[] | undefined;
      
      if (player.player.userId === userId) {
        // Hero: always include hole cards
        holeCards = player.holeCardsJson as string[] || undefined;
      } else {
        // Opponents: only at showdown unless learning reveal enabled
        const isShowdown = hand.reason === "SHOWDOWN";
        if (isShowdown || ENABLE_LEARNING_REVEAL) {
          holeCards = player.holeCardsJson as string[] || undefined;
        }
      }

      return {
        userId: player.player.userId ?? player.playerId,
        displayName: player.player.displayName,
        seat: player.seat,
        holeCards,
        finalStack: player.endingStackCents ?? player.startingStackCents,
      };
    });

    // Process actions
    const actions = hand.actions.map((action) => ({
      street: action.street,
      actorUserId: action.player.userId,
      actorDisplayName: action.player.displayName,
      action: action.action,
      amountCents: action.amountCents,
    }));

    // Process payouts
    const payouts = hand.payouts.map((payout) => ({
      userId: payout.player.userId,
      displayName: payout.player.displayName,
      amountCents: payout.amountCents,
    }));

    const snapshots = await ReplayFrameService.getFramesForHand(hand.id);

    res.json({
      id: hand.id,
      snapshots,
      boardCards,
      bigBlindCents: hand.bigBlindCents,
      reason: hand.reason,
      players,
      actions,
      payouts,
    });
  } catch (error) {
    console.error("Error fetching hand detail:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export const handHistoryRouter = router;
