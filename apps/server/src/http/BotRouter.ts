import express from "express";
import { getPrisma } from "@poker-champ/db";
import { getBotCatalogEntry, listEnabledBotSummaries } from "../engine/bots/BotCatalog.js";

const router = express.Router();

function toCentsNumber(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

router.get("/", (_req, res) => {
  res.json({ bots: listEnabledBotSummaries() });
});

router.get("/:id/stats", async (req, res) => {
  const botId = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!botId) {
    res.status(400).json({ error: "Missing bot id" });
    return;
  }

  const bot = getBotCatalogEntry(botId);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const prisma = getPrisma();
  const row = await prisma.botStats.findUnique({ where: { botId } });

  res.json({
    bot: {
      id: bot.id,
      name: bot.name,
      avatarUrl: bot.avatarUrl,
    },
    stats: {
      botId: bot.id,
      handsPlayed: row?.handsPlayed ?? 0,
      netCents: row ? toCentsNumber(row.netCents) : 0,
      grossWonCents: row ? toCentsNumber(row.grossWonCents) : 0,
      grossLostCents: row ? toCentsNumber(row.grossLostCents) : 0,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    },
  });
});

export const botRouter = router;

