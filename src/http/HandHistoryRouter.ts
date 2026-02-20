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

router.use(requireAuth);

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
        players: {
          where: { player: { userId } },
          select: {
            startingStackCents: true,
            endingStackCents: true,
          },
          take: 1,
        },
        payouts: {
          where: { player: { userId } },
          select: {
            amountCents: true,
          },
        },
      },
    });

    const totalHands = hands.length;
    let totalProfitCents = 0;
    let winningHands = 0;
    let totalPotCents = 0;
    let biggestPotCents = 0;

    for (const hand of hands) {
      const hero = hand.players[0];
      if (!hero) continue;
      const endingStack = hero.endingStackCents ?? hero.startingStackCents;
      const netResult = endingStack - hero.startingStackCents;
      const potCents = hand.payouts.reduce((sum, payout) => sum + payout.amountCents, 0);

      totalProfitCents += netResult;
      if (netResult > 0) winningHands += 1;
      totalPotCents += potCents;
      if (potCents > biggestPotCents) biggestPotCents = potCents;
    }

    const winRate = totalHands > 0 ? (winningHands / totalHands) * 100 : 0;
    const avgPotCents = totalHands > 0 ? totalPotCents / totalHands : 0;

    res.json({
      totalHands,
      totalProfitCents,
      winningHands,
      winRate,
      avgPotCents,
      biggestPotCents,
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

    logger.info({ userId, cursor, limit }, '/hands query starting');

    // Core security: Only return hands involving the authenticated user
    const hands = await prisma.hand.findMany({
      where: {
        endedAt: { not: null },
        // Security guardrail: Only hands where user participated
        players: {
          some: {
            player: { userId },
          },
        },
        // Cursor-based pagination
        ...(decodedCursor && {
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

    logger.info({ userId, handsFound: hands.length }, '/hands query result');

    // Transform data to match interface (pick hero by userId; Prisma nested where can miss when multiple relations are filtered)
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
      };
    }).filter(Boolean); // Filter out null entries

    // Return cursor for next page (last hand createdAt + id)
    const nextCursor = hands.length === limit ? encodeHistoryCursor(hands[hands.length - 1]) : null;

    res.json({
      hands: handListItems,
      nextCursor,
    });
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
