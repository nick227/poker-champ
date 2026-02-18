import express from "express";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import {
  LeaderboardAggregationService,
  type LeaderboardCategory,
  type LeaderboardPeriod,
} from "../engine/persistence/LeaderboardAggregationService.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

const QuerySchema = z.object({
  period: z.enum(["daily", "weekly", "all_time"]).default("weekly"),
  category: z.enum([
    "biggest_winner",
    "biggest_donor",
    "showdown_sniper",
    "all_in_maniac",
    "ice_cold",
    "heater",
    "tight_rock",
    "action_junkie",
  ]),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
    return;
  }

  const { period, category, limit } = parsed.data;

  try {
    const snapshot = await LeaderboardAggregationService.readLatestSnapshot({
      period: period as LeaderboardPeriod,
      category: category as LeaderboardCategory,
      limit,
    });

    res.json({
      period,
      category,
      computedAt: snapshot.computedAt,
      totalEntries: snapshot.totalEntries,
      entries: snapshot.entries,
    });
  } catch (error) {
    logger.error({ error }, "Error reading leaderboard snapshot");
    res.status(500).json({ error: "Internal server error" });
  }
});

export const leaderboardRouter = router;
