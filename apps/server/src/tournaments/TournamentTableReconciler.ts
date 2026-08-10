import { getPrisma } from "@poker-champ/db";
import type { PokerState } from "../state/PokerState.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { getBlindLevel } from "./blind-structure.js";
import type { TournamentTableOverlay } from "./tournament-overlay.js";
import { processTournamentFinishResults } from "./tournament-result-processor.js";
import {
  countTournamentSurvivorsWithChips,
  resolveTournamentWinnerUserId,
} from "./tournament-finish-resolution.js";
import { canRebuyTournament } from "./tournament-schedule.js";
import {
  countRebuyPendingRegistrations,
  countTournamentRebuysForUser,
  sweepExpiredRebuyPendingPlayers,
} from "./tournament-rebuy.js";
import { tournamentTableBalancer } from "./tournament-table-balancer.js";
import { tournamentHandForHand } from "./tournament-hand-for-hand.js";

export type TournamentReconcileContext = {
  tournamentId: string;
  tableId: string;
  roomId: string;
  state: PokerState;
  tableName: string;
  removeBustedPlayer: (userId: string) => Promise<void>;
  removePlayerForTableTransfer: (userId: string, destinationTableNumber?: number) => Promise<number | null>;
  onOverlayUpdated: (overlay: TournamentTableOverlay | null) => void;
  onPlayEnded: () => void;
  onTableBreaking: () => void;
  onHandForHandHold: () => void;
  onHandForHandRelease: () => void;
  emitSnapshot?: () => Promise<void>;
};

export { countTournamentSurvivorsWithChips };

