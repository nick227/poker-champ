import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { getBlindLevel, getMaxBlindLevel } from "./blind-structure.js";
import { tournamentAbandonExternalRef } from "./tournament.constants.js";
import { isHumanFieldEliminated } from "./tournament-human-field.js";
import { processTournamentFinishResults } from "./tournament-result-processor.js";

export function isAtMaxBlindLevel(structureId: string, currentLevel: number): boolean {
  return currentLevel >= getMaxBlindLevel(structureId);
}

export async function isTournamentHumanFieldEliminated(tournamentId: string): Promise<boolean> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { registrations: { select: { isBot: true, finishPlace: true } } },
  });
  if (!tournament || tournament.status !== "RUNNING") return false;

  const humanRegs = tournament.registrations.filter((r) => !r.isBot);
  if (humanRegs.length === 0) return false;
  return humanRegs.every((r) => r.finishPlace != null);
}

/**
 * When all humans are eliminated, close the event at max blind: refund entries, keep placements, no payouts.
 */
export async function abandonTournamentAtMaxBlind(tournamentId: string, now: Date = new Date()): Promise<boolean> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { registrations: true },
  });
  if (!tournament || tournament.status !== "RUNNING" || !tournament.roomId) return false;
  if (!isAtMaxBlindLevel(tournament.blindStructureId, tournament.currentLevel)) return false;

  const humanRegs = tournament.registrations.filter((r) => !r.isBot);
  if (humanRegs.length === 0) return false;
  if (!humanRegs.every((r) => r.finishPlace != null)) return false;

  const externalRef = tournamentAbandonExternalRef(tournamentId);
  const existing = await prisma.balanceTransaction.findUnique({ where: { externalRef } });
  if (existing) return true;

  await CashierService.processTournamentAbandonRefunds({
    tournamentId,
    externalRef,
  });

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "ABANDONED", finishedAt: now, prizePoolCents: 0 },
  });

  await processTournamentFinishResults(tournamentId);

  const level = getBlindLevel(tournament.blindStructureId, tournament.currentLevel);
  try {
    await matchMaker.remoteRoomCall(
      tournament.roomId,
      "applyTournamentBlinds" as never,
      [
        {
          currentLevel: tournament.currentLevel,
          smallBlindCents: level.smallBlindCents,
          bigBlindCents: level.bigBlindCents,
          anteCents: level.anteCents,
          nextLevelAtTs: 0,
          status: "ABANDONED",
        },
      ],
      10_000,
    );
  } catch (err: unknown) {
    logger.error(
      {
        err,
        tournamentId,
        message: err instanceof Error ? err.message : String(err),
      },
      "TOURNAMENT_ABANDON_OVERLAY_FAILED",
    );
  }

  logger.info({ tournamentId, humanCount: humanRegs.length }, "TOURNAMENT_ABANDONED");
  return true;
}
