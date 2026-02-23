import type { PrismaClient } from "@prisma/client";
import { logger } from "../../lib/logger.js";

export class BotStatsService {
  constructor(private readonly prisma: PrismaClient) {}

  async recordHandResult(args: {
    handId: string;
    dealtBotIds: string[];
    deltaByBotId: Record<string, number>;
  }): Promise<void> {
    const dealtBotIds = [...new Set(args.dealtBotIds.filter((id) => typeof id === "string" && id.length > 0))];
    if (dealtBotIds.length === 0) return;

    try {
      const delegate = (this.prisma as unknown as {
        botStats?: {
          upsert: (args: unknown) => Promise<unknown>;
        };
      }).botStats;
      if (!delegate) {
        logger.warn({ handId: args.handId }, "BOT_STATS_DELEGATE_UNAVAILABLE");
        return;
      }

      for (const botId of dealtBotIds) {
        const delta = Number(args.deltaByBotId[botId] ?? 0);
        const won = delta > 0 ? delta : 0;
        const lost = delta < 0 ? -delta : 0;

        await delegate.upsert({
          where: { botId },
          create: {
            botId,
            handsPlayed: 1,
            netCents: BigInt(delta),
            grossWonCents: BigInt(won),
            grossLostCents: BigInt(lost),
          },
          update: {
            handsPlayed: { increment: 1 },
            netCents: { increment: BigInt(delta) },
            grossWonCents: { increment: BigInt(won) },
            grossLostCents: { increment: BigInt(lost) },
          },
        });
      }
    } catch (err) {
      logger.warn(
        {
          err,
          handId: args.handId,
          dealtBotIds,
        },
        "BOT_STATS_RECORD_FAILED",
      );
    }
  }
}
