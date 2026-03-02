import express from "express";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { awardCatalog } from "../awards/awardCatalog.js";
import { awardService } from "../awards/AwardService.js";
import { logger } from "../lib/logger.js";

const router = express.Router();
router.use(requireAuth);

router.get("/catalog", (_req, res) => {
  res.json({ items: awardCatalog.getAll(), version: awardCatalog.version });
});

router.get("/me", async (req, res) => {
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || 100, 100);
  const { items } = await awardService.getUserAwards(userId, { limit });
  const byId = new Map(awardCatalog.getAll().map((e) => [e.id, e]));
  const joined = items
    .map((row) => {
      const entry = byId.get(row.awardId);
      if (!entry) {
        logger.warn({ userId, awardId: row.awardId }, "Award not in catalog, skipping display");
        return null;
      }
      return {
        awardId: row.awardId,
        name: entry.name,
        graphic: entry.graphic,
        tier: entry.tier,
        tierWeight: entry.tierWeight,
        priorityWeight: entry.priorityWeight,
        category: entry.category,
        reason: row.reason,
        earnedAt: row.earnedAt,
        lastEarnedAt: row.lastEarnedAt,
        count: row.count,
        contextType: row.contextType,
        contextId: row.contextId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  joined.sort((a, b) => {
    if (a.tierWeight !== b.tierWeight) return b.tierWeight - a.tierWeight;
    if (a.priorityWeight !== b.priorityWeight) return b.priorityWeight - a.priorityWeight;
    const t = new Date(b.lastEarnedAt).getTime() - new Date(a.lastEarnedAt).getTime();
    if (t !== 0) return t;
    return a.awardId.localeCompare(b.awardId);
  });
  res.json({ items: joined });
});

export const awardsRouter = router;
