import { getPrisma } from "@poker-champ/db";
import { getBotCatalogEntry, listEnabledBotCatalogEntries } from "../engine/bots/BotCatalog.js";

export const TOURNAMENT_BOT_USER_ID_PREFIX = "tournament_bot_";

export function getTournamentBotUserId(catalogBotId: string): string {
  return `${TOURNAMENT_BOT_USER_ID_PREFIX}${catalogBotId}`;
}

export function parseTournamentBotCatalogId(userId: string): string | null {
  if (!userId.startsWith(TOURNAMENT_BOT_USER_ID_PREFIX)) return null;
  const catalogBotId = userId.slice(TOURNAMENT_BOT_USER_ID_PREFIX.length);
  return catalogBotId.length > 0 ? catalogBotId : null;
}

export function isTournamentBotUserId(userId: string): boolean {
  return parseTournamentBotCatalogId(userId) != null;
}

export async function ensureTournamentBotUsers(catalogBotIds: string[]): Promise<void> {
  const prisma = getPrisma();
  const uniqueIds = [...new Set(catalogBotIds)];

  for (const catalogBotId of uniqueIds) {
    const bot = getBotCatalogEntry(catalogBotId);
    if (!bot) continue;

    const userId = getTournamentBotUserId(catalogBotId);
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@tournament-bot.local`,
        passwordHash: "tournament_bot",
        displayName: bot.name,
        role: "USER",
        bankrollCents: 0,
      },
      update: {
        displayName: bot.name,
      },
    });
  }
}

export function listTournamentFillBotCatalogIds(limit: number): string[] {
  const enabled = listEnabledBotCatalogEntries();
  if (enabled.length === 0 || limit <= 0) return [];

  const ids: string[] = [];
  for (let i = 0; i < limit; i++) {
    ids.push(enabled[i % enabled.length]!.id);
  }
  return ids;
}
