import express from "express";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "../db/prisma.js";

const router = express.Router();

const HandsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default("50"),
});

const HandIdSchema = z.object({
  id: z.string().uuid(),
});

// Feature flag for learning reveal mode
const ENABLE_LEARNING_REVEAL = process.env.ENABLE_LEARNING_REVEAL === "true";

router.use(requireAuth);

// GET /api/history/hands?cursor=&limit=
router.get("/hands", async (req, res) => {
  try {
    const parsed = HandsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }

    const { cursor, limit } = parsed.data;
    const prisma = getPrisma();
    const userId = req.user!.id;

    // Core security: Only return hands involving the authenticated user
    const hands = await prisma.hand.findMany({
      where: {
        // Security guardrail: Only hands where user participated
        players: {
          some: {
            player: {
              userId: userId,
            },
          },
        },
        // Cursor-based pagination
        ...(cursor && { id: { lt: cursor } }),
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
          where: {
            player: {
              userId: userId,
            },
          },
          select: {
            startingStackCents: true,
            endingStackCents: true,
          },
        },
        payouts: {
          where: {
            player: {
              userId: userId,
            },
          },
          select: {
            amountCents: true,
          },
        },
        actions: {
          where: {
            player: {
              userId: userId,
            },
          },
          orderBy: {
            actionIndex: "desc",
          },
          take: 1,
          select: {
            action: true,
            street: true,
            amountCents: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      take: limit,
    });

    // Transform data to match interface
    const handListItems = hands.map(hand => {
      const heroPlayer = hand.players.find((p: any) => p.player.userId === userId);
      if (!heroPlayer) {
        // Skip hands where user data is corrupted
        return null;
      }
      
      const heroPayout = hand.payouts.reduce((sum: number, payout: any) => sum + payout.amountCents, 0);
      const netResult = (heroPlayer?.endingStackCents || 0) - (heroPlayer?.startingStackCents || 0);
      
      // Calculate actual pot size from total payouts
      const potCents = hand.payouts.reduce((sum: number, payout: any) => sum + payout.amountCents, 0);
      
      // Generate hero action summary
      const heroActions = hand.actions.filter((action: any) => action.player.userId === userId);
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
          heroActionSummary = `Lost all-in on ${lastHeroAction.street.toLowerCase()}`;
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
        potCents: potCents,
        heroActionSummary: heroActionSummary || undefined,
      };
    }).filter(Boolean); // Filter out null entries

    // Return cursor for next page (last hand ID)
    const nextCursor = hands.length === limit ? hands[hands.length - 1].id : null;

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
        // Security: Only if user participated in this hand
        players: {
          some: {
            player: {
              userId: userId,
            },
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
    const players = hand.players.map((player: any) => {
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
        userId: player.player.userId,
        displayName: player.player.displayName,
        seat: player.seat,
        holeCards,
        finalStack: player.endingStackCents || player.startingStackCents,
      };
    });

    // Process actions
    const actions = hand.actions.map((action: any) => ({
      street: action.street,
      actorUserId: action.player.userId,
      actorDisplayName: action.player.displayName,
      action: action.action,
      amountCents: action.amountCents,
    }));

    // Process payouts
    const payouts = hand.payouts.map((payout: any) => ({
      userId: payout.player.userId,
      displayName: payout.player.displayName,
      amountCents: payout.amountCents,
    }));

    res.json({
      id: hand.id,
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
