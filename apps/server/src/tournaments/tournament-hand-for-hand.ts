import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import { logger } from "../lib/logger.js";
import { getPayoutSlots } from "./tournament-payouts.js";
import { HAND_FOR_HAND_BUBBLE_BUFFER } from "./tournament.constants.js";

/** Hooks the calling table's own room provides for holding/releasing itself. */
export type HandForHandHooks = {
  /** Block this room from dealing its next hand (mirrors the table-break/tournament-finished flags). */
  onHold: () => void;
  /** Clear this room's own hold and kick its drive loop so it deals immediately. */
  onRelease: () => void;
};

type LiveTableRow = { id: string; roomId: string | null; handForHandReady: boolean };

/**
 * Hand-for-hand near the money bubble (MTT proposal Phase 4): once the remaining field is close
 * enough to the paid places, every live table finishes its current hand and then holds instead of
 * dealing the next one, so no table can play extra hands relative to another right at the bubble
 * (standard live-tournament floor procedure). Once every live OPEN table has reported ready, all
 * are released to deal simultaneously.
 *
 * Extends TournamentTableReconciler.reconcileAfterHand the same way table balancing does: every
 * decision is made from a single table's own post-hand pass (always between hands, since the
 * reconciler only runs at street === WAITING). The only cross-room call is the one-directional
 * "you're released, go deal" call made to every OTHER table once this pass detects all are ready.
 */
export class TournamentHandForHand {
  /** Returns whether hand-for-hand is active for this tournament after this pass. */
  async reconcileAfterHand(
    tournamentId: string,
    myTournamentTableId: string,
    remainingRegistrationCount: number,
    hooks: HandForHandHooks,
  ): Promise<{ active: boolean }> {
    const prisma = getPrisma();
    const liveTables = await this.loadLiveOpenTables(tournamentId);
    if (liveTables.length <= 1) {
      // No cross-table pace to synchronize with a single (or zero) live table -- clear any stale
      // state left over from a break that just reduced the tournament down to one table.
      await this.deactivateIfActive(tournamentId);
      return { active: false };
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { handForHandActive: true },
    });
    if (!tournament) return { active: false };

    if (!tournament.handForHandActive) {
      const shouldActivate = await this.shouldActivate(tournamentId, remainingRegistrationCount);
      if (!shouldActivate) return { active: false };
      await prisma.tournament.update({ where: { id: tournamentId }, data: { handForHandActive: true } });
      logger.info({ tournamentId, remainingRegistrationCount }, "TOURNAMENT_HAND_FOR_HAND_ACTIVATED");
    }

    await prisma.tournamentTable.update({
      where: { id: myTournamentTableId },
      data: { handForHandReady: true },
    });
    hooks.onHold();

    const refreshed = await this.loadLiveOpenTables(tournamentId);
    const allReady = refreshed.every((t) => t.handForHandReady);
    if (!allReady) return { active: true };

    const released = await this.releaseAll(tournamentId, myTournamentTableId, refreshed, hooks);
    return { active: !released };
  }

  private async loadLiveOpenTables(tournamentId: string): Promise<LiveTableRow[]> {
    const tables = await getPrisma().tournamentTable.findMany({
      where: { tournamentId, status: "OPEN" },
      select: { id: true, roomId: true, handForHandReady: true },
    });
    return tables.filter((t) => t.roomId != null);
  }

  private async shouldActivate(tournamentId: string, remainingRegistrationCount: number): Promise<boolean> {
    if (remainingRegistrationCount <= 1) return false;
    const humanEntrantCount = await getPrisma().tournamentRegistration.count({
      where: { tournamentId, isBot: false },
    });
    const paidPlaces = getPayoutSlots(humanEntrantCount).length;
    return remainingRegistrationCount <= paidPlaces + HAND_FOR_HAND_BUBBLE_BUFFER;
  }

  private async deactivateIfActive(tournamentId: string): Promise<void> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { handForHandActive: true },
    });
    if (!tournament?.handForHandActive) return;
    await prisma.tournamentTable.updateMany({ where: { tournamentId }, data: { handForHandReady: false } });
    await prisma.tournament.update({ where: { id: tournamentId }, data: { handForHandActive: false } });
  }

  /**
   * CAS-guarded release: only the pass that wins the `handForHandActive: true -> false` flip
   * actually resets table flags and broadcasts the release. A losing pass (another table's
   * post-hand reconcile observing "all ready" at nearly the same instant) is a no-op here --
   * harmless, since the winner's broadcast already reaches every table including the loser's.
   */
  private async releaseAll(
    tournamentId: string,
    myTournamentTableId: string,
    liveTables: LiveTableRow[],
    hooks: HandForHandHooks,
  ): Promise<boolean> {
    const prisma = getPrisma();
    const claim = await prisma.tournament.updateMany({
      where: { id: tournamentId, handForHandActive: true },
      data: { handForHandActive: false },
    });
    if (claim.count === 0) return false;

    await prisma.tournamentTable.updateMany({
      where: { tournamentId, status: "OPEN" },
      data: { handForHandReady: false },
    });
    logger.info({ tournamentId, tableCount: liveTables.length }, "TOURNAMENT_HAND_FOR_HAND_RELEASED");

    for (const table of liveTables) {
      if (table.id === myTournamentTableId) {
        hooks.onRelease();
        continue;
      }
      try {
        await matchMaker.remoteRoomCall(table.roomId!, "releaseHandForHandHold" as never, [], 30_000);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId,
            tournamentTableId: table.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_HAND_FOR_HAND_RELEASE_CALL_FAILED",
        );
      }
    }
    return true;
  }
}

export const tournamentHandForHand = new TournamentHandForHand();
