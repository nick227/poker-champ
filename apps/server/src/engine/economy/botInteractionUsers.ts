import { getPrisma } from "@poker-champ/db";

/**
 * Cash-table bots have no backing User row at all — PlayerState.userId is "" (see
 * PlayerLifecycleService.addBot), and hand settlement never touches CashierService/
 * bankrollCents for anyone, bot or human (pot money lives entirely in the live table
 * stack). Gifts/side-bets move User.bankrollCents, and PlayerInteraction.initiatorId/
 * recipientId are real FK columns — a bot recipient needs a real User row or the FK
 * insert fails outright.
 *
 * This lazily upserts one, keyed by the bot's runtime seat id (the same id already used
 * as `opponent.id`/`recipientUserId` end to end), the first time that specific bot is
 * targeted. Known trade-off: this is one row per bot-add-and-interact, not one per
 * catalog bot (tournament-bot-users.ts's stable-id approach) — simplest option that reuses
 * the existing FK/CashierService/PlayerInteraction machinery unchanged, at the cost of an
 * orphaned User row accumulating per bot that's ever gifted/bet with and later removed.
 * Flagged here rather than fixed silently; revisit if bot interaction volume makes the
 * accumulation a real concern.
 */
export async function ensureCashTableBotUser(botId: string, botName: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.user.upsert({
    where: { id: botId },
    create: {
      id: botId,
      email: `${botId}@cash-bot.local`,
      passwordHash: "cash_bot",
      displayName: botName,
      role: "USER",
      bankrollCents: 0,
    },
    update: {
      displayName: botName,
    },
  });
}
