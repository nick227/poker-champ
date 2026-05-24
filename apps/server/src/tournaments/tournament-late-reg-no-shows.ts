import { getPrisma } from "@poker-champ/db";
import { logger } from "../lib/logger.js";

/**
 * At late-registration close, registered humans who never took a seat are eliminated
 * (no-show). Placement uses the same pending-count ordering as table bust-outs.
 */
export async function eliminateLateRegistrationNoShows(
  tournamentId: string,
  seatedHumanUserIds: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<string[]> {
  const prisma = getPrisma();
  const candidates = await prisma.tournamentRegistration.findMany({
    where: {
      tournamentId,
      isBot: false,
      finishPlace: null,
      rebuyPendingAt: null,
    },
    select: { userId: true },
  });

  const eliminated: string[] = [];
  for (const reg of candidates) {
    if (seatedHumanUserIds.has(reg.userId)) continue;

    const pendingCount = await prisma.tournamentRegistration.count({
      where: { tournamentId, finishPlace: null },
    });
    await prisma.tournamentRegistration.update({
      where: { tournamentId_userId: { tournamentId, userId: reg.userId } },
      data: { finishPlace: pendingCount, eliminatedAt: now },
    });
    eliminated.push(reg.userId);
  }

  if (eliminated.length > 0) {
    logger.info({ tournamentId, userIds: eliminated, count: eliminated.length }, "TOURNAMENT_NO_SHOW_ELIMINATED");
  }
  return eliminated;
}