export class TournamentTableReconciler {
  async reconcileAfterHand(ctx: TournamentReconcileContext): Promise<void> {
    if (ctx.state.street !== "WAITING") return;

    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: ctx.tournamentId },
      include: {
        registrations: {
          include: { user: { select: { displayName: true } } },
        },
      },
    });

    if (!tournament || tournament.status !== "RUNNING") {
      if (tournament?.status === "FINISHED" || tournament?.status === "ABANDONED") {
        await processTournamentFinishResults(ctx.tournamentId);
        ctx.onPlayEnded();
      }
      return;
    }

    const myTable = await prisma.tournamentTable.findFirst({
      where: { tournamentId: ctx.tournamentId, roomId: ctx.roomId },
      select: { id: true, tableNumber: true },
    });

    const level = getBlindLevel(tournament.blindStructureId, tournament.currentLevel);
    ctx.onOverlayUpdated({
      tournamentId: tournament.id,
      status: tournament.status,
      currentLevel: tournament.currentLevel,
      smallBlindCents: level.smallBlindCents,
      bigBlindCents: level.bigBlindCents,
      anteCents: level.anteCents,
      nextLevelAtTs: tournament.nextLevelAt?.getTime() ?? null,
      playFormat: tournament.playFormat as "FREEZEOUT" | "REBUY",
      ...(myTable ? { tableNumber: myTable.tableNumber } : {}),
    });

    const now = new Date();
    await sweepExpiredRebuyPendingPlayers(ctx.tournamentId, tournament, now);

    const refreshedAfterSweep = await prisma.tournament.findUnique({
    where: { id: ctx.tournamentId },
    include: {
      registrations: {
        include: { user: { select: { displayName: true } } },
      },
    },
  });
  if (!refreshedAfterSweep || refreshedAfterSweep.status !== "RUNNING") return;

    for (const player of ctx.state.playersById.values()) {
      if (player.stackCents > 0) continue;

      const registration = refreshedAfterSweep.registrations.find((r) => r.userId === player.id);
      if (!registration || registration.finishPlace != null || registration.rebuyPendingAt != null) {
        continue;
      }

      const rebuyCount = await countTournamentRebuysForUser(ctx.tournamentId, player.id);
      const rebuyEligible =
        !registration.isBot &&
        refreshedAfterSweep.playFormat === "REBUY" &&
        canRebuyTournament(refreshedAfterSweep, { rebuyCount }, now);

      await CashierService.forfeitTournamentTableBalance({
        userId: player.id,
        tableId: ctx.tableId,
        tournamentId: ctx.tournamentId,
        externalRef: `tournament_bust_${ctx.tournamentId}_${player.id}`,
        tableMeta: { name: ctx.tableName },
      });

      if (rebuyEligible) {
        await prisma.tournamentRegistration.update({
          where: { tournamentId_userId: { tournamentId: ctx.tournamentId, userId: player.id } },
          data: { rebuyPendingAt: now, eliminatedAt: null },
        });
        logger.info(
          { tournamentId: ctx.tournamentId, userId: player.id, rebuyCount },
          "TOURNAMENT_PLAYER_REBUY_PENDING",
        );
      } else {
        const pendingCount = await prisma.tournamentRegistration.count({
          where: { tournamentId: ctx.tournamentId, finishPlace: null },
        });
        await prisma.tournamentRegistration.update({
          where: { tournamentId_userId: { tournamentId: ctx.tournamentId, userId: player.id } },
          data: {
            finishPlace: pendingCount,
            eliminatedAt: now,
            rebuyPendingAt: null,
          },
        });
        logger.info(
          { tournamentId: ctx.tournamentId, userId: player.id, finishPlace: pendingCount },
          "TOURNAMENT_PLAYER_ELIMINATED",
        );
      }

      await ctx.removeBustedPlayer(player.id);

      if (ctx.emitSnapshot) {
        await ctx.emitSnapshot();
      }
    }

    const refreshed = await prisma.tournament.findUnique({
      where: { id: ctx.tournamentId },
      include: { registrations: true },
    });
    if (!refreshed || refreshed.status !== "RUNNING") return;

    const registrationRows = refreshed.registrations.map((r) => ({
      userId: r.userId,
      isBot: r.isBot,
      finishPlace: r.finishPlace,
    }));

    const rebuyPendingCount = countRebuyPendingRegistrations(refreshed.registrations);
    const remainingRegistrationCount = refreshed.registrations.filter((r) => r.finishPlace == null).length;
    // Multi-table tournaments (MTT proposal): a table can independently narrow to a single local
    // survivor via ctx.state while other TournamentTable rows still have live players -- ctx.state
    // only reflects THIS table's room, not the whole tournament. Gate winner detection on the
    // tournament-wide remaining-registration count (finishPlace still null) so an N>1 tournament
    // never finishes early just because one table happened to thin out first; the actual winner
    // gets correctly detected once the field has narrowed onto a single table (table balancing
    // consolidates it there) and that table's own next post-hand reconcile runs. For an N=1
    // tournament remainingRegistrationCount always equals this table's own population, so this is
    // a no-op there -- identical to pre-multi-table behavior.
    const winnerId =
      rebuyPendingCount === 0 && remainingRegistrationCount <= 1
        ? resolveTournamentWinnerUserId(ctx.state, registrationRows)
        : null;
    if (winnerId) {
      await prisma.tournamentRegistration.update({
        where: { tournamentId_userId: { tournamentId: ctx.tournamentId, userId: winnerId } },
        data: { finishPlace: 1, eliminatedAt: null, rebuyPendingAt: null },
      });

      await prisma.tournament.update({
        where: { id: ctx.tournamentId },
        data: {
          status: "FINISHED",
          finishedAt: new Date(),
        },
      });

      const humanEntrantCount = await prisma.tournamentRegistration.count({
        where: { tournamentId: ctx.tournamentId, isBot: false },
      });

      await CashierService.processTournamentPayouts({
        tournamentId: ctx.tournamentId,
        humanEntrantCount,
      });

      await processTournamentFinishResults(ctx.tournamentId);

      ctx.onPlayEnded();
      ctx.onOverlayUpdated({
        tournamentId: refreshed.id,
        status: "FINISHED",
        currentLevel: refreshed.currentLevel,
        smallBlindCents: level.smallBlindCents,
        bigBlindCents: level.bigBlindCents,
        anteCents: level.anteCents,
        nextLevelAtTs: null,
        playFormat: refreshed.playFormat as "FREEZEOUT" | "REBUY",
      });

      logger.info({ tournamentId: ctx.tournamentId, winnerId, reason: "human_field_closed" }, "TOURNAMENT_FINISHED");
      if (ctx.emitSnapshot) {
        await ctx.emitSnapshot();
      }
      return;
    }

    if (!myTable) return;

    // Hand-for-hand (Phase 4) takes priority over balancing: once active, tables hold at WAITING
    // synchronized to the bubble, so reshuffling seats mid-hold would fight that synchronization.
    // Balancing resumes normally once hand-for-hand releases (or never activates, the N=1/not-near-
    // the-bubble common case).
    const handForHand = await tournamentHandForHand.reconcileAfterHand(
      ctx.tournamentId,
      myTable.id,
      remainingRegistrationCount,
      { onHold: ctx.onHandForHandHold, onRelease: ctx.onHandForHandRelease },
    );
    if (handForHand.active) return;

    await tournamentTableBalancer.reconcileAfterHand(ctx.tournamentId, myTable.id, {
      removePlayerForTableTransfer: ctx.removePlayerForTableTransfer,
      onTableBreaking: ctx.onTableBreaking,
    });
  }
}

export const tournamentTableReconciler = new TournamentTableReconciler();
